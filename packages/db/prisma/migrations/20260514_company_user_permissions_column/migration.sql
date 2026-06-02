-- Add the `permissions` column to company_users.
--
-- The Prisma schema introduced this column when the granular permission
-- system shipped (see auth-b2b/permissions.ts), but the matching SQL
-- migration was missing on production — every authenticated admin
-- request was throwing 500 because JwtB2bStrategy.validate() couldn't
-- SELECT a column the database didn't have. This bug masked itself as
-- "category drag doesn't work", since every PATCH /api/categories/admin/:id
-- returned 500 from the auth layer before the controller body even ran.
--
-- Backfill: every existing row gets an empty array, which is fine because
-- the permissions guard treats an empty array as "use role-based defaults"
-- (super_admin still has full access via the role check).

ALTER TABLE "company_users"
  ADD COLUMN IF NOT EXISTS "permissions" TEXT[] NOT NULL DEFAULT '{}';
