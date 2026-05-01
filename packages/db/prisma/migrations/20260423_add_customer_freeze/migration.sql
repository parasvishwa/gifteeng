-- Deploy 117: fraud-watch freeze on Customer
ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "is_frozen"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "frozen_at"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "frozen_reason" TEXT;

CREATE INDEX IF NOT EXISTS "customers_is_frozen_idx" ON "customers" ("is_frozen");
