import { query } from '../../db/pool.js';

const toVector = (v) => `[${v.join(',')}]`;

async function createCheck(input) {
  const { rows } = await query(
    `INSERT INTO review_checks (review_id, order_no, driver_id, input)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.reviewId, input.orderNo, input.driverId, input],
  );
  return rows[0];
}

/** A queued or running check for this review, so a re-post does not start a second run. */
async function findOpenCheck(reviewId) {
  const { rows } = await query(
    `SELECT * FROM review_checks
      WHERE review_id = $1 AND status IN ('queued', 'running')
      ORDER BY created_at DESC LIMIT 1`,
    [reviewId],
  );
  return rows[0] || null;
}

async function getCheck(id) {
  const { rows } = await query('SELECT * FROM review_checks WHERE id = $1', [id]);
  return rows[0] || null;
}

async function markRunning(id) {
  await query(
    `UPDATE review_checks
        SET status = 'running', attempts = attempts + 1, started_at = now(), error = NULL
      WHERE id = $1`,
    [id],
  );
}

async function finishCheck(id, r) {
  await query(
    `UPDATE review_checks
        SET status = 'done', decision = $2, reason_codes = $3, reviewer_key = $4,
            extraction = $5, classification = $6, reasons = $7, stage_results = $11,
            llm_provider = $8, llm_model = $9, prompt_versions = $10, finished_at = now()
      WHERE id = $1`,
    [
      id,
      r.decision,
      r.reasonCodes,
      r.reviewerKey,
      r.extraction,
      r.classification,
      JSON.stringify(r.reasons),
      r.llmProvider,
      r.llmModel,
      r.promptVersions,
      r.stageResults,
    ],
  );
}

/** Keeps the stages that did finish, so a failed run is still auditable. */
async function failCheck(id, error, stageResults = {}) {
  await query(
    `UPDATE review_checks
        SET status = 'failed', error = $2, stage_results = $3, finished_at = now()
      WHERE id = $1`,
    [id, String(error).slice(0, 2000), stageResults],
  );
}

async function markReported(id) {
  await query('UPDATE review_checks SET reported_at = now() WHERE id = $1', [id]);
}

// --- images ---

async function findSameImage(sha256, excludeReviewId) {
  const { rows } = await query(
    `SELECT review_id, order_no, created_at FROM image_hashes
      WHERE sha256 = $1 AND review_id <> $2
      ORDER BY created_at LIMIT 5`,
    [sha256, excludeReviewId],
  );
  return rows;
}

/** Hamming distance on the 64-bit dHash. Full scan: fine for tens of thousands of rows. */
async function findNearImages(phashSigned, maxDistance, excludeReviewId) {
  const { rows } = await query(
    `SELECT review_id, order_no, distance FROM (
       SELECT review_id, order_no,
              bit_count(((phash # $1::bigint))::bit(64)) AS distance
         FROM image_hashes
        WHERE review_id <> $3
     ) t
     WHERE distance <= $2
     ORDER BY distance LIMIT 5`,
    [phashSigned.toString(), maxDistance, excludeReviewId],
  );
  return rows.map((r) => ({ ...r, distance: Number(r.distance) }));
}

async function saveImageHash({ checkId, reviewId, orderNo, sha256, phashSigned }) {
  await query(
    `INSERT INTO image_hashes (check_id, review_id, order_no, sha256, phash)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (check_id) DO UPDATE SET sha256 = EXCLUDED.sha256, phash = EXCLUDED.phash`,
    [checkId, reviewId, orderNo, sha256, phashSigned.toString()],
  );
}

// --- reviewers ---

/** Other orders whose finished, non-rejected check had the same reviewer. */
async function findReviewerUses(reviewerKey, excludeOrderNo) {
  const { rows } = await query(
    `SELECT DISTINCT order_no FROM review_checks
      WHERE reviewer_key = $1 AND order_no <> $2
        AND status = 'done' AND decision <> 'reject'
      LIMIT 10`,
    [reviewerKey, excludeOrderNo],
  );
  return rows.map((r) => r.order_no);
}

// --- text embeddings ---

async function findSimilarTexts(vector, excludeReviewId, limit = 5) {
  const { rows } = await query(
    `SELECT review_id, order_no, driver_id, text_norm,
            1 - (embedding <=> $1::vector) AS similarity
       FROM review_text_embeddings
      WHERE review_id <> $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3`,
    [toVector(vector), excludeReviewId, limit],
  );
  return rows.map((r) => ({ ...r, similarity: Number(r.similarity) }));
}

async function saveEmbedding({ checkId, reviewId, orderNo, driverId, textNorm, model, vector }) {
  await query(
    `INSERT INTO review_text_embeddings (check_id, review_id, order_no, driver_id, text_norm, model, embedding)
     VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
     ON CONFLICT (check_id) DO UPDATE
       SET text_norm = EXCLUDED.text_norm, model = EXCLUDED.model, embedding = EXCLUDED.embedding`,
    [checkId, reviewId, orderNo, driverId, textNorm, model, toVector(vector)],
  );
}

export {
  createCheck,
  findOpenCheck,
  getCheck,
  markRunning,
  finishCheck,
  failCheck,
  markReported,
  findSameImage,
  findNearImages,
  saveImageHash,
  findReviewerUses,
  findSimilarTexts,
  saveEmbedding,
};
