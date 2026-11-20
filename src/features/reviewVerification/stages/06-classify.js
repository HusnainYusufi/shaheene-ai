import * as prompt from '../prompts/classify.v2.js';
import { ClassificationSchema } from '../schemas/classification.js';
import { retry } from '../../../utils/retry.js';
import { CODES, reason } from '../reasonCodes.js';

/**
 * LLM judges the text: genuine vs templated, sentiment, and whether it praises
 * Legend Sleep. Only a positive review that praises Legend Sleep can pass.
 */
async function run(ctx, deps) {
  const { reviewText, rating } = ctx.extraction;
  if (!reviewText || !reviewText.trim()) {
    ctx.reasons.push(reason(CODES.NO_REVIEW_TEXT));
    return { skipped: 'no review text' };
  }

  const { data } = await retry(
    (signal) =>
      deps.llm.generateJson({
        system: prompt.system,
        content: [
          { type: 'text', text: prompt.user({ reviewText, rating, similar: ctx.similar || [] }) },
        ],
        schema: ClassificationSchema,
        maxTokens: 2048,
        signal,
      }),
    { retries: 2, timeoutMs: deps.env.LLM_TIMEOUT_MS },
  );

  ctx.classification = data;
  ctx.promptVersions.classify = prompt.VERSION;

  if (data.authenticity === 'templated') {
    ctx.reasons.push(reason(CODES.TEMPLATED_TEXT, { rationale: data.rationale }));
  }
  if (data.sentiment === 'negative') {
    ctx.reasons.push(reason(CODES.NEGATIVE_REVIEW, { sentiment: 'negative' }));
  } else if (data.sentiment !== 'positive' || !data.praisesBusiness) {
    ctx.reasons.push(
      reason(CODES.NOT_POSITIVE, {
        sentiment: data.sentiment,
        praisesBusiness: data.praisesBusiness,
      }),
    );
  }
  return { promptVersion: prompt.VERSION, ...data };
}

export const name = 'classify';
export { run };
