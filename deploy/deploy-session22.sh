#!/usr/bin/env bash
# Deploy session 22 — Admin-managed Legal & Policy links
#
# Fixes shipped:
#   S22-1  apps/api/src/modules/admin/admin.module.ts
#          - GET /settings/public now includes `legal_links` object
#            { privacy_policy, terms, shipping, returns }
#          - Defaults fall back to gifteeng.com/... URLs if not set in DB
#
#   S22-2  apps/web/app/b2b/super-admin/settings/page.tsx
#          - New "Legal Links" tab added to Settings page
#          - Four URL inputs: Privacy Policy, Terms, Shipping, Return & Refund
#          - Saves to `legal_links` SiteSetting key via existing PATCH endpoint
#          - Loads on page open, saved alongside all other settings
#
#   S22-3  apps/mobile/lib/features/account/presentation/screens/profile_subscreens.dart
#          - HelpScreen converted from StatelessWidget → ConsumerWidget
#          - _legalLinksProvider fetches GET /settings/public on open
#          - Policy tiles use fetched URLs, fall back to gifteeng.com defaults
#          - Works offline / on error with fallback defaults
#
# Run on server as root:
#   bash /tmp/deploy-session22.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session22.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "❌  $PATCH not found — scp it first:"
  echo "    scp deploy/patch_session22.tar.gz root@217.216.59.87:/tmp/"
  exit 1
fi

log "Extracting patch…"
cd "$DIR"
tar xzf "$PATCH"
echo "✅  Files extracted"

log "Building @gifteeng/api (~1 min)…"
pnpm --filter=@gifteeng/api build 2>&1 | tail -20

log "Building @gifteeng/web (admin settings page) (~2–3 min)…"
pnpm --filter=@gifteeng/web build 2>&1 | tail -25

log "Fixing .next/ ownership…"
chown -R gifteeng:gifteeng "$DIR/apps/web/.next"
echo "  ✅ .next/ owned by gifteeng"

log "Restarting services…"
systemctl restart gifteeng-api
sleep 3
systemctl restart gifteeng-web
sleep 5

log "Health checks…"
for i in 1 2 3 4 5; do
  if curl -fsS -o /dev/null http://127.0.0.1:3001/settings/public; then
    echo "  ✅ API /settings/public ok"
    break
  fi
  echo "  ... API not ready (attempt $i/5)"; sleep 4
done

for i in 1 2 3 4 5; do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
    echo "  ✅ web ok"
    break
  fi
  echo "  ... web not ready (attempt $i/5)"; sleep 4
done

echo ""
echo "=========================================="
echo "  SESSION 22 DEPLOY COMPLETE"
echo "=========================================="
echo "  Web admin: https://new.gifteeng.com/b2b/super-admin/settings"
echo "             → Click 'Legal Links' tab to update policy URLs"
echo ""
echo "  API endpoint: GET /settings/public"
echo "  Now includes: legal_links.privacy_policy / .terms / .shipping / .returns"
echo ""
echo "  Flutter: policy URLs now fetched live from API (fallback to defaults)"
echo ""
