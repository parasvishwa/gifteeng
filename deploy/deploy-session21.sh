#!/usr/bin/env bash
# Deploy session 21 — CategoryTabBar icon removal + hero reorder
#
# Fixes shipped:
#   S21-1  apps/web/app/b2c/_components/sections/CategoryTabBar.tsx
#          - Icons removed — now text-only pill chips
#          - Shows "All Gifts" (red pill) + category name pills (no icon boxes)
#          - Compact horizontal scrollable strip
#
#   S21-2  apps/web/app/b2c/page.tsx
#          - CategoryTabBar moved to RIGHT BELOW search bar
#          - CTA buttons (Shop All Gifts + Gift Quiz) moved AFTER category pills
#          - HeroSearch bottom margin reduced mb-8 → mb-3
#
# Run on server as root:
#   bash /tmp/deploy-session21.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session21.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "❌  $PATCH not found — scp it first:"
  echo "    scp deploy/patch_session21.tar.gz root@217.216.59.87:/tmp/"
  exit 1
fi

log "Extracting patch…"
cd "$DIR"
tar xzf "$PATCH"
echo "✅  Files extracted"

log "Building @gifteeng/web (~2–3 min)…"
pnpm --filter=@gifteeng/web build 2>&1 | tail -25

log "Fixing .next/ ownership…"
chown -R gifteeng:gifteeng "$DIR/apps/web/.next"
echo "  ✅ .next/ owned by gifteeng"

log "Restarting web service…"
systemctl restart gifteeng-web
sleep 5

log "Health checks…"
for i in 1 2 3 4 5; do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
    echo "  ✅ web ok"
    break
  fi
  echo "  ... web not ready (attempt $i/5)"; sleep 4
done

echo ""
echo "=========================================="
echo "  SESSION 21 DEPLOY COMPLETE"
echo "=========================================="
echo "  Web: https://new.gifteeng.com"
echo ""
echo "  What changed:"
echo "    - CategoryTabBar: icons gone, text-only pill chips"
echo "    - Hero: category pills now right below search"
echo "    - Hero: Shop All Gifts + Gift Quiz buttons below categories"
echo ""
