-- Additive private configuration only. Keys are authenticated ciphertext, never resource JSON.
CREATE TABLE IF NOT EXISTS library_private.smart_api_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 128),
  config_id text NOT NULL DEFAULT 'primary' CHECK (config_id = 'primary'),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  settings jsonb NOT NULL CHECK (jsonb_typeof(settings) = 'object') CHECK (octet_length(settings::text) <= 16384),
  encrypted_key jsonb CHECK (encrypted_key IS NULL OR (jsonb_typeof(encrypted_key) = 'object' AND octet_length(encrypted_key::text) <= 8192)),
  enabled boolean NOT NULL DEFAULT false,
  tested_version bigint,
  tested_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_test_started_at timestamptz,
  test_active_until timestamptz,
  test_claim_id text,
  CHECK (tested_version IS NULL OR tested_version = version),
  CHECK (NOT enabled OR (encrypted_key IS NOT NULL AND tested_version IS NOT NULL AND tested_version = version))
);
REVOKE ALL ON library_private.smart_api_settings FROM PUBLIC;
