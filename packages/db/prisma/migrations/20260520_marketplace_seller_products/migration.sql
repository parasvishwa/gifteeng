-- Marketplace Phase 2 — Seller product offers.
--
-- Adds the `seller_products` table: a seller's offer to sell a product,
-- either an own listing or a request to also sell an existing catalogue
-- product. Each offer is verified by a super-admin before going live.

-- ── Enum ─────────────────────────────────────────────────────────────────
CREATE TYPE "SellerProductStatus" AS ENUM ('pending', 'approved', 'rejected');

-- ── seller_products ──────────────────────────────────────────────────────
CREATE TABLE "seller_products" (
  "id"             UUID                  NOT NULL DEFAULT gen_random_uuid(),
  "sellerId"       UUID                  NOT NULL,
  "productId"      UUID                  NOT NULL,
  "isOwnListing"   BOOLEAN               NOT NULL DEFAULT false,
  "price"          DECIMAL(12,2)         NOT NULL,
  "stock"          INTEGER               NOT NULL DEFAULT 0,
  "status"         "SellerProductStatus" NOT NULL DEFAULT 'pending',
  "rejectedReason" TEXT,
  "ratingAvg"      DOUBLE PRECISION      NOT NULL DEFAULT 0,
  "ratingCount"    INTEGER               NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)          NOT NULL,
  "approvedAt"     TIMESTAMP(3),
  CONSTRAINT "seller_products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seller_products_sellerId_fkey"  FOREIGN KEY ("sellerId")  REFERENCES "sellers"  ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "seller_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "seller_products_sellerId_productId_key" ON "seller_products" ("sellerId", "productId");
CREATE INDEX "seller_products_status_idx"             ON "seller_products" ("status");
CREATE INDEX "seller_products_productId_status_idx"   ON "seller_products" ("productId", "status");
CREATE INDEX "seller_products_sellerId_status_idx"    ON "seller_products" ("sellerId", "status");
