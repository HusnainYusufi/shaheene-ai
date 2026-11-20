# shaheen-ai

AI verification service for Shaheen, the Legend Sleep delivery platform.

Drivers earn a reward for each customer review they collect. In the driver app, they upload a screenshot of the review. legend-delivery stores the screenshot and asks this service to check it. The service returns one of three verdicts: `approve`, `manual_review` or `reject`, each with reason codes. It never pays a reward by itself. legend-delivery and the reviews admin decide what to do with each verdict.

## How it works

```
legend-delivery ── POST /jobs/review-verification ──▶ review_checks row + pg-boss job
                                                         │
worker ◀─────────────────────────────────────────────────┘
  01 fetchImage      GET  legend-delivery /internal/reviews/:id/screenshot
  02 imageHash       sha256 exact match + 64-bit dHash (Hamming ≤ PHASH_MAX_DISTANCE)
  03 extract         vision LLM → business, reviewer, rating, text, posted time
  04 rules           business name, timing vs delivery, reviewer reuse, rating, confidence
  05 textSimilarity  Voyage embeddings + pgvector cosine search
  06 classify        LLM: genuine vs templated, sentiment
  07 decide          any reject reason → reject; any manual_review reason → manual_review; else approve
  └─▶ POST legend-delivery /internal/reviews/:id/ai-check
```

Each stage gets the same shared `ctx`, adds its reasons, and returns its output. The pipeline saves every output as `stage_results` (`{ stageName: { ms, output } }`) on the check, so ops can see exactly why a screenshot was flagged. If a run fails, the stages that did finish are still saved.

An exact duplicate image, or an image that is not a review, stops the pipeline early. The stages after it are recorded as skipped. `decide` always runs. This avoids paying for LLM calls whose result cannot change the verdict. Reason codes and their effects are listed in `src/features/reviewVerification/reasonCodes.js`.

## Layout

The project is Node.js with ES modules (`"type": "module"`). Note that legend-delivery itself is CommonJS.


- `src/providers/` is the only code that knows which AI company is in use. To switch, set `LLM_PROVIDER=anthropic|minimax`. Features call `llm.generateJson({ system, content, schema })` and `embeddings.embed(texts)`.
- Prompts are versioned files (`extract.v1.js`). Each check records which prompt versions and which model produced it. To change a prompt, add `v2` instead of editing `v1`.
- All SQL for the feature lives in `repository.js`.
- `src/utils/arabicText.js` normalises Arabic text and scrubs phone numbers before review text is stored or sent anywhere.

## Run locally

```bash
cp .env.example .env        # fill in the keys
npm install
npm run db:up               # Postgres 17 + pgvector on localhost:5433
npm run dev                 # runs migrations, starts pg-boss, worker and HTTP on :4100
```

The service exits at startup if a required environment variable is missing. It lists the missing names but never prints their values.

## API

`GET /health` needs no token. It returns `{ ok, db }` and responds 503 when Postgres is unreachable.

Every other request needs the `x-service-token: $SERVICE_TOKEN` header.

`POST /jobs/review-verification`

```json
{
  "reviewId": "665f…",
  "orderNo": "2001234567",
  "driverId": "6640…",
  "submittedAt": "2026-11-12T12:00:00+03:00",
  "deliveredAt": "2026-11-10T15:30:00+03:00",
  "link": null,
  "note": null
}
```

The endpoint responds `202 { checkId, status }`. If a check for the same review is still queued or running, it returns that check with `deduplicated: true` instead of starting a new one.

`GET /checks/:id` returns the check's status, decision, reasons, per-stage results, extracted fields, classification, model and prompt versions.

## Needed on the legend-delivery side

These endpoints are not built yet. The client lives in `src/clients/legendDelivery.js`.

1. `GET /internal/reviews/:id/screenshot`: streams the private screenshot. Authenticated with `x-service-token: LEGEND_DELIVERY_TOKEN`, not a user JWT.
2. `POST /internal/reviews/:id/ai-check`: stores the verdict on the Review, for example under `review.aiCheck`. The admin reviews screen shows it next to the screenshot.
3. When a driver submits a review, call `POST /jobs/review-verification`.

## Tests and evals

```bash
npm test                    # plain assert scripts, no DB or network
npm run eval:extraction     # real LLM calls, costs money
```

Evals score the extraction and the final verdict against labels that you set yourself:

- Put real screenshots in `evals/fixtures/`. This folder is gitignored and must never be committed.
- Record the correct answer for each screenshot in `evals/labels.json`. The format is documented at the top of `evals/runExtractionEval.js`.
- Detailed results go to `evals/results/`, which is also gitignored because it contains customer text.

Run the eval before switching provider or prompt version, and again after.
