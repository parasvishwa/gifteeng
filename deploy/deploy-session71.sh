#!/usr/bin/env bash
# session71 — admin dashboard polish + activity-feed scale + noise filtering
#
# Bundled fixes (rolls up session70 too — the AnnouncementBar same-origin
# switch + fallback-endpoint suppression — since we never finished
# deploying that one):
#
#   1. Recent Orders dashboard widget: stop rendering "#-" + the order
#      code on a separate line. Was: `o.order_number.replace("GFT", "")`
#      which left an orphan dash on every "GFT-XXXXX" order. Now strips
#      `^(GFT|SH)-?` properly and lays the row out as
#      `[initials avatar] Customer #CODE / total / status`.
#   2. Analytics page: removed the "AI Report Summary" panel per request
#      (kept the AiSummaryCard component definition for future use, just
#      no longer rendered — saves an LLM call per analytics-page open).
#   3. Activity feed: bumped the per-fetch limit from 300 → 1000 events
#      (sized for the 500-concurrent-user target). Server hard-cap also
#      raised from 1000 → 5000 so future drill-down or CSV-export paths
#      can pull more without rejection. Hard-cap stops below 5000
#      because Postgres + the row payload over HTTP would punish us.
#      Beyond 1000 rows we'll need react-window virtualization or
#      "Load older 1000" pagination — flagged in code comments.
#   4. AnnouncementBar.tsx: same-origin /api/... path (Next.js rewrite
#      proxy) instead of cross-origin to NEXT_PUBLIC_API_BASE_URL. Adds
#      a 6-second AbortController timeout. Browser deploy-window blips
#      no longer surface as "Error 0 / Failed to fetch" in the activity
#      feed.
#   5. AnalyticsTracker.tsx: filter out browser-extension noise (MetaMask,
#      Phantom, Coinbase, Rabby, ResizeObserver loop, Script error.)
#      from both the global error handler AND the unhandled-rejection
#      handler. Also drops status-0 errors on graceful-fallback API
#      endpoints (/api/settings/*, /api/banners, /api/announcements,
#      /api/testimonials, /api/health). Keeps the feed actionable —
#      real customer-facing failures (cart/checkout/auth/payments)
#      still track.
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a
tar xzf /tmp/patch_session71.tar.gz
pnpm --filter @gifteeng/api build 2>&1 | tail -5
pnpm --filter @gifteeng/web build 2>&1 | tail -5
systemctl restart gifteeng-api
sleep 4
for i in 1 2 3 4 5 6; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "  api /health ok"
    break
  fi
  echo "  ... api not ready (attempt $i/6)"
  sleep 2
done
systemctl restart gifteeng-web
sleep 3
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/
echo "DEPLOY_OK session71"
