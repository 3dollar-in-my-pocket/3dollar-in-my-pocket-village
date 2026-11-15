CREATE TABLE IF NOT EXISTS funnel_events (
  day TEXT NOT NULL,
  user_id TEXT NOT NULL,
  step TEXT NOT NULL,
  first_at INTEGER NOT NULL,
  PRIMARY KEY (day, user_id, step)
);

CREATE TABLE IF NOT EXISTS daily_counters (
  day TEXT NOT NULL,
  key TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, key)
);

-- 그날 처음 온 사람 중 몇 명이 캐릭터 생성 → 가게 차리기 → 영업 시작 → 첫 판매까지 갔는지
CREATE VIEW IF NOT EXISTS daily_funnel AS
WITH first_visit AS (
  SELECT user_id, MIN(day) AS day FROM daily_visits GROUP BY user_id
),
new_steps AS (
  SELECT f.day AS day, e.step AS step, COUNT(*) AS n
  FROM first_visit f
  JOIN funnel_events e ON e.user_id = f.user_id AND e.day = f.day
  GROUP BY f.day, e.step
)
SELECT
  d.day AS day,
  COALESCE((SELECT n FROM daily_counters c WHERE c.day = d.day AND c.key = 'page_view'), 0) AS page_views,
  (SELECT COUNT(*) FROM daily_visits v WHERE v.day = d.day) AS visitors,
  (SELECT COUNT(*) FROM first_visit f WHERE f.day = d.day) AS new_visitors,
  COALESCE((SELECT n FROM new_steps s WHERE s.day = d.day AND s.step = 'join'), 0) AS new_joined,
  COALESCE((SELECT n FROM new_steps s WHERE s.day = d.day AND s.step = 'stall'), 0) AS new_stall,
  COALESCE((SELECT n FROM new_steps s WHERE s.day = d.day AND s.step = 'open'), 0) AS new_open,
  COALESCE((SELECT n FROM new_steps s WHERE s.day = d.day AND s.step = 'sale'), 0) AS new_sale,
  COALESCE((SELECT n FROM new_steps s WHERE s.day = d.day AND s.step = 'buy'), 0) AS new_buy
FROM (SELECT day FROM daily_visits GROUP BY day) d
ORDER BY d.day DESC;
