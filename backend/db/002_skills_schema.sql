PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('hard', 'soft')),
  value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_type_normalized_value
  ON skills(type, normalized_value);

CREATE INDEX IF NOT EXISTS idx_skills_type_value
  ON skills(type, value);
