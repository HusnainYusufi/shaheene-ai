import { nameKey } from '../../../utils/arabicText.js';
import { CODES, reason } from '../reasonCodes.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MIN_CONFIDENCE = 0.6;

/** Names shorter than this (as a key) must match exactly: one edit is too loose for them. */
const FUZZY_MIN_LEN = 8;

/**
 * Edit distance with adjacent transpositions (optimal string alignment), stopping
 * early once it exceeds `max`. 'لينجدسليب' vs 'ليجندسليب' = 1 (ن and ج swapped).
 */
function editDistance(a, b, max = 1) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** Does some part of `key` sit within one edit of `target`? */
function containsNear(key, target) {
  for (let len = target.length - 1; len <= target.length + 1; len++) {
    for (let i = 0; i + len <= key.length; i++) {
      if (editDistance(key.slice(i, i + len), target) <= 1) return true;
    }
  }
  return false;
}

/**
 * The review's business name is ours when, after normalising, it contains one of
 * the configured names. Fallback for transliteration slips ('لينجد سليب' for
 * 'ليجند سليب', 'Lejend Sleep'): within one edit of a configured name of at least
 * FUZZY_MIN_LEN letters. Kept tight on purpose: this rule is the main defence
 * against a review of another business.
 */
function matchesBusiness(name, businessNames) {
  const key = nameKey(name);
  if (!key) return false;
  const keys = businessNames.map(nameKey).filter(Boolean);
  if (keys.some((bk) => key.includes(bk) || (key.length >= 4 && bk.includes(key)))) return true;
  return keys.some((bk) => bk.length >= FUZZY_MIN_LEN && containsNear(key, bk));
}

/**
 * Pure business rules on the extracted fields. No I/O: tested in tests/rules.test.js.
 * input: { extraction, submittedAt, deliveredAt?, businessNames, reviewerUses, reviewWindowHours }
 *
 * Review window (reviewWindowHours, 48 by default): the review must be posted,
 * and the screenshot sent, within that many hours of the delivery. A review
 * the screenshot shows as that old or older ("2 days ago", "5 months ago")
 * is rejected; so is one whose posting time can't be read.
 */
function evaluate({
  extraction,
  submittedAt,
  deliveredAt,
  businessNames,
  reviewerUses = [],
  reviewWindowHours = 48,
}) {
  const out = [];
  const ex = extraction;

  if (!ex.businessName) out.push(reason(CODES.BUSINESS_UNREADABLE));
  else if (!matchesBusiness(ex.businessName, businessNames)) {
    out.push(reason(CODES.WRONG_BUSINESS, { businessName: ex.businessName }));
  }

  const submitted = new Date(submittedAt).getTime();
  const delivered = deliveredAt ? new Date(deliveredAt).getTime() : null;
  const windowMs = reviewWindowHours * HOUR;

  if (ex.postedAgeDays == null) {
    out.push(reason(CODES.POSTED_TIME_UNREADABLE));
  } else if (ex.postedAgeDays * DAY >= windowMs) {
    // "a day ago" passes a 48-hour window; "2 days ago" and older do not.
    out.push(
      reason(CODES.REVIEW_TOO_OLD, {
        postedRelative: ex.postedRelative,
        ageDays: ex.postedAgeDays,
        windowHours: reviewWindowHours,
      }),
    );
  } else if (delivered) {
    // "N hours ago" is precise to the hour: allow 2 hours. Day-level times are
    // coarse ("a day ago" covers 24-47 hours): allow half the age, min 1 day.
    const postedAt = submitted - ex.postedAgeDays * DAY;
    const tolerance = ex.postedAgeDays < 1 ? 2 * HOUR : Math.max(1, ex.postedAgeDays * 0.5) * DAY;
    if (postedAt + tolerance < delivered) {
      out.push(
        reason(CODES.REVIEW_BEFORE_DELIVERY, {
          postedRelative: ex.postedRelative,
          daysBeforeDelivery: Math.round((delivered - postedAt) / DAY),
        }),
      );
    }
  }

  if (delivered && submitted - delivered > windowMs) {
    out.push(
      reason(CODES.LATE_SUBMISSION, {
        hours: Math.round((submitted - delivered) / HOUR),
        windowHours: reviewWindowHours,
      }),
    );
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
    reviewWindowHours: deps.env.REVIEW_WINDOW_HOURS,
  });
  ctx.reasons.push(...found);
  return { reviewerUses: reviewerUses.length, reasons: found.map((r) => r.code) };
}

export const name = 'rules';
export { run, evaluate, matchesBusiness, editDistance };
