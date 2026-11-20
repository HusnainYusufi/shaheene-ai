import { nameKey } from '../../../utils/arabicText.js';
import { CODES, reason } from '../reasonCodes.js';

const DAY = 24 * 60 * 60 * 1000;
const MIN_CONFIDENCE = 0.6;

function matchesBusiness(name, businessNames) {
  const key = nameKey(name);
  if (!key) return false;
  return businessNames.some((b) => {
    const bk = nameKey(b);
    return bk && (key.includes(bk) || (key.length >= 4 && bk.includes(key)));
  });
}

/**
 * Pure business rules on the extracted fields. No I/O: tested in tests/rules.test.js.
 * input: { extraction, submittedAt, deliveredAt?, businessNames, reviewerUses, maxSubmitDelayDays }
 */
function evaluate({
  extraction,
  submittedAt,
  deliveredAt,
  businessNames,
  reviewerUses = [],
  maxSubmitDelayDays = 14,
}) {
  const out = [];
  const ex = extraction;

  if (!ex.businessName) out.push(reason(CODES.BUSINESS_UNREADABLE));
  else if (!matchesBusiness(ex.businessName, businessNames)) {
    out.push(reason(CODES.WRONG_BUSINESS, { businessName: ex.businessName }));
  }

  const submitted = new Date(submittedAt).getTime();
  const delivered = deliveredAt ? new Date(deliveredAt).getTime() : null;

  if (delivered && ex.postedAgeDays != null) {
    // Relative times are coarse ("a week ago" covers 7-13 days): allow half the age, min 1 day.
    const postedAt = submitted - ex.postedAgeDays * DAY;
    const tolerance = Math.max(1, ex.postedAgeDays * 0.5) * DAY;
    if (postedAt + tolerance < delivered) {
      out.push(
        reason(CODES.REVIEW_BEFORE_DELIVERY, {
          postedRelative: ex.postedRelative,
          daysBeforeDelivery: Math.round((delivered - postedAt) / DAY),
        }),
      );
    }
  }

  if (delivered && submitted - delivered > maxSubmitDelayDays * DAY) {
    out.push(reason(CODES.LATE_SUBMISSION, { days: Math.round((submitted - delivered) / DAY) }));
  }

  if (reviewerUses.length) {
    out.push(reason(CODES.REVIEWER_REUSED, { otherOrders: reviewerUses.length }));
  }

  if (ex.rating != null && ex.rating <= 2)
    out.push(reason(CODES.NEGATIVE_REVIEW, { rating: ex.rating }));
  else if (ex.rating === 3) out.push(reason(CODES.NOT_POSITIVE, { rating: 3 }));

  if (ex.reviewState === 'draft') out.push(reason(CODES.REVIEW_NOT_PUBLISHED));
  if (ex.editingSuspected) out.push(reason(CODES.SUSPECTED_EDIT, { notes: ex.editingNotes }));

  if (ex.confidence < MIN_CONFIDENCE) {
    out.push(reason(CODES.LOW_CONFIDENCE, { stage: 'extract', confidence: ex.confidence }));
  }

  return out;
}

async function run(ctx, deps) {
  const reviewerKey = nameKey(ctx.extraction.reviewerName) || null;
  ctx.reviewerKey = reviewerKey;
  const reviewerUses = reviewerKey
    ? await deps.repo.findReviewerUses(reviewerKey, ctx.input.orderNo)
    : [];

  const found = evaluate({
    extraction: ctx.extraction,
    submittedAt: ctx.input.submittedAt,
    deliveredAt: ctx.input.deliveredAt,
    businessNames: deps.env.BUSINESS_NAMES,
    reviewerUses,
    maxSubmitDelayDays: deps.env.MAX_SUBMIT_DELAY_DAYS,
  });
  ctx.reasons.push(...found);
  return { reviewerUses: reviewerUses.length, reasons: found.map((r) => r.code) };
}

export const name = 'rules';
export { run, evaluate, matchesBusiness };
