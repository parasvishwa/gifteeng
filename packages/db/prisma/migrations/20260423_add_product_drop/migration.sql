-- Deploy 120 — Product Drop game
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Free-form metadata on GamePlay (also fixes Deploy 118/119 callers).
ALTER TABLE "game_plays" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- 2. product_drop enum value on GameType.
ALTER TYPE "GameType" ADD VALUE IF NOT EXISTS 'product_drop';

-- 3. ProductDropConfig table.
CREATE TABLE IF NOT EXISTS "product_drop_configs" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id"          UUID NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "shipping_inr"        INTEGER NOT NULL,
  "win_odds_pct"        DECIMAL(5, 2) NOT NULL DEFAULT 1.0,
  "daily_limit"         INTEGER NOT NULL DEFAULT 1,
  "max_winners"         INTEGER,
  "winners_count"       INTEGER NOT NULL DEFAULT 0,
  "claim_window_hours"  INTEGER NOT NULL DEFAULT 72,
  "is_active"           BOOLEAN NOT NULL DEFAULT true,
  "starts_at"           TIMESTAMP(3),
  "ends_at"             TIMESTAMP(3),
  "title"               TEXT,
  "subtitle"            TEXT,
  "banner_image"        TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "product_drop_configs_active_idx"
  ON "product_drop_configs" ("is_active", "starts_at", "ends_at");
