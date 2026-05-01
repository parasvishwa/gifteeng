-- Pre-aggregated daily rollup of page_views events.
-- Populated nightly from raw page_views; lets dashboards read historical
-- date-range stats without scanning raw events. Combined with a 90-day
-- prune on page_views, this keeps storage bounded and queries fast even
-- at 100M+ raw events.

CREATE TABLE "page_view_daily_summary" (
    "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
    "date"             DATE         NOT NULL,
    "event"            TEXT         NOT NULL,
    "platform"         TEXT         NOT NULL,
    "count"            INTEGER      NOT NULL,
    "unique_sessions"  INTEGER      NOT NULL DEFAULT 0,
    "unique_customers" INTEGER      NOT NULL DEFAULT 0,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_view_daily_summary_pkey" PRIMARY KEY ("id")
);

-- One row per (day, event, platform) — idempotent rollup uses this.
CREATE UNIQUE INDEX "page_view_daily_summary_date_event_platform_key"
    ON "page_view_daily_summary"("date", "event", "platform");

-- Common access patterns:
CREATE INDEX "page_view_daily_summary_date_idx"
    ON "page_view_daily_summary"("date");

CREATE INDEX "page_view_daily_summary_event_date_idx"
    ON "page_view_daily_summary"("event", "date");
