#!/usr/bin/env bash
# session57 — Admin order detail: Shopify-grade parity (#48).
#
# Backend:
#   • orders.service.getById now eager-loads customer (id, fullName,
#     email, phone, createdAt, metadata) and counts the customer's
#     lifetime orders. Surfaces in the admin "Customer" side-panel.
#   • New PATCH /orders/:id/admin-meta — admin-only patch for tags +
#     a free-text adminNote, both stored under metadata JSONB.
#   • New POST  /orders/:id/comments — appends an internal staff
#     comment to metadata.internalComments[]. Capped at last 200.
#
# Web admin:
#   • /super-admin/orders/[id] page rebuilt:
#       - Status + payment badges in the header
#       - Itemised payment card (Subtotal / Shipping / Discount / Tax /
#         Total / Paid)
#       - Synthesised event timeline (placed → paid → confirmed →
#         shipped → delivered + internal comments)
#       - Internal staff comment box with timeline append
#       - Customer side-panel with order count + click-to-copy email/phone
#       - Free-text Notes panel (auto-saves on blur)
#       - Tags chip editor (Enter/comma to add)
#       - Shipping + Billing addresses with "View map" link
#       - Print + Invoice PDF + Export JSON action buttons
#
# No DB migration — uses existing Order.metadata JSONB.
set -euo pipefail

cd /srv/gifteeng
set -a
. /srv/gifteeng/.env
set +a

tar xzf /tmp/patch_session57.tar.gz

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
echo "DEPLOY_OK session57"
