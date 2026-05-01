#!/usr/bin/env bash
# session77 — Edit-order flow (Phase C-2 of the order page)
#
# What admins asked for repeatedly: change qty on a line, remove a line,
# fix a typo'd shipping address — all without cancelling and recreating
# the whole order. Today they had to email engineering. Now they can do
# it themselves with audit trail + automatic inventory restock + total
# recompute.
#
# Service:
#   • OrdersService.editOrder(id, edits, caller) — single transaction:
#       - validates allowed status (new_order / confirmed /
#         in_production / ready_to_ship; blocked once shipped/delivered)
#       - per-line qty change OR remove flag (qty=0 must pair with
#         remove=true, no silent zeroes)
#       - pre-flight stock check on qty INCREASES — refuses with a
#         clean message rather than over-selling
#       - applyInventoryDelta() restocks to matching ProductVariantOption
#         (name+value) when present, falls back to parent Product
#       - recomputes subtotal from surviving lines, applies the
#         original tax-rate proportionally, leaves discount + shipping
#         unchanged unless explicitly passed
#       - audit log entry with full diff (item edits + addr changes +
#         old/new grand + per-line restock log)
#       - SSE invalidate orders + (when restock occurred) products
#       - optional customer push notification with the new total + Δ
#
#   • Critical design decision: this NEVER auto-captures additional
#     payment OR auto-refunds. Money side is the agent's call —
#     positive Δ = ask customer for top-up via separate channel,
#     negative Δ = use the existing Refund flow. UI surfaces both
#     hints so the agent doesn't forget.
#
# Controller:
#   • POST /api/orders/:id/edit (super_admin / sales_admin only)
#
# UI (admin order detail page):
#   • New "Edit" button in the header strip (only visible on editable
#     statuses).
#   • Modal with: per-line qty stepper + remove-toggle, live new-total
#     preview with Δ + colour-coded direction + the appropriate hint
#     ("use Refund flow to return the difference" / "request top-up
#     manually"), expandable shipping + billing address forms, and
#     a "notify customer" checkbox (default on).
#   • "Save changes" button is only enabled when something actually
#     changed (cuts accidental no-op POSTs).
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a
tar xzf /tmp/patch_session77.tar.gz
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
echo "DEPLOY_OK session77"
