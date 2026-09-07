-- Additive, private staging only. Applying this migration does not seed or publish resources.
CREATE TABLE IF NOT EXISTS library_private.import_batches (
  id text PRIMARY KEY,
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 128),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  fingerprint text NOT NULL,
  create_request_id text NOT NULL,
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, create_request_id)
);
CREATE INDEX IF NOT EXISTS import_batches_owner_created ON library_private.import_batches(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS import_batches_owner_fingerprint ON library_private.import_batches(owner_id, fingerprint);
CREATE TABLE IF NOT EXISTS library_private.import_sources (
  batch_id text NOT NULL REFERENCES library_private.import_batches(id) ON DELETE CASCADE,
  id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 5000),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND octet_length(data::text) <= 32768),
  PRIMARY KEY (batch_id, id),
  UNIQUE (batch_id, ordinal)
);
CREATE TABLE IF NOT EXISTS library_private.import_groups (
  batch_id text NOT NULL REFERENCES library_private.import_batches(id) ON DELETE CASCADE,
  id text NOT NULL,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND octet_length(data::text) <= 16777216),
  created_resource_id text,
  first_published_at timestamptz,
  PRIMARY KEY (batch_id, id)
);
CREATE INDEX IF NOT EXISTS import_groups_created_resource ON library_private.import_groups(created_resource_id) WHERE created_resource_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS library_private.import_receipts (
  batch_id text NOT NULL REFERENCES library_private.import_batches(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  payload_hash text NOT NULL,
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, request_id)
);
REVOKE ALL ON library_private.import_batches, library_private.import_sources,
  library_private.import_groups, library_private.import_receipts FROM PUBLIC;
-- The dedicated public reader has no USAGE on library_private and receives no new grants.
