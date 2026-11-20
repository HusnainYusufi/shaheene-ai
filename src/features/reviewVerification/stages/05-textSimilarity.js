'use strict';
const { normalizeArabic } = require('../../../utils/arabicText');
const { retry } = require('../../../utils/retry');
const { CODES, reason } = require('../reasonCodes');

const MIN_CHARS = 15; // shorter texts ("ممتاز") match everything; the classifier handles them

/** Embeds the review text and compares it with every earlier review (pgvector, cosine). */
async function run(ctx, deps) {
  const text = ctx.extraction.reviewText;
  const textNorm = normalizeArabic(text);
  ctx.similar = [];
  if (textNorm.length < MIN_CHARS) return;

  const { vectors, model } = await retry(
    (signal) => deps.embeddings.embed([textNorm], { inputType: 'document', signal }),
    { retries: 2, timeoutMs: 20_000 },
  );
  const [vector] = vectors;

  const similar = await deps.repo.findSimilarTexts(vector, ctx.input.reviewId, 5);
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
  const top = similar[0];
  ctx.signals.topTextSimilarity = top ? Number(top.similarity.toFixed(4)) : null;
  if (!top) return;

  if (top.similarity >= deps.env.TEXT_SIMILARITY_REJECT) {
    ctx.reasons.push(reason(CODES.TEXT_DUPLICATE, { similarity: ctx.signals.topTextSimilarity }));
  } else if (top.similarity >= deps.env.TEXT_SIMILARITY_REVIEW) {
    ctx.reasons.push(reason(CODES.TEXT_SIMILAR, { similarity: ctx.signals.topTextSimilarity }));
  }
}

module.exports = { name: 'textSimilarity', run };
