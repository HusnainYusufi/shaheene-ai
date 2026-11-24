// Run: node tests/rules.test.js
import assert from 'node:assert';
import {
  evaluate,
  matchesBusiness,
  editDistance,
} from '../src/features/reviewVerification/stages/04-rules.js';
import { decide } from '../src/features/reviewVerification/stages/07-decide.js';
import { normalizeArabic, nameKey, scrubPhones } from '../src/utils/arabicText.js';

const BUSINESS = ['legend sleep', 'ليجند سليب', 'ليجند'];
const DELIVERED = '2026-11-10T12:00:00+03:00';
const SUBMITTED = '2026-11-11T18:00:00+03:00'; // 30 hours after delivery

const base = {
  isReviewScreenshot: true,
  platform: 'google_maps',
  businessName: 'ليجند سليب - الرياض',
  reviewerName: 'Demo Customer',
  rating: 5,
  reviewText: 'المرتبة وصلت بسرعة والمندوب محترم',
  language: 'ar',
  postedRelative: 'منذ يوم',
  postedAgeDays: 1,
  reviewState: 'published',
  editingSuspected: false,
  editingNotes: null,
  confidence: 0.92,
};

const run = (over = {}, opts = {}) =>
  evaluate({
    extraction: { ...base, ...over },
    submittedAt: SUBMITTED,
    deliveredAt: DELIVERED,
    businessNames: BUSINESS,
    ...opts,
  }).map((r) => r.code);

let n = 0;
const t = (name, fn) => {
  fn();
  n += 1;
  console.log(`ok - ${name}`);
};

t('clean review has no reasons', () => assert.deepStrictEqual(run(), []));

t('business match: Arabic with hamza / diacritics', () => {
  assert.ok(matchesBusiness('لِيجَند سليب', BUSINESS));
  assert.ok(matchesBusiness('Legend Sleep | ليجند', BUSINESS));
  assert.ok(matchesBusiness('LEGEND SLEEP Riyadh', BUSINESS));
});

t('business match: one-letter spelling variants of the full name', () => {
  assert.ok(matchesBusiness('لينجد سليب', BUSINESS)); // ن and ج swapped
  assert.ok(matchesBusiness('متجر لينجد سليب للمراتب', BUSINESS));
  assert.ok(matchesBusiness('Lejend Sleep', BUSINESS));
  assert.ok(matchesBusiness('Legend Slep - Jeddah', BUSINESS));
});

t('business match stays strict', () => {
  assert.ok(!matchesBusiness('لينجد', BUSINESS)); // short names need an exact match
  assert.ok(!matchesBusiness('لنجد سلب', BUSINESS)); // two edits away
  assert.ok(!matchesBusiness('Legend Coffee', BUSINESS));
  assert.ok(!matchesBusiness('Sleep High', BUSINESS));
  assert.ok(!matchesBusiness('IKEA', BUSINESS));
});

t('editDistance counts a swap as one edit', () => {
  assert.strictEqual(editDistance('لينجدسليب', 'ليجندسليب', 1), 1);
  assert.strictEqual(editDistance('abcd', 'abcd', 1), 0);
  assert.ok(editDistance('abcd', 'badc', 1) > 1);
});

t('wrong business is flagged', () =>
  assert.deepStrictEqual(run({ businessName: 'IKEA' }), ['WRONG_BUSINESS']),
);
t('missing business name needs a human', () =>
  assert.deepStrictEqual(run({ businessName: null }), ['BUSINESS_UNREADABLE']),
);

// --- 48-hour review window -----------------------------------------------------
t('"a day ago" and "5 hours ago" are inside the window', () => {
  assert.deepStrictEqual(run({ postedRelative: 'a day ago', postedAgeDays: 1 }), []);
  assert.deepStrictEqual(run({ postedRelative: '5 hours ago', postedAgeDays: 0.21 }), []);
});
t('"2 days ago" is too old', () =>
  assert.deepStrictEqual(run({ postedRelative: 'منذ يومين', postedAgeDays: 2 }), [
    'REVIEW_TOO_OLD',
  ]),
);
t('"5 months ago" is too old', () =>
  assert.deepStrictEqual(run({ postedRelative: '5 months ago', postedAgeDays: 150 }), [
    'REVIEW_TOO_OLD',
  ]),
);
t('too old even when the delivery time is unknown', () =>
  assert.deepStrictEqual(run({ postedAgeDays: 60 }, { deliveredAt: null }), ['REVIEW_TOO_OLD']),
);
t('no posting time visible needs a better screenshot', () =>
  assert.deepStrictEqual(run({ postedRelative: null, postedAgeDays: null }), [
    'POSTED_TIME_UNREADABLE',
  ]),
);
t('posted hours before the delivery', () =>
  // Delivered 12:00, sent 14:00, "10 hours ago" = posted 04:00.
  assert.deepStrictEqual(
    run(
      { postedRelative: '10 hours ago', postedAgeDays: 0.42 },
      { submittedAt: '2026-11-10T14:00:00+03:00' },
    ),
    ['REVIEW_BEFORE_DELIVERY'],
  ),
);
t('posted just after the delivery', () =>
  assert.deepStrictEqual(
    run(
      { postedRelative: 'an hour ago', postedAgeDays: 0.04 },
      { submittedAt: '2026-11-10T14:00:00+03:00' },
    ),
    [],
  ),
);
t('sent exactly 48 hours after delivery is still in time', () =>
  assert.deepStrictEqual(
    run({ postedAgeDays: 1 }, { submittedAt: '2026-11-12T12:00:00+03:00' }),
    [],
  ),
);
t('sent 49 hours after delivery is late', () =>
  assert.deepStrictEqual(run({ postedAgeDays: 1 }, { submittedAt: '2026-11-12T13:00:00+03:00' }), [
    'LATE_SUBMISSION',
  ]),
);
t('window is configurable', () => {
  assert.deepStrictEqual(run({ postedAgeDays: 2 }, { reviewWindowHours: 72 }), []);
  // 24h window: "a day ago" is too old, and sent 30h after delivery is late.
  assert.deepStrictEqual(run({ postedAgeDays: 1 }, { reviewWindowHours: 24 }), [
    'REVIEW_TOO_OLD',
    'LATE_SUBMISSION',
  ]);
});
t('too old rejects; unreadable time is manual', () => {
  const ev = (over) =>
    evaluate({
      extraction: { ...base, ...over },
      submittedAt: SUBMITTED,
      deliveredAt: DELIVERED,
      businessNames: BUSINESS,
    });
  assert.strictEqual(decide(ev({ postedAgeDays: 2 })), 'reject');
  assert.strictEqual(decide(ev({ postedAgeDays: null })), 'manual_review');
  assert.strictEqual(decide(ev({ postedAgeDays: 1 }, {})), 'approve');
});

t('reviewer reused on another order', () =>
  assert.deepStrictEqual(run({}, { reviewerUses: ['DEMO-1'] }), ['REVIEWER_REUSED']),
);
t('2 stars or less is negative', () =>
  assert.deepStrictEqual(run({ rating: 2 }), ['NEGATIVE_REVIEW']),
);
t('3 stars is not positive enough', () =>
  assert.deepStrictEqual(run({ rating: 3 }), ['NOT_POSITIVE']),
);
t('4 stars is fine', () => assert.deepStrictEqual(run({ rating: 4 }), []));
t('no rating is fine', () => assert.deepStrictEqual(run({ rating: null }), []));
t('draft review is not proof', () =>
  assert.deepStrictEqual(run({ reviewState: 'draft' }), ['REVIEW_NOT_PUBLISHED']),
);
t('edited screenshot needs a human', () =>
  assert.deepStrictEqual(run({ editingSuspected: true, editingNotes: 'stars pasted' }), [
    'SUSPECTED_EDIT',
  ]),
);
t('low confidence', () => assert.deepStrictEqual(run({ confidence: 0.4 }), ['LOW_CONFIDENCE']));

t('decide: reject wins over manual_review', () => {
  const reasons = evaluate({
    extraction: { ...base, businessName: 'IKEA', rating: 3 },
    submittedAt: SUBMITTED,
    deliveredAt: DELIVERED,
    businessNames: BUSINESS,
  });
  assert.strictEqual(decide(reasons), 'reject');
  assert.strictEqual(decide(reasons.filter((r) => r.effect !== 'reject')), 'manual_review');
  assert.strictEqual(decide([]), 'approve');
});

t('normalizeArabic', () => {
  assert.strictEqual(normalizeArabic('  أحمـــد  إبراهيم '), 'احمد ابراهيم');
  assert.strictEqual(normalizeArabic('مدرسة مستشفى'), 'مدرسه مستشفي');
  assert.strictEqual(normalizeArabic('٥ نجوم'), '5 نجوم');
  assert.strictEqual(nameKey('Demo  Customer!'), 'democustomer');
});

t('scrubPhones', () => {
  assert.strictEqual(scrubPhones('call 0501234567 now'), 'call [PHONE] now');
  assert.strictEqual(scrubPhones('+966 50 123 4567'), '[PHONE]');
  assert.strictEqual(scrubPhones('٠٥٠١٢٣٤٥٦٧'), '[PHONE]');
  assert.strictEqual(scrubPhones('5 stars, order 2 days'), '5 stars, order 2 days');
});

console.log(`\n${n} passed`);
