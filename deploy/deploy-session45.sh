#!/usr/bin/env bash
set -euo pipefail

cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

echo "==> extracting patch"
tar xzf /tmp/patch_session45.tar.gz

echo "==> prisma migrate deploy"
pnpm --filter=@gifteeng/db prisma migrate deploy

echo "==> prisma generate"
pnpm --filter=@gifteeng/db prisma generate

echo "==> api build"
if ! pnpm --filter=@gifteeng/api build 2>&1 | tee /tmp/session45-api-build.log; then
  echo "---- API BUILD FAILED (last 30 lines) ----"
  tail -n 30 /tmp/session45-api-build.log
  exit 1
fi

echo "==> web build"
if ! pnpm --filter=@gifteeng/web build 2>&1 | tee /tmp/session45-web-build.log; then
  echo "---- WEB BUILD FAILED (last 30 lines) ----"
  tail -n 30 /tmp/session45-web-build.log
  exit 1
fi

echo "==> restart api"
systemctl restart gifteeng-api
sleep 5

echo "==> restart web"
systemctl restart gifteeng-web
sleep 5

echo "==> health checks"
curl -fsS http://127.0.0.1:4000/api/health
echo
curl -fsS -o /dev/null -w "web_http_code=%{http_code}\n" http://127.0.0.1:3000
echo "==> aggregated reviews sample"
curl -fsS "http://127.0.0.1:4000/api/reviews/aggregated?page=1&pageSize=2"
echo
echo "==> done"
