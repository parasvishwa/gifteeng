-- Deploy 121 — Product game modes (guess price / daily deal / product wheel)
ALTER TABLE "product_drop_configs"
  ADD COLUMN IF NOT EXISTS "game_mode" TEXT NOT NULL DEFAULT 'drop',
  ADD COLUMN IF NOT EXISTS "mode_config" JSONB;

CREATE INDEX IF NOT EXISTS "product_drop_configs_mode_active_idx"
  ON "product_drop_configs" ("game_mode", "is_active");
