-- Existing deployed database: social-image-review. Reference schema only.
-- Do not run automatically during Worker deployment.
CREATE TABLE IF NOT EXISTS image_reviews (
  id TEXT PRIMARY KEY,
  object_key TEXT UNIQUE NOT NULL,
  batch_id TEXT NOT NULL,
  image_index INTEGER NOT NULL CHECK (image_index BETWEEN 0 AND 3),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','scheduling','scheduled','published','error')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  decided_at TEXT,
  scheduled_at TEXT,
  postiz_post_id TEXT,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS ix_image_reviews_status ON image_reviews(status,created_at);
CREATE INDEX IF NOT EXISTS ix_image_reviews_batch ON image_reviews(batch_id,image_index);
