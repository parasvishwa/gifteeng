#!/usr/bin/env bash
# Deploy session 16 — Sidebar visibility + Scratch card UX
#
# Fixes shipped:
#   S16-1  apps/web/app/b2c/products/page.tsx
#          - Customisable toggle box: bg-muted → bg-white (visible on pink card)
#          - Switch track: override unchecked color to gray-300 (was same pink as bg = invisible)
#          - Price range inputs: bg-card → bg-white + border-pink-200 (visible contrast)
#
#   S16-2  apps/web/app/b2c/products/_SearchBox.tsx
#          - Search input: bg-card → bg-white + border-pink-200 (visible in sidebar)
#
#   S16-3  apps/web/app/b2c/_components/games/ScratchCard.tsx
#          - Brush radius: 48 → 110 (one swipe covers half the card)
#          - Halo radius: 56 → 130
#          - Reveal threshold: 20% → 5% (any movement triggers reveal)
#          - tryReveal() called on every pointer move (not just pointer up)
#          - "Tap to reveal instantly" button shown immediately (no scratch needed)
#
# Run on server as root:
#   bash /tmp/deploy-session16.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session16.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "❌  $PATCH not found — scp it first:"
  echo "    scp deploy/patch_session16.tar.gz root@217.216.59.87:/tmp/"
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
echo "  SESSION 16 DEPLOY COMPLETE"
echo "=========================================="
echo "  Web: https://new.gifteeng.com"
echo ""
echo "  What changed:"
echo "    - Products sidebar: toggle + search + inputs now visible on pink bg"
echo "    - Scratch card: one swipe = reveal, + instant 'Tap to reveal' button"
echo ""
