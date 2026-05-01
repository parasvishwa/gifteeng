-- ─────────────────────────────────────────────────────────────────────
-- DPDP Act compliance — consent records, data exports, deletion requests
-- ─────────────────────────────────────────────────────────────────────

CREATE TYPE "ConsentCategory" AS ENUM (
    'essential', 'analytics', 'marketing', 'ai_personalization'
);

CREATE TYPE "DataExportStatus" AS ENUM (
    'pending', 'ready', 'expired', 'cancelled'
);

-- Customer additions
ALTER TABLE "customers"
    ADD COLUMN IF NOT EXISTS "data_deletion_scheduled_for" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "dpdp_anonymized_at"          TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "customers_data_deletion_scheduled_for_idx"
    ON "customers"("data_deletion_scheduled_for");

-- ConsentRecord
CREATE TABLE "consent_records" (
    "id"             UUID         NOT NULL,
    "customerId"     UUID         NOT NULL,
    "category"       "ConsentCategory" NOT NULL,
    "granted"        BOOLEAN      NOT NULL,
    "policyVersion"  TEXT         NOT NULL DEFAULT '1.0',
    "source"         TEXT,
    "ipAddress"      TEXT,
    "userAgent"      TEXT,
    "recordedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "consent_records_customerId_category_recordedAt_idx"
    ON "consent_records"("customerId", "category", "recordedAt");

ALTER TABLE "consent_records"
    ADD CONSTRAINT "consent_records_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- DataExportRequest
CREATE TABLE "data_export_requests" (
    "id"           UUID               NOT NULL,
    "customerId"   UUID               NOT NULL,
    "status"       "DataExportStatus" NOT NULL DEFAULT 'pending',
    "payload"      JSONB,
    "sizeBytes"    INTEGER,
    "createdAt"    TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt"      TIMESTAMP(3),
    "expiresAt"    TIMESTAMP(3),
    CONSTRAINT "data_export_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "data_export_requests_customerId_createdAt_idx"
    ON "data_export_requests"("customerId", "createdAt");
CREATE INDEX "data_export_requests_status_expiresAt_idx"
    ON "data_export_requests"("status", "expiresAt");

ALTER TABLE "data_export_requests"
    ADD CONSTRAINT "data_export_requests_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
