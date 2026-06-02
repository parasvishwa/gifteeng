#!/usr/bin/env bash
# Deploy session 82 — Card unification + social proof + bug fixes
#
# Changes:
#   - ProductCard: fix /p/slug nav bug → /products/slug (fixes 404 in Picked for you)
#   - ProductCard: add rating, soldCount, Free delivery to card body
#   - HomepageSections + HomepageBlocks: replaced custom cards → all use ProductCard
#   - PickedForYou: pass soldCount from recommendations API
#   - products.service: add _count.orderItems + per-product avg rating to list API
#   - recommendations.service: add soldCount from 7-day order groupBy
#   - ProductDetailClient: "Trending gift" only shows when metadata.trending/bestseller=true
#   - HeroSlider + @gifteeng/shared: add bgColor1/bgColor2/accentColor to HeroSlide type
#
# Run on server as root:
#   bash /tmp/deploy-session82.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session82.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "❌  $PATCH not found — scp it first:"
  echo "    scp deploy/patch_session82.tar.gz root@217.216.59.87:/tmp/"
  exit 1
fi

log "Extracting patch…"
cd "$DIR"
tar xzf "$PATCH"
echo "✅  Files extracted"

log "Building @gifteeng/shared…"
pnpm --filter=@gifteeng/shared build 2>&1 | tail -5

log "Building @gifteeng/api…"
pnpm --filter=@gifteeng/api build 2>&1 | tail -10

log "Building @gifteeng/web (~2–3 min)…"
pnpm --filter=@gifteeng/web build 2>&1 | tail -25

log "Fixing .next/ ownership…"
chown -R gifteeng:gifteeng "$DIR/apps/web/.next"

log "Restarting services…"
systemctl restart gifteeng-api
sleep 3
systemctl restart gifteeng-web
sleep 6

log "Health checks…"
for i in 1 2 3 4 5; do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
    echo "  ✅ web ok"
    break
  fi
  echo "  ... web not ready (attempt $i/5)"; sleep 4
done

for i in 1 2 3 4 5; do
  if curl -fsS -o /dev/null http://127.0.0.1:4000/api/health 2>/dev/null || curl -fsS -o /dev/null http://127.0.0.1:4000/ 2>/dev/null; then
    echo "  ✅ api ok"
    break
  fi
  echo "  ... api not ready (attempt $i/5)"; sleep 4
done

echo ""
echo "=========================================="
echo "  SESSION 82 DEPLOY COMPLETE"
echo "=========================================="
echo "  What changed:"
echo "    - All homepage sections now use unified ProductCard design"
echo "    - Cards show: rating, sold count, Free delivery, Quick View"
echo "    - /products/[slug] nav fixed (was broken /p/slug)"
echo "    - Trending gift badge: only on metadata.trending/bestseller products"
echo "    - API: products list includes orderItems count + avg rating"
echo ""
