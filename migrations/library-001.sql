-- Run explicitly with the private database administrator connection, before enabling cloud mode.
-- No seed data: initialization is a separate reviewed CLI operation.
CREATE SCHEMA IF NOT EXISTS library_private;
CREATE SCHEMA IF NOT EXISTS library_public;
REVOKE ALL ON SCHEMA library_private FROM PUBLIC;
REVOKE ALL ON SCHEMA library_public FROM PUBLIC;

CREATE TABLE IF NOT EXISTS library_private.state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 128),
  state jsonb NOT NULL CHECK ((jsonb_typeof(state) = 'object' AND state->>'version' = '1' AND jsonb_typeof(state->'resources') = 'array') IS TRUE) CHECK (octet_length(state::text) <= 33554432),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS library_public.snapshot (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  snapshot jsonb NOT NULL CHECK ((jsonb_typeof(snapshot) = 'object' AND snapshot->>'version' = '1' AND jsonb_typeof(snapshot->'resources') = 'array') IS TRUE) CHECK (octet_length(snapshot::text) <= 33554432)
);

REVOKE ALL ON ALL TABLES IN SCHEMA library_private FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA library_public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA library_private REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA library_public REVOKE ALL ON TABLES FROM PUBLIC;
