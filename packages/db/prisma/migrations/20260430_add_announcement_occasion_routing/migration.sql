-- Announcement → Occasion routing.
--
-- Adds three optional columns to the existing `announcements` table so the
-- admin can wire each announcement banner to a slugged shop view + a list
-- of collections / categories it should pre-filter on. The mobile Shop-Now
-- CTA reads `slug` to build /shop?occasion=<slug>, and the shop screen can
-- (in a future iteration) read collection/category arrays for richer
-- multi-facet filtering.
--
-- All three columns are nullable / default to NULL so existing rows stay
-- valid and the migration is reversible by dropping the columns.

ALTER TABLE "announcements"
  ADD COLUMN "slug"             TEXT,
  ADD COLUMN "collection_slugs" JSONB,
  ADD COLUMN "category_names"   JSONB;
