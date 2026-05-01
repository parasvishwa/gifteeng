-- ─────────────────────────────────────────────────────────────────────────
-- Return / RMA flow
-- ─────────────────────────────────────────────────────────────────────────
-- Adds ReturnStatus enum + return_requests table. Customer-initiated
-- request, admin-managed lifecycle (approve / reject / receive / refund /
-- cancel). Refund itself stays in order.metadata.refunds[]; this table
-- records the WORKFLOW around it.

CREATE TYPE "ReturnStatus" AS ENUM ('pending', 'approved', 'rejected', 'received', 'refunded', 'cancelled');

CREATE TABLE "return_requests" (
    "id"              UUID         NOT NULL,
    "orderId"         UUID         NOT NULL,
    "orderItemId"     UUID,
    "customerId"      UUID         NOT NULL,
    "qty"             INTEGER      NOT NULL DEFAULT 1,
    "reason"          TEXT         NOT NULL,
    "details"         TEXT,
    "photos"          TEXT[]       DEFAULT ARRAY[]::TEXT[],
    "status"          "ReturnStatus" NOT NULL DEFAULT 'pending',
    "approvedAt"      TIMESTAMP(3),
    "approvedById"    UUID,
    "rejectedAt"      TIMESTAMP(3),
    "rejectReason"    TEXT,
    "pickupAddress"   JSONB,
    "carrier"         TEXT,
    "trackingNumber"  TEXT,
    "receivedAt"      TIMESTAMP(3),
    "refundedAt"      TIMESTAMP(3),
    "refundEntry"     JSONB,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "return_requests_orderId_idx"                ON "return_requests"("orderId");
CREATE INDEX "return_requests_customerId_status_idx"      ON "return_requests"("customerId", "status");
CREATE INDEX "return_requests_status_createdAt_idx"       ON "return_requests"("status", "createdAt");

ALTER TABLE "return_requests"
    ADD CONSTRAINT "return_requests_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "return_requests"
    ADD CONSTRAINT "return_requests_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
