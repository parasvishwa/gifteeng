-- Session 150: seller store page, followers, product views, trademark fields
-- Run with: psql $DATABASE_URL -f session150.sql
-- NOTE: Prisma uses camelCase column names when no @map() annotation is present.

-- Seller: store slug and follower count
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS "followerCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS "hasTrademark" BOOLEAN;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS "trademarkNumber" TEXT;

-- SellerProduct: view tracking
ALTER TABLE seller_products ADD COLUMN IF NOT EXISTS "viewCount" INTEGER NOT NULL DEFAULT 0;

-- SellerFollower table (camelCase FK columns to match Prisma conventions)
CREATE TABLE IF NOT EXISTS seller_followers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "sellerId"  UUID        NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  "customerId" UUID       NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT seller_followers_unique UNIQUE ("sellerId", "customerId")
);
CREATE INDEX IF NOT EXISTS "idx_seller_followers_customer" ON seller_followers("customerId");

-- Back-fill slugs for existing sellers
UPDATE sellers
SET slug = LOWER(REGEXP_REPLACE(
            REGEXP_REPLACE("brandName", '[^a-zA-Z0-9]+', '-', 'g'),
            '^-+|-+$', '', 'g'
          )) || '-' || LEFT(id::TEXT, 8)
WHERE slug IS NULL;
