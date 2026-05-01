#!/usr/bin/env bash
# Deploy session 23 — Wishlist API backend
#
# Fixes shipped:
#   S23-1  apps/api/src/modules/wishlist/wishlist.module.ts   (NEW)
#   S23-2  apps/api/src/modules/wishlist/wishlist.controller.ts (NEW)
#          - GET  /wishlist            → full items with product details
#          - GET  /wishlist/ids        → string[] of product IDs (fast UI check)
#          - GET  /wishlist/check/:id  → { wishlisted: bool }
#          - POST /wishlist/items      → { productId: uuid }
#          - DELETE /wishlist/items/:productId
#          All guarded by JwtB2cGuard
#   S23-3  apps/api/src/modules/wishlist/wishlist.service.ts  (NEW)
#          - getOrCreate: lazy-creates Default wishlist per customer
#          - getItems / getProductIds / addItem / removeItem / isWishlisted
#   S23-4  apps/api/src/app.module.ts  (updated — WishlistModule registered)
#
# No DB migration needed — Wishlist + WishlistItem models already in schema.
#
# Run on server as root:
#   bash /tmp/deploy-session23.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session23.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "❌  $PATCH not found — scp it first:"
  echo "    scp deploy/patch_session23.tar.gz root@217.216.59.87:/tmp/"
  exit 1
fi

log "Extracting patch…"
cd "$DIR"
tar xzf "$PATCH"
echo "✅  Files extracted"

log "Building @gifteeng/api (~1 min)…"
pnpm --filter=@gifteeng/api build 2>&1 | tail -20

log "Restarting API service…"
systemctl restart gifteeng-api
sleep 5

log "Health checks…"
for i in 1 2 3 4 5; do
  if curl -fsS -o /dev/null http://127.0.0.1:4000/health; then
    echo "  ✅ API /health ok"
    break
  fi
  echo "  ... API not ready (attempt $i/5)"; sleep 4
done

echo ""
echo "=========================================="
echo "  SESSION 23 DEPLOY COMPLETE"
echo "=========================================="
echo "  New API routes (all require Bearer JWT):"
echo "    GET    /api/wishlist"
echo "    GET    /api/wishlist/ids"
echo "    GET    /api/wishlist/check/:productId"
echo "    POST   /api/wishlist/items"
echo "    DELETE /api/wishlist/items/:productId"
echo ""
