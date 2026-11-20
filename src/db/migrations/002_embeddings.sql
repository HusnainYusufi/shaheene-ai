-- Review text embeddings for copied / templated text detection.
-- vector(1024) must match EMBEDDING_DIM in .env.
CREATE TABLE review_text_embeddings (
  check_id   uuid PRIMARY KEY REFERENCES review_checks (id) ON DELETE CASCADE,
  review_id  text        NOT NULL,
  order_no   text        NOT NULL,
  driver_id  text        NOT NULL,
  text_norm  text        NOT NULL,                -- normalised, phone numbers scrubbed
  model      text        NOT NULL,
  embedding  vector(1024) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX review_text_embeddings_hnsw_idx
  ON review_text_embeddings USING hnsw (embedding vector_cosine_ops);
