#!/usr/bin/env bash
# Deploy session 19 — Category grid redesign
#
# Fixes shipped:
#   S19-1  apps/web/app/b2c/_components/sections/CategoryBento.tsx
#          - Replaced asymmetric bento layout with uniform square grid
#          - 2 columns on mobile, 3 columns on md+
#          - Each card: square product thumbnail + name + count
#          - Hover: gentle image scale + border highlight
#          - Skeleton matches grid exactly
#          - Shows up to 9 categories (was 6)
#          - Only fetches 1 preview image per category (was 3)
#
# Run on server as root:
#   bash /tmp/deploy-session19.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session19.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "❌  $PATCH not found — scp it first:"
  echo "    scp deploy/patch_session19.tar.gz root@217.216.59.87:/tmp/"
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
echo "  SESSION 19 DEPLOY COMPLETE"
echo "=========================================="
echo "  Web: https://new.gifteeng.com"
echo ""
echo "  What changed:"
echo "    - Homepage: Shop by Category is now a clean uniform square grid"
echo "    - 2 cols mobile / 3 cols desktop, all cards identical size"
echo "    - Square product thumbnail + name + count per card"
echo ""
