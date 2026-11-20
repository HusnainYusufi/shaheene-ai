import env from '../../config/env.js';
import llm from '../../providers/llm/index.js';
import embeddings from '../../providers/embeddings/index.js';
import * as legendDelivery from '../../clients/legendDelivery.js';
import * as repo from './repository.js';
import { REASONS } from './reasonCodes.js';
import * as fetchImage from './stages/01-fetchImage.js';
import * as imageHash from './stages/02-imageHash.js';
import * as extract from './stages/03-extract.js';
import * as rules from './stages/04-rules.js';
import * as textSimilarity from './stages/05-textSimilarity.js';
import * as classify from './stages/06-classify.js';
import * as decide from './stages/07-decide.js';

/** Cheap stages first: a duplicate image is rejected before paying for a vision call. */
export const STAGES = [fetchImage, imageHash, extract, rules, textSimilarity, classify, decide];

const defaultDeps = { env, llm, embeddings, legendDelivery, repo };

function uniqueReasons(reasons) {
  const seen = new Map();
  for (const r of reasons) if (!seen.has(r.code)) seen.set(r.code, r);
  return [...seen.values()];
}

const labelled = (reasons) => reasons.map((r) => ({ ...r, label: REASONS[r.code].label }));

/** Shape sent to legend-delivery. No image data, no raw model output. */
function toResult({ checkId, decision, reasons, extraction, classification, model }) {
  return {
    checkId,
    decision,
    reasons,
    extracted: extraction
      ? {
          platform: extraction.platform,
          businessName: extraction.businessName,
          reviewerName: extraction.reviewerName,
          rating: extraction.rating,
          reviewText: extraction.reviewText,
          postedRelative: extraction.postedRelative,
        }
      : null,
    classification: classification || null,
    model: model || null,
  };
}

/**
 * Runs every stage for one check. Each stage reads the shared ctx, pushes
 * reasons, and returns its output, saved as ctx.results[stage.name] = { ms, output }.
 * A stage may set ctx.stop (exact duplicate, not a review): the stages after it
 * are recorded as skipped, but decide always runs.
 */
export async function runPipeline(checkId, deps = defaultDeps) {
  const check = await deps.repo.getCheck(checkId);
  if (!check) throw new Error(`Check ${checkId} not found`);

  // Finished earlier but the write-back failed: only report again.
  if (check.status === 'done') {
    if (!check.reported_at) {
      await deps.legendDelivery.writeResult(
        check.review_id,
        toResult({
          checkId: check.id,
          decision: check.decision,
          reasons: check.reasons,
          extraction: check.extraction,
          classification: check.classification,
          model: check.llm_model,
        }),
      );
      await deps.repo.markReported(check.id);
    }
    return null;
  }

  await deps.repo.markRunning(check.id);
  const ctx = {
    check,
    input: check.input,
    reasons: [],
    results: {},
    promptVersions: {},
    stop: false,
  };

  try {
    for (const stage of STAGES) {
      if (ctx.stop && stage !== decide) {
        ctx.results[stage.name] = { skipped: true };
        continue;
      }
      if (stage === decide) ctx.reasons = uniqueReasons(ctx.reasons);
      const started = Date.now();
      const output = await stage.run(ctx, deps);
      ctx.results[stage.name] = { ms: Date.now() - started, output: output ?? null };
    }
  } catch (err) {
    await deps.repo.failCheck(check.id, err.message, ctx.results);
    throw err; // pg-boss retries with backoff
  }

  const result = toResult({
    checkId: check.id,
    decision: ctx.decision,
    reasons: labelled(ctx.reasons),
    extraction: ctx.extraction,
    classification: ctx.classification,
    model: ctx.llmModel,
  });
  await deps.repo.finishCheck(check.id, {
    decision: ctx.decision,
    reasonCodes: ctx.reasons.map((r) => r.code),
    reasons: result.reasons,
    reviewerKey: ctx.reviewerKey || null,
    extraction: ctx.extraction || null,
    classification: ctx.classification || null,
    llmProvider: deps.llm.name,
    llmModel: ctx.llmModel || null,
    promptVersions: ctx.promptVersions,
    stageResults: ctx.results,
  });

  await deps.legendDelivery.writeResult(check.review_id, result);
  await deps.repo.markReported(check.id);
  return result;
}
