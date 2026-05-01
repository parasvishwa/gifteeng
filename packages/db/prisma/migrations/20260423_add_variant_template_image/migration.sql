-- Deploy 120: per-value thumbnail on variant templates
-- Used for Design / Style / Theme attributes where a hex swatch isn't enough.
-- Also auto-populates the product-level variant row image when admin adds
-- this value to a product.

ALTER TABLE "product_variant_templates"
  ADD COLUMN IF NOT EXISTS "image_url" TEXT;
