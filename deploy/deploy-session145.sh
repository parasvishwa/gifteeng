#!/usr/bin/env bash
# session145 — Schedule dispatch (single + bulk)
#
# New features:
#   - PATCH /seller/orders/:id/schedule       — set scheduled dispatch date
#   - PATCH /seller/orders/bulk-schedule      — bulk set scheduled dispatch date
#   - Order detail page: schedule date picker + timeline entry
#   - Orders list page: bulk schedule button + inline date picker + schedule chip on card
#   - Schema: order_item_assignments.scheduledDispatchAt TIMESTAMP
#
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

tar xzf /tmp/patch_session145.tar.gz

# Run new migration + regenerate Prisma client
pnpm --filter @gifteeng/db prisma migrate deploy 2>&1 | tail -6
pnpm --filter @gifteeng/db prisma generate 2>&1 | tail -4

# Rebuild API (new endpoints + service methods)
pnpm --filter @gifteeng/api build 2>&1 | tail -6

# Rebuild web (updated order pages)
pnpm --filter @gifteeng/web build 2>&1 | tail -6

systemctl restart gifteeng-api
sleep 3
systemctl restart gifteeng-web
sleep 3

curl -fsS -o /dev/null -w 'api HTTP %{http_code}\n' http://127.0.0.1:4000/api/health
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/
echo "DEPLOY_OK session145"
