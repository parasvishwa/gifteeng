-- Add per-banner text overlay fields to hero_banners.
--
-- Each banner is now a full hero "slide" with its own headline, subtitle
-- and CTAs that render alongside the image in a side-by-side composition.
-- Existing rows keep all text fields NULL — the web/Flutter slider checks
-- for any non-null text field and falls back to the legacy image-only
-- rendering if none are present, so this migration is non-breaking.

ALTER TABLE "hero_banners"
  ADD COLUMN "tagline"        VARCHAR(80),
  ADD COLUMN "heading"        VARCHAR(160),
  ADD COLUMN "heading_accent" VARCHAR(80),
  ADD COLUMN "subtitle"       VARCHAR(240),
  ADD COLUMN "button1_text"   VARCHAR(40),
  ADD COLUMN "button1_link"   VARCHAR(500),
  ADD COLUMN "button2_text"   VARCHAR(40),
  ADD COLUMN "button2_link"   VARCHAR(500);
