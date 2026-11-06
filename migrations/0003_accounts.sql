CREATE TABLE IF NOT EXISTS accounts (
  threedollars_user_id TEXT PRIMARY KEY,
  player_key TEXT NOT NULL UNIQUE,
  app_name TEXT,
  social_type TEXT,
  linked_from_guest INTEGER NOT NULL DEFAULT 0,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
