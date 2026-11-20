/**
 * Every reason a check can give. `effect` is what the code does to the decision:
 *   reject        -> the review is rejected unless a human overrides it
 *   manual_review -> a human must look before approval
 */
const REASONS = Object.freeze({
  DUPLICATE_IMAGE: { effect: 'reject', label: 'Same screenshot already submitted' },
  NEAR_DUPLICATE_IMAGE: { effect: 'manual_review', label: 'Screenshot looks like an earlier one' },
  NOT_A_REVIEW: { effect: 'reject', label: 'Image is not a review screenshot' },
  WRONG_BUSINESS: { effect: 'reject', label: 'Review is for another business' },
  BUSINESS_UNREADABLE: { effect: 'manual_review', label: 'Business name not readable' },
  REVIEW_BEFORE_DELIVERY: { effect: 'reject', label: 'Review was posted before the delivery' },
  LATE_SUBMISSION: { effect: 'manual_review', label: 'Submitted long after delivery' },
  REVIEWER_REUSED: { effect: 'manual_review', label: 'Reviewer name used on another order' },
  NEGATIVE_REVIEW: { effect: 'manual_review', label: 'Low rating or negative review' },
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
