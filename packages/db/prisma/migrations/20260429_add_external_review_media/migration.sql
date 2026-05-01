-- ExternalReview now stores reviewer-attached media so the Chrome extension's
-- scraped images/videos persist through bulk-import.

ALTER TABLE "external_reviews"
  ADD COLUMN "photoUrls" JSONB,
  ADD COLUMN "videoUrl"  TEXT;
