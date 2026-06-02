-- Add dispatchDays to sellers table
ALTER TABLE "sellers" ADD COLUMN IF NOT EXISTS "dispatchDays" INTEGER NOT NULL DEFAULT 2;
