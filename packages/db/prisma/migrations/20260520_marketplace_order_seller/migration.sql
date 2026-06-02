-- Marketplace Phase 3 — thread the chosen seller through cart + orders.
--
-- Adds a nullable `sellerProductId` to cart_items and order_items so a
-- buyer's chosen seller offer flows from the product page into the cart
-- and onto the placed order. Nullable: house-catalogue lines (no seller)
-- and all pre-existing rows stay valid.

ALTER TABLE "cart_items"  ADD COLUMN "sellerProductId" UUID;
ALTER TABLE "order_items" ADD COLUMN "sellerProductId" UUID;

ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_sellerProductId_fkey"
  FOREIGN KEY ("sellerProductId") REFERENCES "seller_products" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_sellerProductId_fkey"
  FOREIGN KEY ("sellerProductId") REFERENCES "seller_products" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "order_items_sellerProductId_idx" ON "order_items" ("sellerProductId");
