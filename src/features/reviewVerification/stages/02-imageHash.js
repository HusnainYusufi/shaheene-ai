import { dHash, toSigned64 } from '../../../utils/perceptualHash.js';
import { CODES, reason } from '../reasonCodes.js';

/** Exact (sha256) and perceptual (dHash) duplicate check against every earlier screenshot. */
async function run(ctx, deps) {
  const { reviewId, orderNo } = ctx.input;
  const phashSigned = toSigned64(await dHash(ctx.image.buffer));
  const phash = BigInt.asUintN(64, phashSigned).toString(16).padStart(16, '0');

  const same = await deps.repo.findSameImage(ctx.image.sha256, reviewId);
  const near = same.length
    ? []
    : await deps.repo.findNearImages(phashSigned, deps.env.PHASH_MAX_DISTANCE, reviewId);

  await deps.repo.saveImageHash({
    checkId: ctx.check.id,
    reviewId,
    orderNo,
    sha256: ctx.image.sha256,
    phashSigned,
  });

  if (same.length) {
    ctx.reasons.push(reason(CODES.DUPLICATE_IMAGE, { matches: same.length }));
    ctx.stop = true; // nothing else can make this reward-eligible; skip LLM spend
  } else if (near.length) {
    ctx.reasons.push(reason(CODES.NEAR_DUPLICATE_IMAGE, { closestDistance: near[0].distance }));
  }

  return {
    phash,
    duplicateOf: same.map((r) => r.review_id),
    nearDuplicates: near.map((r) => ({ reviewId: r.review_id, distance: r.distance })),
  };
}

export const name = 'imageHash';
export { run };
