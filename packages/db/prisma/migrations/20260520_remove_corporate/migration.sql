-- Remove the corporate (B2B bulk-gifting) offering.
--
-- The corporate plan was discontinued. This drops the 8 corporate-feature
-- tables and the two orphaned columns on `orders`.
--
-- KEPT: `companies` and `company_users` — the super-admin panel logs in
-- through those (every admin is a company_user row). Dropping them would
-- break admin auth, so they remain as inert tenancy/auth plumbing.
--
-- A full pg_dump was taken before this migration:
--   /backups/gifteeng-pre-corporate-removal.dump
--
-- CASCADE is used so any remaining FK constraints are torn down with the
-- tables. Child tables are listed before parents regardless.

DROP TABLE IF EXISTS "campaign_allocations" CASCADE;
DROP TABLE IF EXISTS "campaigns"            CASCADE;
DROP TABLE IF EXISTS "wallet_transactions"  CASCADE;
DROP TABLE IF EXISTS "wallets"              CASCADE;
DROP TABLE IF EXISTS "catalog_items"        CASCADE;
DROP TABLE IF EXISTS "catalog_enquiries"    CASCADE;
DROP TABLE IF EXISTS "catalogs"             CASCADE;
DROP TABLE IF EXISTS "company_products"     CASCADE;

-- Orphaned corporate columns on orders (loose UUIDs, no FK constraints).
ALTER TABLE "orders" DROP COLUMN IF EXISTS "walletTxnId";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "campaignAllocationId";
