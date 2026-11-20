'use strict';
const prompt = require('../prompts/classify.v1');
const { ClassificationSchema } = require('../schemas/classification');
const { retry } = require('../../../utils/retry');
const { CODES, reason } = require('../reasonCodes');

/** LLM judges the text: genuine vs templated, and sentiment. */
async function run(ctx, deps) {
  const { reviewText, rating } = ctx.extraction;
  if (!reviewText) return;

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
}

module.exports = { name: 'classify', run };
