CREATE TABLE IF NOT EXISTS app_users (
  user_id TEXT PRIMARY KEY,
  app_name TEXT,
  social_type TEXT,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  user_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  avatar TEXT NOT NULL,
  capital INTEGER NOT NULL DEFAULT 10000,
  sold INTEGER NOT NULL DEFAULT 0,
  bought INTEGER NOT NULL DEFAULT 0,
  stall_x REAL,
  stall_z REAL,
  pos_x REAL,
  pos_z REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_players_capital ON players (capital DESC);
