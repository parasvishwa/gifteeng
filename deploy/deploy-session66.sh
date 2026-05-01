#!/usr/bin/env bash
# session66 — Variant thumbnail fix (round 2) + cross-device cart sync
#
# Web (apps/web):
#   • ProductDetailClient.tsx — main "Add to Cart" CTA was always sending
#     `image: product.imageUrl` (the parent's first image) regardless of
#     which variant the customer had selected. Now we look up the variant's
#     own image (preferring `images[0]` over `image`) from the matched
#     option in `variantGroups[group]` and use it as the cart line image.
#     Also passes `slug` so the cart's "Edit design" link works.
#   • lib/stores/cart.ts — bidirectional cross-device sync. Was: "if local
#     has items, LOCAL is source of truth, only patch in server IDs". That
#     made every SSE-triggered reconcile a no-op for users that already
#     had items, so a phone-side add never reflected on the web tab and
#     vice-versa (web/mobile carts diverged: 3 vs 6 items in user report).
#     Now: for AUTHED users the server is canonical — replace local items
#     with the server set, enriching each row with cached title/price/
#     image/slug from local where the row already existed, and deriving
#     fresh display fields from the server-included `product.variantOptions`
#     (so items that just landed via SSE from another device show the
#     correct variant image + priceDelta, not blank). For GUESTS only,
#     localStorage stays canonical (no cross-device sync without auth).
#
# Mobile (v1.0.0+4012) — built separately, this script only deploys the
# backend pieces. Mobile fixes:
#   • cart_screen.dart — same variant-aware lookup as web, but also
#     sources the row PRICE from the matched variant's `priceDelta`
#     (previously always read `product.basePrice`, so "Kitchen 3" at
#     ₹279 was rendering as ₹229 in the cart). Falls back through
#     item.price → variant.priceDelta → product.basePrice → 0.
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a
tar xzf /tmp/patch_session66.tar.gz
pnpm --filter @gifteeng/web build
systemctl restart gifteeng-web
sleep 3
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/
echo "DEPLOY_OK session66"
