CREATE TABLE IF NOT EXISTS daily_visits (
  day TEXT NOT NULL,
  user_id TEXT NOT NULL,
  first_at INTEGER NOT NULL,
  PRIMARY KEY (day, user_id)
);

CREATE TABLE IF NOT EXISTS daily_stats (
  day TEXT PRIMARY KEY,
  peak_active INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE VIEW IF NOT EXISTS daily_visitors AS
SELECT
  v.day AS day,
  COUNT(*) AS visitors,
  SUM(CASE WHEN date(a.first_seen_at / 1000, 'unixepoch', '+9 hours') = v.day THEN 1 ELSE 0 END) AS new_visitors,
  COUNT(*) - SUM(CASE WHEN date(a.first_seen_at / 1000, 'unixepoch', '+9 hours') = v.day THEN 1 ELSE 0 END) AS returning_visitors,
  COALESCE(MAX(s.peak_active), 0) AS peak_concurrent
FROM daily_visits v
LEFT JOIN app_users a ON a.user_id = v.user_id
LEFT JOIN daily_stats s ON s.day = v.day
GROUP BY v.day
ORDER BY v.day DESC;
