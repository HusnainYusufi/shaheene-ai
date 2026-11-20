'use strict';
const env = require('../../config/env');
const llm = require('../../providers/llm');
const embeddings = require('../../providers/embeddings');
const legendDelivery = require('../../clients/legendDelivery');
const repo = require('./repository');
const { REASONS } = require('./reasonCodes');

const STAGES = [
  require('./stages/01-fetchImage'),
  require('./stages/02-imageHash'),
  require('./stages/03-extract'),
  require('./stages/04-rules'),
  require('./stages/05-textSimilarity'),
  require('./stages/06-classify'),
];
const decideStage = require('./stages/07-decide');

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
 * Runs every stage for one check. A stage may set ctx.stop to skip the rest
 * (exact duplicate, not a review); decide always runs.
 */
async function runPipeline(checkId, deps = defaultDeps) {
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
          reasons: check.signals?.reasons || [],
          extraction: check.extraction,
          classification: check.classification,
          model: check.llm_model,
        }),
      );
      await deps.repo.markReported(check.id);
    }
    return;
  }

  await deps.repo.markRunning(check.id);
  const ctx = {
    check,
    input: check.input,
    reasons: [],
    signals: {},
    promptVersions: {},
    stop: false,
  };

  try {
    for (const stage of STAGES) {
      if (ctx.stop) break;
      await stage.run(ctx, deps);
    }
    ctx.reasons = uniqueReasons(ctx.reasons);
    await decideStage.run(ctx, deps);
  } catch (err) {
    await deps.repo.failCheck(check.id, err.message);
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
    reviewerKey: ctx.reviewerKey || null,
    extraction: ctx.extraction || null,
    classification: ctx.classification || null,
    signals: { ...ctx.signals, reasons: result.reasons },
    llmProvider: deps.llm.name,
    llmModel: ctx.llmModel || null,
    promptVersions: ctx.promptVersions,
  });

  await deps.legendDelivery.writeResult(check.review_id, result);
  await deps.repo.markReported(check.id);
  return result;
}

module.exports = { runPipeline, STAGES };
