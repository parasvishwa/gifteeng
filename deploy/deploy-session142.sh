#!/usr/bin/env bash
# session142 — Seller Insights (payout summary, order summary, product summary)
#
# New features:
#   - GET /seller/insights/payout-summary  — 6-month chart, breakdown table, commission
#   - GET /seller/insights/order-summary   — status overview grid, paginated order list
#   - GET /seller/insights/product-summary — per-product orders, revenue, returns, rating
#   - /seller/insights                     — insights page with 3 tabs + date presets
#   - Dashboard: "Seller Insights" quick action card
#
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

tar xzf /tmp/patch_session142.tar.gz

# Rebuild API (new controller + service)
pnpm --filter @gifteeng/api build 2>&1 | tail -6

# Rebuild web (new page)
pnpm --filter @gifteeng/web build 2>&1 | tail -6

systemctl restart gifteeng-api
sleep 3
systemctl restart gifteeng-web
sleep 3

curl -fsS -o /dev/null -w 'api HTTP %{http_code}\n' http://127.0.0.1:4000/api/health
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/
echo "DEPLOY_OK session142"
