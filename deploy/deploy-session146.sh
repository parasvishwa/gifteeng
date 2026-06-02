#!/usr/bin/env bash
# session146 — Deep audit gap-fill
#
# New features:
#   - GET /seller/payouts/outstanding         — delivered unpaid orders (in-window + eligible)
#   - GET /seller/reports/gst                 — GST breakdown CSV (CGST/SGST/IGST per order)
#   - GET /seller/reports/outstanding         — outstanding payments CSV download
#   - GET /seller/analytics                   — now includes catalog.activeListings + zeroSales30d
#   - GET /seller/insights/order-summary      — now includes dispatch compliance % + avg hours
#   - /seller/payouts                         — new "Outstanding" tab (in-window + eligible view)
#   - /seller/reports                         — 2 new report cards: GST Report, Outstanding Payments
#   - /seller/dashboard                       — catalog health tile (active listings, 0-sales count)
#   - /seller/insights Orders tab             — dispatch compliance progress bar
#
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

tar xzf /tmp/patch_session146.tar.gz

# Rebuild API
pnpm --filter @gifteeng/api build 2>&1 | tail -8

# Rebuild web
pnpm --filter @gifteeng/web build 2>&1 | tail -8

systemctl restart gifteeng-api
sleep 3
systemctl restart gifteeng-web
sleep 3

curl -fsS -o /dev/null -w 'api HTTP %{http_code}\n' http://127.0.0.1:4000/api/health
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/
echo "DEPLOY_OK session146"
