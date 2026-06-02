-- Add the missing FK between return_requests.orderItemId and order_items.id
-- so deleting an OrderItem (e.g. via the admin Edit-order flow) doesn't
-- leave dangling orderItemId references on RMA rows.
--
-- ON DELETE SET NULL is correct here because:
--   1. orderItemId is already nullable (it's optional — null = whole-order RMA)
--   2. We don't want to cascade-delete the RMA itself; the customer's
--      audit trail of "I asked for a return" should survive even if the
--      order line they referred to was later edited away.
--
-- The accompanying app-level guard (orders.service editOrder) refuses to
-- remove a line that has any non-terminal RMA, so this NULL fallback is
-- only reached when somebody deletes the row through psql directly or
-- via a future admin "force delete" path.

ALTER TABLE "return_requests"
    ADD CONSTRAINT "return_requests_orderItemId_fkey"
    FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "return_requests_orderItemId_idx"
    ON "return_requests"("orderItemId");
