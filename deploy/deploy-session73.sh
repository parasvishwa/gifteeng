#!/usr/bin/env bash
# session73 — Phase A of Shopify-grade order page
#
# What ships:
#
# A1. Customer order history inline
#     • Service.getById now hydrates customerLifetimeValue (sum of past
#       non-cancelled orders.grandTotal) + customerRecentOrders (last 5
#       previous orders for one-click drill-down).
#     • Customer panel renders an LTV / Avg order pair, a tier hint
#       (First-time / Returning / VIP at ≥5 orders), and a Recent-orders
#       list with each row linkable to /super-admin/orders/<id>.
#
# A2. View map link on shipping address — already in place; verified.
#
# A3. Print / Resend actions
#     • New /api/orders/:id/packing-slip.pdf (no prices, no GST, just
#       big shipping address + items + qty + SKU + customer-service note
#       from metadata.adminNote). Mirrors the invoice-PDF endpoint
#       structure.
#     • New /api/orders/:id/resend-confirmation — replays the order
#       confirmation SMS via MSG91 + push via FCM. Returns
#       { ok, sms, push, reason } so the UI can show what fired.
#     • Header strip: added "Packing slip" and "Resend SMS" buttons
#       alongside the existing Print + Invoice PDF.
#
# A4. Admin cancel with restock toggle
#     • Service.cancelOrderByAdmin — different from the customer-cancel
#       path: allowed at any status except already-cancelled / delivered;
#       optional inventory restock that increments product (or matched
#       variant) inventory by line qty inside the same transaction;
#       audit log records actor + reason + per-line restock outcome.
#     • Header "Cancel" button (red, only visible on non-terminal
#       orders) prompts for reason + restock-yes/no.
#     • Restocking publishes a "products" realtime scope so the
#       storefront's "in stock" hint refreshes immediately.
#
# A6. Duplicate-order detection
#     • Service.getById walks orders for the same customer placed
#       within ±10 minutes whose item composition (productId+qty
#       multiset) matches exactly. Returns duplicateOrderIds[].
#     • Order detail page shows an amber warning banner under the
#       header strip with quick links to each duplicate, plus the
#       likely-cause hint ("rage-click on Pay before success screen").
#
# A5 (email log with previews) deferred — needs a new Prisma model
# (OrderEmail / SentEmail) + migration + retro-fit of every send-email
# call site. Logged as a separate Phase B task.
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a
tar xzf /tmp/patch_session73.tar.gz
pnpm --filter @gifteeng/api build 2>&1 | tail -5
pnpm --filter @gifteeng/web build 2>&1 | tail -5
systemctl restart gifteeng-api
sleep 4
for i in 1 2 3 4 5 6; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "  api /health ok"
    break
  fi
  echo "  ... api not ready (attempt $i/6)"
  sleep 2
done
systemctl restart gifteeng-web
sleep 3
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/
echo "DEPLOY_OK session73"
