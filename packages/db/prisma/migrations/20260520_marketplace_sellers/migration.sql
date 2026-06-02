-- Marketplace Phase 1 — Sellers / Vendors foundation.
--
-- Adds the `sellers` table (KYC, brand, location, payout, status) and the
-- `seller_otps` table (phone-OTP onboarding + login). Also adds a
-- nullable `brandName` column to `products` for the marketplace brand label.

-- ── Enums ────────────────────────────────────────────────────────────────
CREATE TYPE "SellerType"   AS ENUM ('individual', 'business');
CREATE TYPE "SellerStatus" AS ENUM ('pending', 'approved', 'rejected', 'suspended');
CREATE TYPE "SellerMode"   AS ENUM ('vendor_only', 'full_seller');

-- ── sellers ──────────────────────────────────────────────────────────────
CREATE TABLE "sellers" (
  "id"                UUID            NOT NULL DEFAULT gen_random_uuid(),
  "phone"             TEXT            NOT NULL,
  "email"             TEXT,
  "type"              "SellerType"    NOT NULL,
  "mode"              "SellerMode"    NOT NULL DEFAULT 'full_seller',
  "brandName"         TEXT            NOT NULL,
  "legalName"         TEXT            NOT NULL,
  "gstNumber"         TEXT,
  "panNumber"         TEXT,
  "contactName"       TEXT            NOT NULL,
  "contactPhone"      TEXT,
  "contactEmail"      TEXT,
  "addressLine"       TEXT,
  "city"              TEXT,
  "state"             TEXT,
  "pincode"           TEXT            NOT NULL,
  "bankAccountName"   TEXT,
  "bankAccountNumber" TEXT,
  "bankIfsc"          TEXT,
  "kycDocs"           JSONB,
  "status"            "SellerStatus"  NOT NULL DEFAULT 'pending',
  "rejectedReason"    TEXT,
  "chargesCourier"    BOOLEAN         NOT NULL DEFAULT false,
  "ratingAvg"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ratingCount"       INTEGER         NOT NULL DEFAULT 0,
  "createdAt"         TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)    NOT NULL,
  "approvedAt"        TIMESTAMP(3),
  CONSTRAINT "sellers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sellers_phone_key" ON "sellers" ("phone");
CREATE INDEX "sellers_status_idx"  ON "sellers" ("status");
CREATE INDEX "sellers_pincode_idx" ON "sellers" ("pincode");

-- ── seller_otps ──────────────────────────────────────────────────────────
CREATE TABLE "seller_otps" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "phone"      TEXT         NOT NULL,
  "codeHash"   TEXT         NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seller_otps_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "seller_otps_phone_idx" ON "seller_otps" ("phone");

-- ── products.brandName ───────────────────────────────────────────────────
ALTER TABLE "products" ADD COLUMN "brandName" TEXT;
