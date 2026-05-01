-- HeroBanner — pure-image hero slides, identical web + Flutter.
-- Replaces the overlay-heavy Announcement-as-hero pattern with a simpler
-- image-is-the-banner approach (Hyuga-style). One source image, used
-- as-is on every surface, no app-rendered text/CTA chrome.

CREATE TABLE "hero_banners" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "imageUrl"    TEXT         NOT NULL,
    "linkUrl"     TEXT         NOT NULL DEFAULT '/shop',
    "placement"   TEXT         NOT NULL DEFAULT 'home',
    "altText"     TEXT,
    "startsAt"    TIMESTAMP(3),
    "endsAt"      TIMESTAMP(3),
    "sortOrder"   INTEGER      NOT NULL DEFAULT 0,
    "isActive"    BOOLEAN      NOT NULL DEFAULT true,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_banners_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hero_banners_placement_isActive_sortOrder_idx"
    ON "hero_banners"("placement", "isActive", "sortOrder");
