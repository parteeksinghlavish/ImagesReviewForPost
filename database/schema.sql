-- Standalone ImagesReviewForPost D1 schema. Tables already deployed independently of JobVFX.
CREATE TABLE IF NOT EXISTS image_reviews (
  id TEXT PRIMARY KEY,
  object_key TEXT UNIQUE NOT NULL,
  batch_id TEXT NOT NULL,
  image_index INTEGER NOT NULL CHECK (image_index BETWEEN 0 AND 3),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','scheduling','scheduled','published','error')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  decided_at TEXT,
  scheduled_at TEXT,
  postiz_post_id TEXT,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS ix_image_reviews_status ON image_reviews(status,created_at);
CREATE INDEX IF NOT EXISTS ix_image_reviews_batch ON image_reviews(batch_id,image_index);
CREATE TABLE IF NOT EXISTS publication_jobs (
  image_id TEXT PRIMARY KEY REFERENCES image_reviews(id),
  publish_at TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'held' CHECK(status IN('held','dispatching','scheduled','published','retry_wait','uncertain','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  next_attempt_at TEXT, lease_token TEXT, lease_until TEXT,
  postiz_post_id TEXT UNIQUE, provider_status TEXT, last_error TEXT, last_checked_at TEXT,
  manifest_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ix_publication_jobs_status ON publication_jobs(status,publish_at);
CREATE INDEX IF NOT EXISTS ix_publication_jobs_retry ON publication_jobs(status,next_attempt_at);
CREATE TABLE IF NOT EXISTS cleanup_jobs (
  image_id TEXT PRIMARY KEY REFERENCES image_reviews(id),object_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','complete','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  next_attempt_at TEXT,last_error TEXT,completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ix_cleanup_jobs_pending ON cleanup_jobs(status,next_attempt_at);
CREATE TABLE IF NOT EXISTS review_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_id TEXT NOT NULL REFERENCES image_reviews(id),event TEXT NOT NULL,detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS ix_review_events_image ON review_events(image_id,created_at);
