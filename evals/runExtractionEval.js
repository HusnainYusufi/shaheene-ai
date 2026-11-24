/**
 * Scores the extraction stage (and the rule-based decision) against hand labels.
 *
 *   node evals/runExtractionEval.js [--only file.png]
 *
 * evals/labels.json is an array of:
 * {
 *   "file": "0001.jpg",                       // in evals/fixtures/ (gitignored)
 *   "submittedAt": "2026-11-12T12:00:00+03:00",
 *   "deliveredAt": "2026-11-10T12:00:00+03:00",
 *   "expected": {
 *     "isReviewScreenshot": true,
 *     "businessMatches": true,                 // is it our business?
 *     "reviewerName": "…", "rating": 5,
 *     "decision": "approve"                    // approve | manual_review | reject
 *   }
 * }
 * Any expected field may be omitted; only the given ones are scored.
 * Calls the real LLM provider from .env: each run costs money.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import env from '../src/config/env.js';
import llm from '../src/providers/llm/index.js';
import * as extract from '../src/features/reviewVerification/stages/03-extract.js';
import { evaluate, matchesBusiness } from '../src/features/reviewVerification/stages/04-rules.js';
import { decide } from '../src/features/reviewVerification/stages/07-decide.js';
import { nameKey } from '../src/utils/arabicText.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const RESULTS = path.join(import.meta.dirname, 'results');

async function runOne(label) {
  const buffer = fs.readFileSync(path.join(FIXTURES, label.file));
  const jpeg = await sharp(buffer)
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  const ctx = {
    input: { submittedAt: label.submittedAt },
    image: { llm: { mediaType: 'image/jpeg', data: jpeg.toString('base64') } },
    reasons: [],
    promptVersions: {},
  };
  await extract.run(ctx, { llm, env });
  const ex = ctx.extraction;
  const reasons = ctx.stop
    ? ctx.reasons
    : evaluate({
        extraction: ex,
        submittedAt: label.submittedAt,
        deliveredAt: label.deliveredAt,
        businessNames: env.BUSINESS_NAMES,
        reviewWindowHours: env.REVIEW_WINDOW_HOURS,
      });
  const actual = {
    isReviewScreenshot: ex.isReviewScreenshot,
    businessMatches: ex.businessName ? matchesBusiness(ex.businessName, env.BUSINESS_NAMES) : false,
    reviewerName: ex.reviewerName,
    rating: ex.rating,
    decision: decide(reasons),
  };
  return { actual, reasons: reasons.map((r) => r.code), extraction: ex };
}

const same = (field, a, b) => (field === 'reviewerName' ? nameKey(a) === nameKey(b) : a === b);

(async () => {
  const only = process.argv.includes('--only')
    ? process.argv[process.argv.indexOf('--only') + 1]
    : null;
  const labels = JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, 'labels.json'), 'utf8'),
  ).filter((l) => !only || l.file === only);
  if (!labels.length) {
    console.log('No labels. Add screenshots to evals/fixtures/ and entries to evals/labels.json.');
    return;
  }

  const score = {};
  const rows = [];
  for (const label of labels) {
    if (!fs.existsSync(path.join(FIXTURES, label.file))) {
      console.log(`skip ${label.file}: missing fixture`);
      continue;
    }
    try {
      const { actual, reasons, extraction } = await runOne(label);
      const misses = [];
      for (const [field, want] of Object.entries(label.expected)) {
        score[field] ??= { ok: 0, total: 0 };
        score[field].total += 1;
        if (same(field, actual[field], want)) score[field].ok += 1;
        else
          misses.push(
            `${field}: want ${JSON.stringify(want)} got ${JSON.stringify(actual[field])}`,
          );
      }
      rows.push({ file: label.file, misses, reasons, extraction });
      console.log(
        `${misses.length ? 'MISS' : 'ok  '} ${label.file}${misses.length ? `  ${misses.join('; ')}` : ''}`,
      );
    } catch (err) {
      rows.push({ file: label.file, error: err.message });
      console.log(`ERR  ${label.file}  ${err.message}`);
    }
  }

  console.log(`\nprovider=${env.LLM_PROVIDER}`);
  for (const [field, s] of Object.entries(score)) {
    console.log(`${field.padEnd(20)} ${s.ok}/${s.total}  ${((s.ok / s.total) * 100).toFixed(1)}%`);
  }

  fs.mkdirSync(RESULTS, { recursive: true });
  const out = path.join(RESULTS, `extraction-${env.LLM_PROVIDER}-${Date.now()}.json`);
  fs.writeFileSync(out, JSON.stringify({ provider: env.LLM_PROVIDER, score, rows }, null, 2));
  console.log(`\nDetails: ${out} (gitignored: contains extracted customer text)`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
