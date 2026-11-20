CREATE EXTENSION IF NOT EXISTS vector;

-- One row per AI verification run of a driver's review screenshot.
CREATE TABLE review_checks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id       text        NOT NULL,           -- legend-delivery Review._id
  order_no        text        NOT NULL,
  driver_id       text        NOT NULL,
  input           jsonb       NOT NULL,           -- job payload as received
  status          text        NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'running', 'done', 'failed')),
  decision        text        CHECK (decision IN ('approve', 'manual_review', 'reject')),
  reason_codes    text[]      NOT NULL DEFAULT '{}',
  reviewer_key    text,                           -- normalised reviewer name, for reuse checks
  extraction      jsonb,
  classification  jsonb,
  signals         jsonb       NOT NULL DEFAULT '{}',
  llm_provider    text,
  llm_model       text,
  prompt_versions jsonb       NOT NULL DEFAULT '{}',
  error           text,
  attempts        int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  reported_at     timestamptz                     -- result written back to legend-delivery
);

CREATE INDEX review_checks_review_id_idx ON review_checks (review_id, created_at DESC);
CREATE INDEX review_checks_reviewer_key_idx ON review_checks (reviewer_key) WHERE reviewer_key IS NOT NULL;
CREATE INDEX review_checks_status_idx ON review_checks (status);

-- Exact + perceptual hashes of every screenshot seen.
CREATE TABLE image_hashes (
  check_id   uuid PRIMARY KEY REFERENCES review_checks (id) ON DELETE CASCADE,
  review_id  text        NOT NULL,
  order_no   text        NOT NULL,
  sha256     text        NOT NULL,
  phash      bigint      NOT NULL,                -- 64-bit dHash stored signed
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX image_hashes_sha256_idx ON image_hashes (sha256);
