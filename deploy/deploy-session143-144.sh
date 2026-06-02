#!/usr/bin/env bash
# session143+144 — Reports downloads & Bulk product upload
#
# New features:
#   - GET /seller/reports/orders?from=&to=     — CSV download (order report)
#   - GET /seller/reports/payouts?from=&to=    — CSV download (payout statement)
#   - GET /seller/products/bulk-template       — CSV template download
#   - POST /seller/products/bulk-upload        — bulk create products from CSV
#   - /seller/reports                          — report download page
#   - /seller/products/bulk-upload             — 3-step bulk upload wizard
#   - Dashboard: Reports quick action card
#   - Products page: Bulk upload CSV entry point
#
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

tar xzf /tmp/patch_session143_144.tar.gz

# Rebuild API (new controllers + service methods)
pnpm --filter @gifteeng/api build 2>&1 | tail -8

# Rebuild web (new pages)
pnpm --filter @gifteeng/web build 2>&1 | tail -8

systemctl restart gifteeng-api
sleep 3
systemctl restart gifteeng-web
sleep 3

curl -fsS -o /dev/null -w 'api HTTP %{http_code}\n' http://127.0.0.1:4000/api/health
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/
echo "DEPLOY_OK session143+144"
