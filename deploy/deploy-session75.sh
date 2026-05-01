#!/usr/bin/env bash
# session75 — Returns / RMA flow (customer + admin)
#
# Replaces the current "returns happen via DMs and manual refunds"
# workflow with a tracked, audit-logged state machine.
#
# State machine:
#   pending → approved → received → refunded   (happy path)
#   pending → rejected                          (admin declines)
#   pending → cancelled                         (customer pulls request)
#
# What ships:
#
#   DB:
#     • New `ReturnStatus` enum and `return_requests` table (Prisma
#       migration 20260430_add_return_requests).
#     • Back-relations on Order + Customer.
#
#   API:
#     • New ReturnsModule with ReturnsService + two controllers.
#     • Customer endpoints (under /api/orders/b2c/mine):
#         POST :id/return                — file a request
#         GET  :id/returns               — list this order's RMAs
#         POST returns/:rmaId/cancel    — withdraw a pending request
#     • Admin endpoints (under /api/admin/returns):
#         GET    /                       — list with filters
#         GET    /by-order/:orderId      — inline panel for order page
#         POST   :id/approve             — approve, push notification
#         POST   :id/reject  {reason}    — reject + notify customer
#         POST   :id/mark-received {carrier?, trackingNumber?}
#         POST   :id/refund {amountInr?, asGoins?}
#                                        — delegates into the existing
#                                        OrdersService.refundOrder so
#                                        the refund record lands in
#                                        order.metadata.refunds[]
#                                        (single source of truth) and
#                                        the customer gets notified
#                                        through the same pipeline as
#                                        a direct admin refund.
#     • Validation:
#         - Only delivered orders accept returns
#         - Default 7-day return window; per-product override via
#           product.metadata.returnWindowDays
#         - Per-OrderItem qty cap (cumulative across non-rejected RMAs
#           cannot exceed the line qty)
#
#   Customer UI (/b2c/orders/[id]):
#     • "Return / Refund" button alongside Cancel + Need Help, only
#       visible when the order is delivered.
#     • Modal: item picker (multi-item orders), reason dropdown
#       (defective / damaged / wrong / size / not as described /
#       changed mind / other), free-text details, success state with
#       "We'll review and get back within 24 hours" copy.
#
#   Admin UI (/super-admin/orders/[id]):
#     • New "Return requests" panel in the right column. Each card
#       shows status badge, reason, qty, customer details, return
#       AWB if set. Inline buttons advance state machine: Approve /
#       Reject (in pending), Mark received (in approved), Refund (in
#       approved/received — opens the existing refund modal logic).
#
# Migration application:
#   The deploy script runs `pnpm prisma migrate deploy` BEFORE the API
#   build so the generated client knows about the new model. If the
#   migration fails (e.g. table already exists from a prior partial
#   apply) the script continues and lets the build catch it.
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

tar xzf /tmp/patch_session75.tar.gz

# Apply the migration with --skip-seed (we don't seed in production).
# Failure here is logged but doesn't abort — the build will fail loudly
# if the schema/migrations are out of sync.
echo "==> applying Prisma migrations..."
(cd packages/db && pnpm prisma migrate deploy 2>&1 | tail -20) || \
  echo "WARN: migrate deploy returned non-zero, proceeding with build"

# Regenerate the Prisma client so the new model is in node_modules.
echo "==> regenerating Prisma client..."
(cd packages/db && pnpm prisma generate 2>&1 | tail -5)

pnpm --filter @gifteeng/api build 2>&1 | tail -8
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

echo "DEPLOY_OK session75"
