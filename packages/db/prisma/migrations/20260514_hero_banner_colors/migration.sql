-- Per-banner color customization.
--
-- Admin can override the cream/rose default palette per-slide so each
-- banner can match its product's mood (e.g. Diwali → maroon/gold,
-- Birthday → pastel pink). All four columns are nullable — NULL falls
-- back to the brand-default look at render time.
--
--   text_bg_color     → CSS color or gradient for the LEFT half background
--   text_color        → main heading/subtitle text color
--   accent_color      → highlight color for headingAccent
--   button_color      → primary button background color (text is auto-contrasted)

ALTER TABLE "hero_banners"
  ADD COLUMN "text_bg_color"  VARCHAR(120),
  ADD COLUMN "text_color"     VARCHAR(40),
  ADD COLUMN "accent_color"   VARCHAR(40),
  ADD COLUMN "button_color"   VARCHAR(40);
