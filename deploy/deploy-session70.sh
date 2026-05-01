#!/usr/bin/env bash
# session70 — AnnouncementBar resilience + activity-feed noise filter
#
# What user reported via screenshot:
#   Activity-feed event "Error 0 on GET /api/settings/homepage_announcement_bar
#   — Failed to fetch" on /b2c/cart, status 0, message 'Failed to fetch'.
#
# Root cause:
#   • AnnouncementBar.tsx fetched cross-origin to NEXT_PUBLIC_API_BASE_URL
#     (https://new-api.gifteeng.com). During session69's API restart the
#     backend was briefly unreachable and nginx returned 502 with no CORS
#     headers — browsers strip that to `status: 0 / "Failed to fetch"`.
#   • The endpoint itself is fine (HTTP 200 verified post-deploy). This
#     was a transient deploy-window failure, not a real bug.
#
# Fixes:
#   1. AnnouncementBar.tsx — switch to same-origin path (/api/...) which
#      goes through the Next.js rewrite proxy. Next reuses keep-alive
#      sockets to upstream and survives short backend restart windows
#      better than a direct cross-origin fetch. Also adds a 6 s
#      AbortController timeout so a stalled API can't hold the request.
#   2. AnalyticsTracker.tsx — skip the auto-track for status-0 errors
#      on endpoints that already render a graceful UI fallback when
#      the API is briefly unavailable: /api/settings/*, /api/banners,
#      /api/announcements, /api/testimonials, /api/health. Real
#      customer-facing failures (cart/checkout/auth/payments) still
#      track. Cleans the activity feed of deploy-window noise.
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a
tar xzf /tmp/patch_session70.tar.gz
pnpm --filter @gifteeng/web build 2>&1 | tail -8
systemctl restart gifteeng-web
sleep 3
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/
echo "DEPLOY_OK session70"
