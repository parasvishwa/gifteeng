-- ─── Add per-user permissions array to company_users ──────────────────────
-- Granular permission strings (e.g. "products.create", "categories.delete").
-- Used alongside `role` so a single user can be granted permissions from
-- multiple feature areas without inventing a new role. The `super_admin`
-- role bypasses this list (full access). See
-- apps/api/src/modules/auth-b2b/permissions.ts for the canonical catalog.

ALTER TABLE "company_users"
  ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
