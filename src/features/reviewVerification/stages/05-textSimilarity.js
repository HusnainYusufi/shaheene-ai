import { normalizeArabic } from '../../../utils/arabicText.js';
import { retry } from '../../../utils/retry.js';
import { CODES, reason } from '../reasonCodes.js';

const MIN_CHARS = 15; // shorter texts ("ممتاز") match everything; the classifier handles them

/** Embeds the review text and compares it with every earlier review (pgvector, cosine). */
async function run(ctx, deps) {
  const text = ctx.extraction.reviewText;
  const textNorm = normalizeArabic(text);
  ctx.similar = [];
  if (textNorm.length < MIN_CHARS) return { skipped: 'text too short' };

  const { vectors, model } = await retry(
    (signal) => deps.embeddings.embed([textNorm], { signal }),
    { retries: 2, timeoutMs: 20_000 },
  );
  const [vector] = vectors;

  const similar = await deps.repo.findSimilarTexts(vector, ctx.input.orderNo, 5);
  await deps.repo.saveEmbedding({
    checkId: ctx.check.id,
    reviewId: ctx.input.reviewId,
    orderNo: ctx.input.orderNo,
    driverId: ctx.input.driverId,
    textNorm,
    model,
    vector,
  });

  ctx.similar = similar.map((s) => ({
    text: s.text_norm,
    similarity: s.similarity,
    reviewId: s.review_id,
  }));
  const output = {
    model,
    matches: similar.map((s) => ({
      reviewId: s.review_id,
      similarity: Number(s.similarity.toFixed(4)),
    })),
  };
  const top = output.matches[0];
  if (top && top.similarity >= deps.env.TEXT_SIMILARITY_REJECT) {
    ctx.reasons.push(reason(CODES.TEXT_DUPLICATE, { similarity: top.similarity }));
  } else if (top && top.similarity >= deps.env.TEXT_SIMILARITY_REVIEW) {
    ctx.reasons.push(reason(CODES.TEXT_SIMILAR, { similarity: top.similarity }));
  }
  return output;
}

export const name = 'textSimilarity';
export { run };
