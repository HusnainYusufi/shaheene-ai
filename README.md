# shaheen-ai

AI verification service for Shaheen, the Legend Sleep delivery platform.

Drivers earn a reward (5 SAR) for each customer review they collect. In the driver app, they upload a screenshot of the review. legend-delivery stores the screenshot and asks this service to check it. The service returns one of three verdicts, `approve`, `manual_review` or `reject`, each with reason codes.

There is no human check. legend-delivery approves the review and pays the reward only on `approve`. Both other verdicts reject the review, and the driver sees the reason in the app and may send a better screenshot. `manual_review` still exists so that the record shows which rejections were clear evidence and which were "not proven good enough".

A review earns the reward only when all of these are true:

- the screenshot shows a published review on Legend Sleep's page;
- it has written text, not only stars, and 4 or 5 stars when stars show;
- the text is positive and praises Legend Sleep itself: its products, ordering, delivery, driver or service (`classify.v2`);
- it is not a copy of an earlier screenshot or review text, and was posted after the delivery.

## How it works

```
legend-delivery ── POST /jobs/review-verification ──▶ review_checks row + pg-boss job
                                                         │
worker ◀─────────────────────────────────────────────────┘
  01 fetchImage      GET  legend-delivery /internal/reviews/:id/screenshot
  02 imageHash       sha256 exact match + 64-bit dHash (Hamming ≤ PHASH_MAX_DISTANCE)
  03 extract         vision LLM → business, reviewer, rating, text, posted time
  04 rules           business name, 48-hour review window, reviewer reuse, rating, confidence
  05 textSimilarity  local embeddings (multilingual-e5-small) + pgvector cosine search
  06 classify        LLM: genuine vs templated, sentiment
  07 decide          any reject reason → reject; any manual_review reason → manual_review; else approve
  └─▶ POST legend-delivery /internal/reviews/:id/ai-check
```

**Review window** (`REVIEW_WINDOW_HOURS`, default 48): the review must be posted, and the screenshot sent, within that many hours of the delivery.

- A review the screenshot shows as that old or older ("2 days ago", "5 months ago") is rejected (`REVIEW_TOO_OLD`). "a day ago" and "N hours ago" pass.
- A screenshot sent after the window is rejected (`LATE_SUBMISSION`). legend-delivery also refuses the upload.
- If no posting time is visible, the driver is asked for a screenshot that shows it (`POSTED_TIME_UNREADABLE`).

Each stage gets the same shared `ctx`, adds its reasons, and returns its output. The pipeline saves every output as `stage_results` (`{ stageName: { ms, output } }`) on the check, so ops can see exactly why a screenshot was flagged. If a run fails, the stages that did finish are still saved.

An exact duplicate image, or an image that is not a review, stops the pipeline early. The stages after it are recorded as skipped. `decide` always runs. This avoids paying for LLM calls whose result cannot change the verdict. Reason codes and their effects are listed in `src/features/reviewVerification/reasonCodes.js`.

## Layout

The project is Node.js with ES modules (`"type": "module"`). Note that legend-delivery itself is CommonJS.


- `src/providers/` is the only code that knows which AI company is in use. The LLM defaults to MiniMax (`MiniMax-M3.1-Flash`, reads images), and `LLM_PROVIDER=anthropic` switches it. MiniMax has no embeddings API, so embeddings come from a local model by default (`EMBEDDINGS_PROVIDER=local`, no key, text stays on the server). Voyage is the hosted alternative. Features call `llm.generateJson({ system, content, schema })` and `embeddings.embed(texts)`.
- Prompts are versioned files (`extract.v1.js`). Each check records which prompt versions and which model produced it. To change a prompt, add `v2` instead of editing `v1`.
- All SQL for the feature lives in `repository.js`.
- `src/utils/arabicText.js` normalises Arabic text and scrubs phone numbers before review text is stored or sent anywhere.

## Run locally

```bash
cp .env.example .env        # fill in the keys
npm install
npm run db:up               # Postgres 17 + pgvector on :5433, pgAdmin UI on http://localhost:5050
npm run playground          # learn semantic search on made-up reviews (no API key needed)
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

## legend-delivery side

Built in legend-delivery `features/review` (`ShaheenAi.js`, `InternalReviewController.js`, `ReviewAiJob.js`). The client here lives in `src/clients/legendDelivery.js`.

1. When a driver submits a review, legend-delivery calls `POST /jobs/review-verification`. A failed call, or a check with no answer after 2 hours, is sent again every 10 minutes.
2. `GET /internal/reviews/:id/screenshot` streams the private screenshot.
3. `POST /internal/reviews/:id/ai-check` applies the verdict: `approve` approves and pays the reward; anything else rejects with a reason the driver can read. A repeated verdict for the same check is ignored.
4. The driver app checks `GET /reviews/notifications` and shows "You earned 5 SAR" or the rejection reason.

Tokens, one per direction:

| shaheen-ai | legend-delivery | Used for |
|---|---|---|
| `SERVICE_TOKEN` | `SHAHEEN_AI_TOKEN` | legend-delivery calling this service |
| `LEGEND_DELIVERY_TOKEN` | `SHAHEEN_AI_INBOUND_TOKEN` | this service calling `/internal/*` |

legend-delivery also needs `SHAHEEN_AI_URL`. Without it the integration is off and reviews stay pending.

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
