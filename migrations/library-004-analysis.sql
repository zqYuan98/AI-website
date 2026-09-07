-- Candidate content stays in the private database. Workflow receives opaque job IDs only.
CREATE TABLE IF NOT EXISTS library_private.analysis_previews (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  batch_id text NOT NULL REFERENCES library_private.import_batches(id) ON DELETE CASCADE,
  payload jsonb NOT NULL CHECK (octet_length(payload::text) <= 1048576),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes'
);
CREATE INDEX IF NOT EXISTS analysis_previews_owner ON library_private.analysis_previews(owner_id, expires_at);

CREATE TABLE IF NOT EXISTS library_private.analysis_jobs (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  batch_id text NOT NULL REFERENCES library_private.import_batches(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  state jsonb NOT NULL CHECK (octet_length(state::text) <= 2097152),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, request_id)
);
CREATE INDEX IF NOT EXISTS analysis_jobs_batch ON library_private.analysis_jobs(owner_id, batch_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS library_private.analysis_requests (
  id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES library_private.analysis_jobs(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  config_version text NOT NULL,
  status text NOT NULL CHECK(status IN ('reserved','sent','succeeded','failed','unknown','cancelled')),
  target_ids jsonb NOT NULL,
  reserved_cost double precision,
  lease_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS analysis_requests_active ON library_private.analysis_requests(owner_id, lease_until) WHERE status IN ('reserved','sent');

REVOKE ALL ON library_private.analysis_previews, library_private.analysis_jobs, library_private.analysis_requests FROM PUBLIC;
