-- Add scheduledDispatchAt to order_item_assignments
ALTER TABLE "order_item_assignments" ADD COLUMN IF NOT EXISTS "scheduledDispatchAt" TIMESTAMP(3);
