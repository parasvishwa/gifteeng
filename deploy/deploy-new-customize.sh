#!/usr/bin/env bash
# Deploy the new B2C customize page + canvas-editor fix + cart slug + api /api-prefix fix.
#
# Prereq: scp ALL of these to /tmp/ on the server BEFORE running:
#   deploy/customize_page.b64
#   deploy/canvas_editor.b64
#   deploy/cart_page.b64
#   deploy/cart_store.b64
#   deploy/api_lib.b64
#
# Run on server:  bash /tmp/deploy-new-customize.sh
set -e
cd /srv/gifteeng

decode() {
  local b64="$1"
  local dst="$2"
  if [[ ! -f "$b64" ]]; then
    echo "❌ missing: $b64 — scp it to /tmp/ first"
    exit 1
  fi
  tr -d '\r\n' < "$b64" | base64 -d > "$dst"
  echo "✅ $dst ($(wc -l < "$dst") lines)"
}

echo "→ Decoding files…"
decode /tmp/customize_page.b64 "apps/web/app/b2c/customize/[slug]/page.tsx"
decode /tmp/canvas_editor.b64  packages/ui/src/components/canvas-editor.tsx
decode /tmp/cart_page.b64      apps/web/app/b2c/cart/page.tsx
decode /tmp/cart_store.b64     apps/web/lib/stores/cart.ts
decode /tmp/api_lib.b64        apps/web/lib/api.ts
[[ -f /tmp/checkout_page.b64 ]] && decode /tmp/checkout_page.b64 apps/web/app/b2c/checkout/page.tsx
[[ -f /tmp/products_service.b64 ]] && decode /tmp/products_service.b64 apps/api/src/modules/products/products.service.ts

echo ""
echo "→ Building API…"
pnpm --filter=@gifteeng/api build 2>&1 | tail -5

echo ""
echo "→ Building web app (~2 min)…"
pnpm --filter=@gifteeng/web build 2>&1 | tail -20

echo ""
echo "→ Restarting services…"
systemctl restart gifteeng-api gifteeng-web
sleep 3
systemctl status gifteeng-api gifteeng-web --no-pager | grep -E "Active:|gifteeng"

echo ""
echo "🎉 Deployed. Test at: http://217.216.59.87/customize/very-test"
echo "   • Full editor with data-URL uploads (no CORS issues)"
echo "   • Cart Edit button uses slug (not UUID)"
echo "   • cartFetch prepends /api prefix so addItem works"
echo "   • localhost:4000 stripped from product image URLs"
