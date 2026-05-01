-- v2 features migration — testimonials, announcements, gift reminders,
-- device tokens (FCM push), user sticker profiles (pack economy), and
-- analytics event columns on page_views.
--
-- All statements are idempotent so re-runs or partial applies are safe.
-- Deploy via:
--   ssh <vps>  →  cd <app>  →  npx prisma migrate deploy
-- Or apply the SQL directly with psql if you don't want Prisma's marker row.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. testimonials
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "testimonials" (
  "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
  "name"          TEXT         NOT NULL,
  "avatar"        TEXT,
  "location"      TEXT,
  "rating"        INTEGER      NOT NULL DEFAULT 5,
  "text"          TEXT         NOT NULL,
  "verified"      BOOLEAN      NOT NULL DEFAULT false,
  "featured"      BOOLEAN      NOT NULL DEFAULT false,
  "status"        TEXT         NOT NULL DEFAULT 'pending',
  "product_id"    UUID,
  "product_title" TEXT,
  "product_image" TEXT,
  "product_slug"  TEXT,
  "order"         INTEGER      NOT NULL DEFAULT 0,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "testimonials_status_featured_order_idx"
  ON "testimonials" ("status", "featured", "order");

ALTER TABLE "testimonials"
  DROP CONSTRAINT IF EXISTS "testimonials_product_id_fkey";
ALTER TABLE "testimonials"
  ADD CONSTRAINT "testimonials_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. announcements (home-screen banners with time windows)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "announcements" (
  "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
  "title"        TEXT         NOT NULL,
  "subtitle"     TEXT,
  "emoji"        TEXT,
  "placement"    TEXT         NOT NULL DEFAULT 'home',
  "link"         TEXT         NOT NULL DEFAULT '/shop',
  "event_date"   TIMESTAMP(3),
  "starts_at"    TIMESTAMP(3),
  "ends_at"      TIMESTAMP(3),
  "gradient"     JSONB,
  "banner_image" TEXT,
  "active"       BOOLEAN      NOT NULL DEFAULT true,
  "order"        INTEGER      NOT NULL DEFAULT 0,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "announcements_active_placement_order_idx"
  ON "announcements" ("active", "placement", "order");

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. gift_reminders
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "gift_reminders" (
  "id"                    UUID         NOT NULL DEFAULT gen_random_uuid(),
  "customer_id"           UUID         NOT NULL,
  "occasion"              TEXT         NOT NULL,
  "recipient_name"        TEXT,
  "event_date"            TIMESTAMP(3) NOT NULL,
  "recurring"             BOOLEAN      NOT NULL DEFAULT true,
  "notify_days_before"    INTEGER      NOT NULL DEFAULT 7,
  "budget_min"            INTEGER,
  "budget_max"            INTEGER,
  "preferred_category_id" UUID,
  "product_id"            UUID,
  "auto_order"            BOOLEAN      NOT NULL DEFAULT false,
  "saved_address_id"      UUID,
  "note"                  TEXT,
  "active"                BOOLEAN      NOT NULL DEFAULT true,
  "last_notified_at"      TIMESTAMP(3),
  "last_auto_ordered_at"  TIMESTAMP(3),
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gift_reminders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "gift_reminders_customer_id_active_idx"
  ON "gift_reminders" ("customer_id", "active");
CREATE INDEX IF NOT EXISTS "gift_reminders_event_date_idx"
  ON "gift_reminders" ("event_date");

ALTER TABLE "gift_reminders"
  DROP CONSTRAINT IF EXISTS "gift_reminders_customer_id_fkey";
ALTER TABLE "gift_reminders"
  ADD CONSTRAINT "gift_reminders_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. device_tokens (FCM push)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "device_tokens" (
  "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
  "customer_id"  UUID         NOT NULL,
  "token"        TEXT         NOT NULL,
  "platform"     TEXT         NOT NULL,
  "app_version"  TEXT,
  "device_name"  TEXT,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "device_tokens_token_key"
  ON "device_tokens" ("token");
CREATE INDEX IF NOT EXISTS "device_tokens_customer_id_idx"
  ON "device_tokens" ("customer_id");

ALTER TABLE "device_tokens"
  DROP CONSTRAINT IF EXISTS "device_tokens_customer_id_fkey";
ALTER TABLE "device_tokens"
  ADD CONSTRAINT "device_tokens_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. user_sticker_profiles (pack inventory + coins earned)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_sticker_profiles" (
  "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
  "customer_id"  UUID         NOT NULL,
  "packs"        INTEGER      NOT NULL DEFAULT 3,
  "coins_earned" INTEGER      NOT NULL DEFAULT 0,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_sticker_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_sticker_profiles_customer_id_key"
  ON "user_sticker_profiles" ("customer_id");

ALTER TABLE "user_sticker_profiles"
  DROP CONSTRAINT IF EXISTS "user_sticker_profiles_customer_id_fkey";
ALTER TABLE "user_sticker_profiles"
  ADD CONSTRAINT "user_sticker_profiles_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. page_views: add analytics event columns + indexes
-- Historically this table stored only page views; now we also log named
-- events (e.g. "pack_open", "checkout_success") with arbitrary props.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "page_views"
  ADD COLUMN IF NOT EXISTS "event"       TEXT,
  ADD COLUMN IF NOT EXISTS "props"       JSONB,
  ADD COLUMN IF NOT EXISTS "platform"    TEXT,
  ADD COLUMN IF NOT EXISTS "app_version" TEXT;

CREATE INDEX IF NOT EXISTS "page_views_event_created_at_idx"
  ON "page_views" ("event", "created_at");
CREATE INDEX IF NOT EXISTS "page_views_customer_id_created_at_idx"
  ON "page_views" ("customer_id", "created_at");

COMMIT;
