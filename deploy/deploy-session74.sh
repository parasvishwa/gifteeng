#!/usr/bin/env bash
# session74 — Phase B of Shopify-grade order page
#
# B1. Conversion summary
#     • OrdersService.computeConversionSummary() walks page_views for the
#       customer over the 30 days before placedAt and returns:
#         firstSeenAt, sessionsBeforeOrder, pageViewsBeforeOrder,
#         timeFromFirstVisitMin, topPages[5],
#         firstReferrer, firstUtm{source,medium,campaign},
#         firstDevice{platform,deviceType,browser,os},
#         firstLocation{country,region,city}
#     • Right-column "Conversion summary" card renders sessions + page-
#       view counts, time-from-first-visit (minutes/hours/days
#       formatted), first-touch attribution (UTM > referrer fallback),
#       device + city, and the top-5 most-visited paths.
#
# B2. Order risk score
#     • OrdersService.computeRiskScore() — deterministic heuristics.
#       Starts at neutral 30, adds points for COD / high cart value /
#       first-time / mismatched billing-shipping country, subtracts for
#       prepaid / VIP LTV / trusted repeat. Clamped 0-100, bucketed
#       low<30 / medium / high≥60.
#     • Right-column "Order risk" card renders a coloured meter, the
#       score, AND the full factor list (each with icon + delta) so
#       the agent sees WHY — opaque scores are useless on a dashboard.
#
# B3. Refund flow (full + partial, Razorpay or Goins)
#     • OrdersService.refundOrder({ amountInr?, reason, asGoins }, caller)
#       - validates remaining refundable amount (no over-refund)
#       - prepaid + !asGoins → razorpay.payments.refund()
#       - asGoins → coins.adminGrant() (1 ₹ = 1 coin)
#       - COD orders force asGoins=true (no payment to reverse)
#       - persists to order.metadata.refunds[] (audit trail kept on the
#         row itself in addition to AuditLog) so the customer-side
#         "refund history" view doesn't need a separate table query
#       - paymentStatus → "refunded" or "partially_refunded"
#       - audit-logs the actor + amount + reason + razorpay refund id
#       - push notification to the customer via NotificationsService
#       - SSE invalidate for orders + goins scopes
#     • New POST /api/orders/:id/refund (super_admin / sales_admin only).
#     • UI: a yellow "Refund" button next to Cancel, only on paid /
#       partially-refunded orders. Opens a modal with amount input
#       (with Full + 50% shortcut buttons), required reason field,
#       and "Refund as Gifteeng coins" toggle (forced on for COD).
#       Shows already-refunded / refundable summary at top so the
#       agent can't guess wrong.
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a
tar xzf /tmp/patch_session74.tar.gz
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
echo "DEPLOY_OK session74"
