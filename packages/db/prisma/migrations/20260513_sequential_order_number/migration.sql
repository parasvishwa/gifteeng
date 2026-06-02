-- Sequential order numbers
--
-- Replaces the legacy GFT-<base36-timestamp> random scheme with a
-- monotonic, padded counter (GFT-000001, GFT-000002, …). One sequence per
-- channel so B2C and B2B counters don't interleave.
--
-- The sequence's starting value is set to MAX(existing) + 1000 to leave a
-- visible gap between the random-suffix legacy orders and the new
-- sequential range. Pre-existing orders keep their existing orderNumber.

CREATE SEQUENCE IF NOT EXISTS order_seq_b2c START WITH 1000 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS order_seq_b2b START WITH 1000 INCREMENT BY 1;
