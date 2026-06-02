-- Migration: 20260520_order_routing
-- Phase 4: seller order assignment + cascade routing

CREATE TYPE "AssignmentStatus" AS ENUM (
  'pending', 'accepted', 'processing', 'dispatched',
  'delivered', 'returned', 'floating', 'cancelled'
);

CREATE TABLE "order_item_assignments" (
  "id"              UUID          NOT NULL DEFAULT gen_random_uuid(),
  "orderItemId"     UUID          NOT NULL,
  "sellerId"        UUID          NOT NULL,
  "sellerProductId" UUID,
  "status"          "AssignmentStatus" NOT NULL DEFAULT 'pending',
  "attemptNumber"   INTEGER       NOT NULL DEFAULT 1,
  "assignedAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deadlineAt"      TIMESTAMP(3)  NOT NULL,
  "acceptedAt"      TIMESTAMP(3),
  "dispatchedAt"    TIMESTAMP(3),
  "deliveredAt"     TIMESTAMP(3),
  "returnedAt"      TIMESTAMP(3),
  "useOwnCourier"   BOOLEAN       NOT NULL DEFAULT false,
  "courier"         TEXT,
  "awb"             TEXT,
  "trackingUrl"     TEXT,
  "notes"           TEXT,
  "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "order_item_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_item_assignments_orderItemId_fkey"
    FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE,
  CONSTRAINT "order_item_assignments_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE CASCADE,
  CONSTRAINT "order_item_assignments_sellerProductId_fkey"
    FOREIGN KEY ("sellerProductId") REFERENCES "seller_products"("id") ON DELETE SET NULL
);

CREATE INDEX "order_item_assignments_orderItemId_idx" ON "order_item_assignments"("orderItemId");
CREATE INDEX "order_item_assignments_sellerId_idx"    ON "order_item_assignments"("sellerId");
CREATE INDEX "order_item_assignments_status_idx"      ON "order_item_assignments"("status");
CREATE INDEX "order_item_assignments_deadlineAt_idx"  ON "order_item_assignments"("deadlineAt");
