PRAGMA foreign_keys = ON;

BEGIN;

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'claude', 'openrouter')),
  name TEXT NOT NULL,
  key_value TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON api_keys(provider);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_active_provider
  ON api_keys(provider)
  WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS google_sheet_ids (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sheet_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_google_sheet_ids_sheet_id ON google_sheet_ids(sheet_id);
CREATE INDEX IF NOT EXISTS idx_google_sheet_ids_name ON google_sheet_ids(name);

COMMIT;
