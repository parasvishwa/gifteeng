#!/usr/bin/env bash
# Deploy session 20 — Mobile PDP polish, CategoryTabBar, gaps, Goins chip
#
# Fixes shipped:
#   S20-1  apps/web/app/b2c/products/_SearchBox.tsx
#          - Search hint stays on one line (whitespace-nowrap overflow-hidden)
#
#   S20-2  apps/web/app/b2c/_components/sections/ProductCard.tsx
#          - ADD button hidden on mobile (hidden md:flex) — no flash on tap
#
#   S20-3  apps/web/app/b2c/_components/Navbar.tsx
#          - Mobile Goins chip: removed "Goins" label, narrower — no logo overlap
#
#   S20-4  apps/web/app/b2c/page.tsx
#          - Hero top gap reduced (pt-14 → pt-4)
#          - CategoryTabBar moved inside hero, right below search bar
#
#   S20-5  apps/web/app/b2c/products/page.tsx
#          - Products page top gap removed (pt-[80px] → pt-4)
#          - CategoryTabBar added on mobile above product grid
#
#   S20-6  apps/web/app/b2c/products/[slug]/page.tsx
#          - PDP top gap removed (pt-20 → pt-6) + overflow-x-hidden
#          - Breadcrumb fixed: single line, shrink-0 + min-w-0
#          - Title line spacing: leading-[1.2] → leading-snug
#          - Bullets normalization: handles stringified JSON arrays
#
#   S20-7  apps/web/app/b2c/products/[slug]/ProductDetailClient.tsx
#          - BulletsSection: shows 3 bullets + "View X more" toggle
#          - All CTA buttons unified to rounded-xl
#
# Run on server as root:
#   bash /tmp/deploy-session20.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session20.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "❌  $PATCH not found — scp it first:"
  echo "    scp deploy/patch_session20.tar.gz root@217.216.59.87:/tmp/"
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
echo "  SESSION 20 DEPLOY COMPLETE"
echo "=========================================="
echo "  Web: https://new.gifteeng.com"
echo ""
echo "  What changed:"
echo "    - CategoryTabBar now right below search on home + products page"
echo "    - Home hero gap reduced, products page gap removed"
echo "    - PDP: breadcrumb on one line, no right overflow, title spacing fixed"
echo "    - PDP: bullets show 3 + View more toggle, raw JSON fixed"
echo "    - PDP: all CTA buttons same border radius"
echo "    - Mobile: Goins chip no longer overlaps logo"
echo "    - Mobile: product card tap no longer flashes ADD button"
echo "    - Search hint stays on one line in sidebar"
echo ""
