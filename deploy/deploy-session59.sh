#!/usr/bin/env bash
# session59 — Realtime cross-device sync (#50) + web home centering
#
# Backend:
#   • New @Global RealtimeModule with SSE controller at GET /api/me/events.
#     Heartbeat every 25 s (`: ping`), nginx-friendly (X-Accel-Buffering: no).
#   • RealtimeService.publish(customerId, scope) fanout. Hooked into:
#       - CartService.addItem / removeItem / clearItems       → "cart"
#       - WishlistService.addItem / removeItem               → "wishlist"
#       - CoinsService all 6 mutating paths                  → "goins"
#       - CheckoutService.placeOrderB2c + Razorpay capture   → "cart","orders","goins"
#       - OrdersService.updateStatus / cancelOrder /
#         requestDeliveryDate / patchAdminMeta /
#         addInternalComment                                 → "orders" (+ "goins" on delivered)
#   • JwtB2cStrategy now also accepts ?token= query param so EventSource
#     (no header support) can authenticate.
#
# Web:
#   • New _components/chrome/RealtimeSync.tsx — opens EventSource on layout
#     mount, broadcasts `gifteeng:invalidate` window event with {scope}.
#     Auto-reconnects with backoff. Visibility / focus listener triggers
#     a forced refetch on tab return.
#   • Navbar useAuth() listens for goins invalidation → refetches.
#   • Cart store reconciles via existing onB2cLogin path.
#   • CategoryTabBar centered (justify-center wrapper).
#
# Mobile is built + installed locally as v1.0.0+4008.
set -euo pipefail

cd /srv/gifteeng
set -a
. /srv/gifteeng/.env
set +a

tar xzf /tmp/patch_session59.tar.gz

pnpm --filter @gifteeng/api build
pnpm --filter @gifteeng/web build

systemctl restart gifteeng-api
sleep 4
systemctl restart gifteeng-web
sleep 3

for i in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "  api /health ok"
    break
  fi
  echo "  ... api not ready yet (attempt $i/5)"
  sleep 2
done

echo
echo "DEPLOY_OK session59"
