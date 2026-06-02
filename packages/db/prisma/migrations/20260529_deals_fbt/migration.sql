-- Add MRP and discount fields
ALTER TABLE products ADD COLUMN IF NOT EXISTS mrp DECIMAL(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_pct INTEGER;
CREATE INDEX IF NOT EXISTS products_discount_pct_b2c_enabled_idx ON products(discount_pct, b2c_enabled);

-- FBT self-relation junction table
CREATE TABLE IF NOT EXISTS "_ProductFBT" (
  "A" UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  "B" UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "_ProductFBT_AB_unique" ON "_ProductFBT"("A","B");
CREATE INDEX IF NOT EXISTS "_ProductFBT_B_index" ON "_ProductFBT"("B");
