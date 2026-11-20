'use strict';
const prompt = require('../prompts/extract.v1');
const { ExtractionSchema } = require('../schemas/extraction');
const { scrubPhones } = require('../../../utils/arabicText');
const { retry } = require('../../../utils/retry');
const { CODES, reason } = require('../reasonCodes');

/** Vision LLM reads the screenshot into structured fields. */
async function run(ctx, deps) {
  const { data, model } = await retry(
    (signal) =>
      deps.llm.generateJson({
        system: prompt.system,
        content: [
          { type: 'image', ...ctx.image.llm },
          { type: 'text', text: prompt.user({ submittedAt: ctx.input.submittedAt }) },
        ],
        schema: ExtractionSchema,
        signal,
      }),
    { retries: 2, timeoutMs: deps.env.LLM_TIMEOUT_MS },
  );

  ctx.extraction = { ...data, reviewText: data.reviewText ? scrubPhones(data.reviewText) : null };
  ctx.llmModel = model;
  ctx.promptVersions.extract = prompt.VERSION;

  if (!data.isReviewScreenshot) {
    ctx.reasons.push(reason(CODES.NOT_A_REVIEW));
    ctx.stop = true;
  }
}

module.exports = { name: 'extract', run };
