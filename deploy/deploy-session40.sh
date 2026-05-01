#!/usr/bin/env bash
set -euo pipefail

cd /srv/gifteeng
set -a
. /srv/gifteeng/.env
set +a

echo "==> Extracting patch"
tar xzf /tmp/patch_session40.tar.gz

echo "==> Prisma migrate deploy"
pnpm --filter=@gifteeng/db prisma migrate deploy

echo "==> Prisma generate"
pnpm --filter=@gifteeng/db prisma generate

echo "==> Building API"
if ! pnpm --filter=@gifteeng/api build > /tmp/session40-api-build.log 2>&1; then
  echo "API BUILD FAILED. Last 30 lines:"
  tail -n 30 /tmp/session40-api-build.log
  exit 1
fi
echo "API build OK"

echo "==> Building Web"
if ! pnpm --filter=@gifteeng/web build > /tmp/session40-web-build.log 2>&1; then
  echo "WEB BUILD FAILED. Last 30 lines:"
  tail -n 30 /tmp/session40-web-build.log
  exit 1
fi
echo "Web build OK"

echo "==> Restarting API"
systemctl restart gifteeng-api
sleep 5

echo "==> Restarting Web"
systemctl restart gifteeng-web
sleep 5

echo "==> /api/health"
curl -fsS http://127.0.0.1:4000/api/health
echo

echo "==> Web root status"
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000

echo "==> /api/reviews/stats"
curl -fsS http://127.0.0.1:4000/api/reviews/stats
echo

echo "==> /api/reviews/aggregated?page=1&pageSize=5"
curl -fsS "http://127.0.0.1:4000/api/reviews/aggregated?page=1&pageSize=5"
echo

echo "==> Admin endpoint should be 401"
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4000/api/admin/external-reviews || true

echo "==> Done"
