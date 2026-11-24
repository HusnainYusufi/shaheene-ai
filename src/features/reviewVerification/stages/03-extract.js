import * as prompt from '../prompts/extract.v2.js';
import { ExtractionSchema } from '../schemas/extraction.js';
import { scrubPhones } from '../../../utils/arabicText.js';
import { retry } from '../../../utils/retry.js';
import { CODES, reason } from '../reasonCodes.js';

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
  return { model, promptVersion: prompt.VERSION, ...ctx.extraction };
}

export const name = 'extract';
export { run };
