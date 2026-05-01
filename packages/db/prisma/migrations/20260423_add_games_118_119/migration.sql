-- Deploy 118 + 119: new GameType and CoinTxnType enum values
-- Postgres enum values can't be added transactionally; each needs its own ALTER.

ALTER TYPE "GameType" ADD VALUE IF NOT EXISTS 'daily_quest';
ALTER TYPE "GameType" ADD VALUE IF NOT EXISTS 'streak_ladder';
ALTER TYPE "GameType" ADD VALUE IF NOT EXISTS 'treasure_hunt';
ALTER TYPE "GameType" ADD VALUE IF NOT EXISTS 'goin_wager';

ALTER TYPE "CoinTxnType" ADD VALUE IF NOT EXISTS 'daily_quest';
ALTER TYPE "CoinTxnType" ADD VALUE IF NOT EXISTS 'treasure_hunt';
ALTER TYPE "CoinTxnType" ADD VALUE IF NOT EXISTS 'goin_wager';
