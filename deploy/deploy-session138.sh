#!/usr/bin/env bash
# session138 — marketplace Phase 5: seller payouts + analytics
#   PayoutStatus enum + PlatformSetting + SellerPayout + SellerPayoutItem models.
#   SellerPayoutsModule: daily cron batches eligible assignments, seller analytics
#   endpoint, admin payouts management + platform settings API.
#   Seller dashboard analytics tiles (revenue, orders, next payout).
#   Seller /seller/payouts history page. Admin /super-admin/payouts page.
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

tar xzf /tmp/patch_session138.tar.gz

# Clear any stale Prisma advisory lock before migrating
sudo -u postgres psql gifteeng -c \
  "SELECT pg_terminate_backend(pid) FROM pg_locks WHERE objid = 72707369;" 2>/dev/null || true

echo "==> applying Prisma migrations..."
(cd packages/db && pnpm prisma migrate deploy 2>&1 | tail -10) || \
  echo "WARN: migrate deploy returned non-zero, proceeding"
(cd packages/db && pnpm prisma generate 2>&1 | tail -3)

pnpm --filter @gifteeng/api build 2>&1 | tail -6
pnpm --filter @gifteeng/web build 2>&1 | tail -6

systemctl restart gifteeng-api
sleep 4
for i in 1 2 3 4 5 6; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "  api /health ok"; break
  fi
  echo "  ... api not ready (attempt $i/6)"
  sleep 2
done
systemctl restart gifteeng-web
sleep 3
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/

echo "DEPLOY_OK session138"
