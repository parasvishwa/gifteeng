#!/usr/bin/env bash
# Deploy session 90 — Super-admin dashboard redesign
#
#   FIX  super-admin/page.tsx — full redesign:
#         • Removed gradient hero card (was anti-pattern: "hero-metric template")
#         • Revenue now: large ₹ number in clean bg-card, no gradient background
#         • Order pipeline: 4-column grid inside the same card (Confirmed/Delivered/Pending/Processing)
#         • KPI row: Products, Customers, Page Views (with sparkline), Reviews
#           — all fully clickable with active:scale-[0.97] and specific transitions
#         • Quick counts: compact pills, not tall min-h-[100px] cards
#         • Bottom grid: cleaner typography, consistent card headers
#         • All transition-all → specific property transitions cubic-bezier(0.23,1,0.32,1)
#         • Simplified sparkline (line only, no fill gradient)
#
# Run on server as root:
#   bash /tmp/deploy-session90.sh

set -euo pipefail
log()  { echo ""; echo "==> $*"; }
ok()   { echo "  ✅ $*"; }
fail() { echo "  ❌ $*"; exit 1; }

PATCH=/tmp/patch_session90.tar.gz
DIR=/srv/gifteeng

[[ -f "$PATCH" ]] || fail "$PATCH not found — scp it first:
    scp deploy/patch_session90.tar.gz root@217.216.59.87:/tmp/"

log "Extracting patch…"
cd "$DIR"
tar xzf "$PATCH"
ok "Files extracted"

log "Verifying extracted file…"
[[ -f "$DIR/apps/web/app/b2b/super-admin/page.tsx" ]] \
  && ok "apps/web/app/b2b/super-admin/page.tsx" \
  || echo "  ⚠️  page.tsx not found after extraction"

log "Building @gifteeng/web…"
sudo -u gifteeng -H pnpm --filter @gifteeng/web build

log "Restarting web service…"
systemctl restart gifteeng-web
sleep 4

log "Health check…"
for i in 1 2 3 4 5; do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/b2c 2>&1; then
    ok "web /b2c ok"
    break
  fi
  echo "  ... web not ready yet (attempt $i/5)"
  sleep 3
done

echo ""
echo "════════════════════════════════════════════════════════"
echo "  SESSION 90 — SUPER-ADMIN DASHBOARD REDESIGN ✅"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  Changes live at: https://admin.gifteeng.com/super-admin"
echo ""
echo "  What's new:"
echo "    📊  Revenue card: large ₹ number, no gradient background"
echo "    🔢  Order pipeline: unified card with 4 status columns"
echo "    📈  KPI cards: Products, Customers, Page Views (sparkline), Reviews"
echo "    🔵  Quick counts: compact pills (was tall min-h-[100px] cards)"
echo "    ⚡  All clickable cards: active:scale-[0.97]"
echo "    🎯  Specific property transitions, cubic-bezier(0.23,1,0.32,1)"
echo ""
echo "  Logs: journalctl -u gifteeng-web -f"
echo ""
