-- Migration: 20260520_seller_payouts
-- Phase 5: seller payouts + platform commission settings

CREATE TYPE "PayoutStatus" AS ENUM (
  'pending', 'eligible', 'processing', 'paid', 'cancelled'
);

CREATE TABLE "platform_settings" (
  "key"       TEXT         NOT NULL,
  "value"     JSONB        NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- Seed default commission rate (10%)
INSERT INTO "platform_settings" ("key", "value")
VALUES ('marketplace_commission_rate', '0.10')
ON CONFLICT DO NOTHING;

CREATE TABLE "seller_payouts" (
  "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
  "sellerId"         UUID          NOT NULL,
  "grossAmount"      DECIMAL(12,2) NOT NULL,
  "commissionRate"   DECIMAL(5,4)  NOT NULL,
  "commissionAmount" DECIMAL(12,2) NOT NULL,
  "netAmount"        DECIMAL(12,2) NOT NULL,
  "status"           "PayoutStatus" NOT NULL DEFAULT 'eligible',
  "paymentRef"       TEXT,
  "notes"            TEXT,
  "paidAt"           TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "seller_payouts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seller_payouts_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE
);

CREATE INDEX "seller_payouts_sellerId_idx" ON "seller_payouts"("sellerId");
CREATE INDEX "seller_payouts_status_idx"   ON "seller_payouts"("status");

CREATE TABLE "seller_payout_items" (
  "id"           UUID          NOT NULL DEFAULT gen_random_uuid(),
  "payoutId"     UUID          NOT NULL,
  "assignmentId" UUID          NOT NULL,
  "grossAmount"  DECIMAL(12,2) NOT NULL,

  CONSTRAINT "seller_payout_items_pkey"        PRIMARY KEY ("id"),
  CONSTRAINT "seller_payout_items_assignmentId_key" UNIQUE ("assignmentId"),
  CONSTRAINT "seller_payout_items_payoutId_fkey"
    FOREIGN KEY ("payoutId") REFERENCES "seller_payouts"("id") ON DELETE CASCADE,
  CONSTRAINT "seller_payout_items_assignmentId_fkey"
    FOREIGN KEY ("assignmentId") REFERENCES "order_item_assignments"("id")
);

CREATE INDEX "seller_payout_items_payoutId_idx" ON "seller_payout_items"("payoutId");
