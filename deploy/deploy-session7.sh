#!/usr/bin/env bash
# Deploy session 7 — Order improvements + new features + Goins page redesign
#
# Fixes shipped:
#   S7-1  API: POST /orders/b2c/mine/:id/cancel — customer-initiated cancel with reason
#   S7-2  API: PATCH /orders/b2c/mine/:id/request-delivery-date — postpone only
#   S7-3  Web: track/page.tsx — fix redirect /track/ → /b2c/track/
#   S7-4  Web: orders/[id]/page.tsx — delivery date postpone UI + "Write Review" per item
#             (review modal with 5-star rating; delivery date modal enforces postpone-only)
#   S7-5  Web: account/page.tsx — Goins tab redesign: light theme + dark gamification section
#             (white balance card with gold accent, dark spin/pick card with glow,
#              colored icon earn list, pill tabs "Spin Now"/"Try Luck")
#
# Prereq: scp deploy/patch_session7.tar.gz root@217.216.59.87:/tmp/
#
# Run on server as root:
#   bash /tmp/deploy-session7.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session7.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "❌  $PATCH not found — scp it first:"
  echo "    scp deploy/patch_session7.tar.gz root@217.216.59.87:/tmp/"
  exit 1
fi

log "Extracting patch…"
cd "$DIR"
tar xzf "$PATCH"
echo "✅  Files extracted"

log "Building @gifteeng/api…"
sudo -u gifteeng pnpm --filter=@gifteeng/api build 2>&1 | tail -20

log "Restarting API service…"
systemctl restart gifteeng-api
sleep 3
systemctl is-active gifteeng-api && echo "  ✅ api active" || (echo "  ❌ api failed"; journalctl -u gifteeng-api -n 30; exit 1)

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
echo "  SESSION 7 DEPLOY COMPLETE"
echo "=========================================="
echo "  Web: https://new.gifteeng.com"
echo "  API: https://new.gifteeng.com/api"
echo "  Logs: journalctl -u gifteeng-web -f"
echo "         journalctl -u gifteeng-api -f"
echo ""
echo "  New endpoints:"
echo "    POST   /api/orders/b2c/mine/:id/cancel"
echo "    PATCH  /api/orders/b2c/mine/:id/request-delivery-date"
echo ""
echo "  UI changes on order detail page:"
echo "    - 'Request Later Delivery' button (postpone only)"
echo "    - 'Write Review' per item after delivery"
echo "    - Cancel modal now actually works"
echo "  Track search page: redirect fixed (/b2c/track/:id)"
echo "  Goins tab (account page):"
echo "    - Balance card: white + gold accent, 'Use Coins' CTA"
echo "    - Pill tabs: 'Spin Now' / 'Try Luck'"
echo "    - Spin/Pick: dark navy card with glow (only dark element)"
echo "    - Earn list: colored icon chips, amber reward pills"
