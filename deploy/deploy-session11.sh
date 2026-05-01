#!/usr/bin/env bash
# Deploy session 11 — image hosting fix, hero filter, Razorpay, wishlist button
#
# Fixes shipped:
#   S11-1  apps/web/lib/media.ts                    — NEW: normaliseMediaUrl() strips broken http:// host prefixes
#   S11-2  apps/web/app/b2c/_components/sections/HeroSlider.tsx  — normalise slide imageUrl
#   S11-3  apps/web/app/b2c/page.tsx                — remove AI-filter that blocked 3rd hero slide
#   S11-4  apps/web/app/b2c/search/page.tsx         — resolveImage uses normaliseMediaUrl
#   S11-5  apps/web/app/b2c/products/page.tsx       — imageUrl()/normaliseListProduct handle {alt,url} objects
#   S11-6  apps/web/app/b2c/account/page.tsx        — order thumbnail src normalised
#   S11-7  apps/api/src/main.ts                     — NestJS now serves /uploads/** as static files
#   S11-DB                                          — Razorpay settings enabled in DB (already done live)
#   S11-IMG                                         — 54 Amazon product images mirrored to /var/gifteeng/uploads/product/
#
# Run on server as root:
#   bash /tmp/deploy-session11.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session11_full.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "❌  $PATCH not found — scp it first:"
  echo "    scp deploy/patch_session11_full.tar.gz root@217.216.59.87:/tmp/"
  exit 1
fi

log "Extracting patch…"
cd "$DIR"
tar xzf "$PATCH"
echo "✅  Files extracted"

log "Building @gifteeng/api (static uploads serving)…"
pnpm --filter=@gifteeng/api build 2>&1 | tail -15

log "Restarting API service…"
systemctl restart gifteeng-api
sleep 3

log "Verifying /uploads/ static serving…"
TEST_FILE=$(ls /var/gifteeng/uploads/product/mirror-*.jpg 2>/dev/null | head -1)
if [[ -n "$TEST_FILE" ]]; then
  FNAME=$(basename "$TEST_FILE")
  STATUS=$(curl -o /dev/null -s -w "%{http_code}" "http://127.0.0.1:4000/uploads/product/$FNAME")
  if [[ "$STATUS" == "200" ]]; then
    echo "  ✅ API serves /uploads/ (HTTP $STATUS)"
  else
    echo "  ⚠️  API /uploads/ returned HTTP $STATUS — check logs"
  fi
else
  echo "  ⚠️  No mirrored files found to test"
fi

log "Building @gifteeng/web (~2–3 min)…"
pnpm --filter=@gifteeng/web build 2>&1 | tail -25

log "Fixing .next/ ownership (must be gifteeng, not root)…"
chown -R gifteeng:gifteeng "$DIR/apps/web/.next"
echo "  ✅ .next/ owned by gifteeng"

log "Restarting web service…"
systemctl restart gifteeng-web
sleep 4

log "Health checks…"
for i in 1 2 3 4 5; do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
    echo "  ✅ web ok"
    break
  fi
  echo "  ... web not ready (attempt $i/5)"; sleep 4
done

for i in 1 2 3; do
  if curl -fsS -o /dev/null http://127.0.0.1:4000/api/health 2>/dev/null; then
    echo "  ✅ api /health ok"
    break
  fi
  echo "  ... api not ready (attempt $i/3)"; sleep 3
done

echo ""
echo "=========================================="
echo "  SESSION 11 DEPLOY COMPLETE"
echo "=========================================="
echo "  Web: https://new.gifteeng.com"
echo ""
echo "  What changed:"
echo "    - All product images now served from our own server"
echo "    - 54 Amazon product images downloaded to /var/gifteeng/uploads/product/"
echo "    - Hero slider shows all 3 slides (AI-filter removed)"
echo "    - Razorpay option visible on checkout (DB enabled)"
echo "    - Shop PLP / search / orders / hero — images no longer broken"
echo "    - Flutter: wishlist heart icon now white (visible on dark cards)"
echo ""
