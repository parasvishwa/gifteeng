#!/usr/bin/env bash
# session55 — Marketing & analytics tag manager admin UI
#
# Backend:
#   • admin.module.ts — `marketing_config` added to the public-readable
#     allowlist so the b2c web layout can fetch it at first paint.
#     `marketing_secrets` (CAPI access token, etc.) stays server-side.
#
# Web:
#   • New /super-admin/marketing page — single form for GTM, GA4, Meta
#     Pixel, Meta CAPI, Google Ads, Search Console verification, and a
#     master enable/disable switch.
#   • New _components/chrome/MarketingScripts.tsx — server component
#     that reads `marketing_config` and injects the configured
#     trackers. Each tracker is gated by its own ID, so an empty field
#     renders nothing. Includes the GTM <noscript> iframe fallback.
#   • b2c/layout.tsx mounts MarketingScripts + MarketingNoScript at
#     the top of the tree. Layout is now async + force-dynamic so a
#     config change reflects on the next request (60s revalidate).
#   • AdminSidebar.tsx — new "Marketing" entry in the System section.
set -euo pipefail

cd /srv/gifteeng
set -a
. /srv/gifteeng/.env
set +a

tar xzf /tmp/patch_session55.tar.gz

pnpm --filter @gifteeng/api build
pnpm --filter @gifteeng/web build

systemctl restart gifteeng-api
sleep 4
systemctl restart gifteeng-web
sleep 3

for i in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "  api /health ok"
    break
  fi
  echo "  ... api not ready yet (attempt $i/5)"
  sleep 2
done

# Smoke-test the new public settings key — should return {key, value:null}
# until an admin saves something, but it MUST not 404.
curl -fsS http://127.0.0.1:4000/api/settings/marketing_config | head -c 200
echo

echo
echo "DEPLOY_OK session55"
