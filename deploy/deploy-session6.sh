#!/usr/bin/env bash
# Deploy session 6 fixes — all web-only changes
#
# Fixes shipped:
#   C1  Account: removed duplicate "Edit Profile" quick action → "Settings"
#   C2  Account: working Add New Address form with API save/delete
#   C3  Account: /products → /b2c/products link fix in orders empty state
#   D1  Checkout: re-sync server cart on mount (removes ghost/stale items)
#   D2  Checkout: auto-verify phone & pre-fill profile/address for logged-in users
#   E1  PDP: fix broken image URLs (resolve relative paths)
#   E2  PDP: adaptive title font size (won't overflow on long product names)
#   E3  PDP/PincodeChecker: auto-fill pincode from saved address
#   F1  Customizer: "Add another design" now preserves canvas state when switching
#   F2  Customizer: edits no longer lost when switching between design slots
#   F4  Customizer: removed "AI Suggest" button and drawer
#   G2  PDP: removed duplicate hardcoded testimonials (ReviewsSection is the single source)
#   +   added id="reviews" to ReviewsSection for anchor link
#
# Prereq: scp patch_session6.tar.gz to /tmp/ on the server
#
# Run on server as root:
#   bash /tmp/deploy-session6.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session6.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "❌  $PATCH not found — scp it first:"
  echo "    scp deploy/patch_session6.tar.gz root@217.216.59.87:/tmp/"
  exit 1
fi

log "Extracting patch…"
cd "$DIR"
tar xzf "$PATCH"
echo "✅  Files extracted"

log "Building @gifteeng/web (~2 min)…"
sudo -u gifteeng pnpm --filter=@gifteeng/web build 2>&1 | tail -30

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
  sleep 3
done

echo ""
echo "=========================================="
echo "  SESSION 6 DEPLOY COMPLETE"
echo "=========================================="
echo "  Web: https://new.gifteeng.com"
echo "  Logs: journalctl -u gifteeng-web -f"
