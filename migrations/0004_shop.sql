-- 상점: 누적 매출(랭킹 기준)과 장비·속재료 구매 내역
ALTER TABLE players ADD COLUMN earned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN upgrades TEXT;

-- 기존 유저 누적 매출 추정: 자본 변화 + 사 먹은 붕어빵(마리당 약 800원)
UPDATE players SET earned = MAX(0, capital - 10000 + bought * 800);

CREATE INDEX IF NOT EXISTS idx_players_earned ON players (earned DESC);
