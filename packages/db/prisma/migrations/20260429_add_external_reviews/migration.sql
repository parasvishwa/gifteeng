-- ExternalReview — aggregated reviews from third-party marketplaces
-- (Amazon, Flipkart, Myntra, Google, Meesho, etc.) + manual entry.
-- Native Gifteeng reviews stay in the `reviews` table; the public /reviews
-- page UNIONs both sources, filtered to rating >= 4.

CREATE TABLE "external_reviews" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "source"       TEXT         NOT NULL,
    "sourceLogo"   TEXT,
    "sourceUrl"    TEXT,
    "rating"       INTEGER      NOT NULL,
    "title"        TEXT,
    "body"         TEXT         NOT NULL,
    "author"       TEXT,
    "authorAvatar" TEXT,
    "reviewDate"   TIMESTAMP(3),
    "productId"    UUID,
    "isApproved"   BOOLEAN      NOT NULL DEFAULT false,
    "sortOrder"    INTEGER      NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_reviews_pkey"     PRIMARY KEY ("id"),
    CONSTRAINT "external_reviews_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "products"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "external_reviews_isApproved_rating_sortOrder_idx"
    ON "external_reviews"("isApproved", "rating", "sortOrder");
CREATE INDEX "external_reviews_source_isApproved_idx"
    ON "external_reviews"("source", "isApproved");
CREATE INDEX "external_reviews_productId_idx"
    ON "external_reviews"("productId");
