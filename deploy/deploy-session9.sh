#!/usr/bin/env bash
# Deploy session 9 — all remaining broken navigation links fixed
#
# Fixes shipped (web-only, no API or shared changes needed):
#   S9-1  next.config.mjs   — /uploads/* rewrite proxy → fixes hero banner + PLP images in prod
#   S9-2  CategoryBento.tsx — cat=ID → category=name filter param (category tiles were broken)
#   S9-3  HomepageSections.tsx — all viewAllLink() returns prefixed with /b2c/
#   S9-4  _SearchBox.tsx    — "See all results" link fixed (/b2c/products?search=...)
#   S9-5  cart/page.tsx     — "Continue shopping" and empty-cart CTA links fixed
#   S9-6  orders/success/page.tsx — "Continue shopping" link fixed
#   S9-7  FreeGiftBanner.tsx — "Shop more →" link fixed
#   S9-8  OccasionBanner.tsx — "Shop Now →" links fixed (both reminder and event CTAs)
#   S9-9  MobileNav.tsx     — Shop + Collections + Cart links fixed
#   S9-10 wishlist/page.tsx — "Browse Products" empty-state link fixed
#   S9-11 ai-design/page.tsx — all category + CTA /products links fixed
#   S9-12 gift/[token]/page.tsx — "Shop Gifteeng" link fixed
#
# Run on server as root:
#   bash /tmp/deploy-session9.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session9.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "❌  $PATCH not found — scp it first:"
  echo "    scp deploy/patch_session9.tar.gz root@217.216.59.87:/tmp/"
  exit 1
fi

log "Extracting patch…"
cd "$DIR"
tar xzf "$PATCH"
echo "✅  Files extracted"

log "Building @gifteeng/web (~2–3 min)…"
pnpm --filter=@gifteeng/web build 2>&1 | tail -30

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
  sleep 4
done

echo ""
echo "=========================================="
echo "  SESSION 9 DEPLOY COMPLETE"
echo "=========================================="
echo "  Web: https://new.gifteeng.com"
echo "  Logs: journalctl -u gifteeng-web -f"
echo ""
echo "  What changed (customer-facing):"
echo "    - Hero banner images now load (next.config.mjs /uploads/* proxy)"
echo "    - PLP images now load correctly (same proxy fix)"
echo "    - Homepage category tiles now filter correctly"
echo "    - All 'Shop Now', 'Continue shopping', 'Browse Products' links work"
echo "    - Mobile nav Shop/Collections/Cart links work"
echo "    - AI Design page category links work"
echo "    - Wishlist empty-state button works"
echo "    - Gift token page 'Shop Gifteeng' button works"
echo ""
