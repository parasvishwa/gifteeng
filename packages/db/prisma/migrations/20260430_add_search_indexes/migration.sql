-- ─────────────────────────────────────────────────────────────────────────
-- Search quality — pg_trgm + GIN indexes for ranked, typo-tolerant
-- product search.
-- ─────────────────────────────────────────────────────────────────────────
-- pg_trgm (trigram similarity): lets us rank "hammer" matches above
-- "hairband" for the query "hammre", and stays fast at 100k+ rows
-- thanks to the GIN index. ILIKE '%foo%' would scan the table.
--
-- GIN beats GIST for text similarity at the read patterns we have
-- (heavy reads, occasional writes from admin product saves).
--
-- gin_trgm_ops is the operator class that makes GIN understand
-- similarity / ILIKE patterns. Without it, the index isn't used for
-- our query shape.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "products_title_trgm_idx"
    ON "products" USING GIN ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "products_description_trgm_idx"
    ON "products" USING GIN ("description" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "products_sku_trgm_idx"
    ON "products" USING GIN ("sku" gin_trgm_ops);

-- Optional: bump the default similarity threshold from 0.3 → 0.2 for
-- the gifteeng database so "hammre" -> "hammer" (sim ≈ 0.27) still
-- matches. Lower threshold = more lenient.
ALTER DATABASE "gifteeng" SET pg_trgm.similarity_threshold = 0.2;
