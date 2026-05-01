#!/usr/bin/env bash
# Deploy session 14 — Customiser inline toolbar
#
# Fixes shipped:
#   S14-1  packages/ui/src/components/simple-zone-customizer.tsx
#          - Replaced fullscreen bottom-sheet popup with inline toolbar
#          - Text updates live on product while typing (no separate preview box)
#          - No backdrop/overlay — product always visible
#          - Zone list shows "active" state for the field being edited
#
# Run on server as root:
#   bash /tmp/deploy-session14.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session14.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "❌  $PATCH not found — scp it first:"
  echo "    scp deploy/patch_session14.tar.gz root@217.216.59.87:/tmp/"
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
echo "  SESSION 14 DEPLOY COMPLETE"
echo "=========================================="
echo "  Web: https://new.gifteeng.com"
echo ""
echo "  What changed:"
echo "    - Customiser text editor: fullscreen popup → inline toolbar"
echo "      Product always visible while typing"
echo "      Text updates live on product in real time"
echo ""
