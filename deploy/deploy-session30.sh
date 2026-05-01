#!/usr/bin/env bash
set -euo pipefail

cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

echo "===== Extracting patch ====="
tar xzf /tmp/patch_session30.tar.gz
echo "Files extracted."

echo "===== Running prisma migrate deploy ====="
pnpm --filter=@gifteeng/db prisma migrate deploy 2>&1

echo "===== Running prisma generate ====="
pnpm --filter=@gifteeng/db prisma generate 2>&1 | tail -20

echo "===== Building API ====="
if ! pnpm --filter=@gifteeng/api build 2>&1 | tee /tmp/api_build.log; then
  echo "===== API BUILD FAILED ====="
  tail -30 /tmp/api_build.log
  exit 1
fi

echo "===== Building Web ====="
if ! pnpm --filter=@gifteeng/web build 2>&1 | tee /tmp/web_build.log; then
  echo "===== WEB BUILD FAILED ====="
  tail -30 /tmp/web_build.log
  exit 1
fi

echo "===== Restarting gifteeng-api ====="
systemctl restart gifteeng-api
sleep 5

echo "===== Restarting gifteeng-web ====="
systemctl restart gifteeng-web
sleep 5

echo "===== Health check API ====="
curl -fsS http://127.0.0.1:4000/api/health
echo ""

echo "===== Health check Web ====="
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000

echo "===== Deploy complete ====="
