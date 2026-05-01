#!/usr/bin/env bash
# Deploy session 8 — Razorpay integration, COD fee, category nav, PLP images, hero slides
#
# Fixes shipped:
#   S8-1  API:  admin.module.ts — PublicSettingsController: GET /api/settings/public
#               Returns cod_enabled, cod_charge, razorpay_enabled, razorpay_key_id,
#               delivery_charge, free_delivery_above (no auth required)
#   S8-2  Web:  checkout/page.tsx — Razorpay online payment + COD handling fee
#               - Payment method selector: Online (Razorpay) | Cash on Delivery
#               - COD fee loaded from /api/settings/public (configurable in admin)
#               - Razorpay modal: create order → open checkout → capture → redirect
#   S8-3  Web:  HomepageBlocks.tsx — fix category/product links missing /b2c/ prefix
#               (/products → /b2c/products, /products/:slug → /b2c/products/:slug)
#   S8-4  Web:  products/page.tsx — fix PLP blank images (use API_IMAGE_BASE not window.origin)
#   S8-5  Web:  _components/sections/HeroSlider.tsx — treat undefined active as true
#               (admin-added slides without active:true field now show correctly)
#   S8-6  Web:  homepage-content/page.tsx — new slides include active:true + order
#   S8-7  Web:  MultiVariantGrid.tsx — hide multi-select banner for customizable products
#   Web:  ProductDetailClient.tsx — pass isCustomizable to MultiVariantGrid
#   S8-8  Pkg:  shared/schemas/homepage.ts — add active/order to HeroSlideSchema
#
# Prereq: scp deploy/patch_session8.tar.gz root@217.216.59.87:/tmp/
#
# Run on server as root:
#   bash /tmp/deploy-session8.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session8.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "❌  $PATCH not found — scp it first:"
  echo "    scp deploy/patch_session8.tar.gz root@217.216.59.87:/tmp/"
  exit 1
fi

log "Extracting patch…"
cd "$DIR"
tar xzf "$PATCH"
echo "✅  Files extracted"

log "Building @gifteeng/shared…"
sudo -u gifteeng pnpm --filter=@gifteeng/shared build 2>&1 | tail -5

log "Building @gifteeng/api…"
sudo -u gifteeng pnpm --filter=@gifteeng/api build 2>&1 | tail -20

log "Restarting API service…"
systemctl restart gifteeng-api
sleep 3
systemctl is-active gifteeng-api && echo "  ✅ api active" || (echo "  ❌ api failed"; journalctl -u gifteeng-api -n 30; exit 1)

log "Verifying new public settings endpoint…"
curl -fsS http://127.0.0.1:4000/api/settings/public | head -c 200 && echo "" || echo "  ⚠️  endpoint not responding yet"

log "Building @gifteeng/web (~2–3 min)…"
sudo -u gifteeng pnpm --filter=@gifteeng/web build 2>&1 | tail -30

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
  sleep 3
done

echo ""
echo "=========================================="
echo "  SESSION 8 DEPLOY COMPLETE"
echo "=========================================="
echo "  Web: https://new.gifteeng.com"
echo "  API: https://new.gifteeng.com/api"
echo "  Logs: journalctl -u gifteeng-web -f"
echo "         journalctl -u gifteeng-api -f"
echo ""
echo "  New endpoints:"
echo "    GET  /api/settings/public  (no auth, returns cod_charge, razorpay_enabled, etc.)"
echo ""
echo "  Customer-facing changes:"
echo "    - Checkout: Online payment via Razorpay + COD with configurable ₹50 handling fee"
echo "    - Shop by Category / homepage product strips: links now route correctly"
echo "    - PLP: product images now load correctly (API base URL fix)"
echo "    - Hero slider: admin-added slides now visible"
echo "    - PDP: multi-select banner hidden for customizable products"
echo ""
echo "  Admin config (Settings page):"
echo "    - razorpay_enabled: toggle to show/hide online payment option"
echo "    - razorpay_key_id: public Razorpay key (already saved there)"
echo "    - cod_charge: COD handling fee (default 50, shown to customer)"
