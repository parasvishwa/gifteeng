#!/usr/bin/env bash
# Deploy session 10 — account page revamp, checkout fix, PDP image fix, customizer fix
#
# Fixes shipped:
#   S10-1  auth-b2c/addresses.controller.ts  — NEW: GET/POST/DELETE /api/addresses
#   S10-2  auth-b2c/auth-b2c.module.ts       — register AddressesController
#   S10-3  account/page.tsx                  — revamped UI, address save works, orders list fixed
#   S10-4  checkout/page.tsx                 — stale cart race condition: wait for onB2cLogin before redirect
#   S10-5  products/[slug]/ImageGallery.tsx  — onError fallback (broken images show 🎁 placeholder)
#   S10-6  customize/[slug]/page.tsx         — switchDesign() saves canvas state before tab switch
#
# Run on server as root:
#   bash /tmp/deploy-session10.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session10.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "❌  $PATCH not found — scp it first:"
  echo "    scp deploy/patch_session10.tar.gz root@217.216.59.87:/tmp/"
  exit 1
fi

log "Extracting patch…"
cd "$DIR"
tar xzf "$PATCH"
echo "✅  Files extracted"

log "Building @gifteeng/api (new addresses endpoint)…"
pnpm --filter=@gifteeng/api build 2>&1 | tail -20

log "Restarting API service…"
systemctl restart gifteeng-api
sleep 3

log "Building @gifteeng/web (~2–3 min)…"
pnpm --filter=@gifteeng/web build 2>&1 | tail -30

log "Restarting web service…"
systemctl restart gifteeng-web
sleep 4

log "Health check…"
for i in 1 2 3 4 5; do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/ 2>&1; then
    echo "  ✅ web / ok"
    break
  fi
  echo "  ... web not ready yet (attempt $i/5)"
  sleep 4
done

for i in 1 2 3; do
  if curl -fsS -o /dev/null http://127.0.0.1:4000/api/health 2>&1; then
    echo "  ✅ api /health ok"
    break
  fi
  echo "  ... api not ready yet (attempt $i/3)"
  sleep 3
done

echo ""
echo "=========================================="
echo "  SESSION 10 DEPLOY COMPLETE"
echo "=========================================="
echo "  Web: https://new.gifteeng.com"
echo "  API: https://api.gifteeng.com"
echo "  Logs: journalctl -u gifteeng-web -f"
echo "        journalctl -u gifteeng-api -f"
echo ""
echo "  What changed (customer-facing):"
echo "    - Addresses: GET/POST/DELETE /api/addresses now works (was 404)"
echo "    - Account page: new design, addresses tab works, orders list fixed"
echo "    - Checkout: no more bogus redirect for logged-in users (stale cart bug)"
echo "    - PDP: broken images show gift placeholder instead of broken icon"
echo "    - Customizer: switching design tabs no longer loses unsaved text edits"
echo ""
