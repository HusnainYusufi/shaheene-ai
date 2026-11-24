/**
 * Every reason a check can give. `effect` is what the code does to the decision:
 *   reject        -> clear evidence against the review
 *   manual_review -> not proven good enough to pay
 * legend-delivery pays only on approve: both effects end as a rejected review,
 * with the reason shown to the driver, who may send a better screenshot.
 */
const REASONS = Object.freeze({
  DUPLICATE_IMAGE: { effect: 'reject', label: 'Same screenshot already submitted' },
  NEAR_DUPLICATE_IMAGE: { effect: 'manual_review', label: 'Screenshot looks like an earlier one' },
  NOT_A_REVIEW: { effect: 'reject', label: 'Image is not a review screenshot' },
  WRONG_BUSINESS: { effect: 'reject', label: 'Review is for another business' },
  BUSINESS_UNREADABLE: { effect: 'manual_review', label: 'Business name not readable' },
  REVIEW_BEFORE_DELIVERY: { effect: 'reject', label: 'Review was posted before the delivery' },
  REVIEW_TOO_OLD: {
    effect: 'reject',
    label: 'Review was posted too long ago (outside the review window)',
  },
  POSTED_TIME_UNREADABLE: {
    effect: 'manual_review',
    label: 'Posting time of the review not visible',
  },
  LATE_SUBMISSION: { effect: 'reject', label: 'Submitted after the review window closed' },
  REVIEWER_REUSED: { effect: 'manual_review', label: 'Reviewer name used on another order' },
  NEGATIVE_REVIEW: { effect: 'reject', label: 'Low rating or negative review' },
  NOT_POSITIVE: { effect: 'manual_review', label: 'Review does not praise Legend Sleep' },
  NO_REVIEW_TEXT: { effect: 'manual_review', label: 'Review has no written text' },
  TEXT_DUPLICATE: { effect: 'reject', label: 'Review text copied from another review' },
  TEXT_SIMILAR: { effect: 'manual_review', label: 'Review text very close to another review' },
  TEMPLATED_TEXT: { effect: 'manual_review', label: 'Review text looks templated' },
  LOW_CONFIDENCE: { effect: 'manual_review', label: 'AI not confident in what it read' },
  IMAGE_UNREADABLE: { effect: 'manual_review', label: 'Screenshot could not be processed' },
  SUSPECTED_EDIT: { effect: 'manual_review', label: 'Screenshot looks edited' },
  REVIEW_NOT_PUBLISHED: { effect: 'manual_review', label: 'Review is a draft, not posted' },
});

const CODES = Object.freeze(Object.fromEntries(Object.keys(REASONS).map((k) => [k, k])));

/** reason(CODES.X, { detail }) -> { code, effect, detail } */
function reason(code, detail = null) {
  const def = REASONS[code];
  if (!def) throw new Error(`Unknown reason code ${code}`);
  return { code, effect: def.effect, detail };
}

export { REASONS, CODES, reason };
