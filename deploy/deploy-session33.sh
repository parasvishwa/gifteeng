#!/usr/bin/env bash
set -euo pipefail

cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

echo "=== Extracting patch ==="
tar xzf /tmp/patch_session33.tar.gz
echo "Extracted."

echo "=== Prisma migrate deploy ==="
pnpm --filter=@gifteeng/db prisma migrate deploy 2>&1 | tail -40

echo "=== Prisma generate ==="
pnpm --filter=@gifteeng/db prisma generate 2>&1 | tail -20

echo "=== Building API ==="
if ! pnpm --filter=@gifteeng/api build 2>&1 | tee /tmp/api-build.log | tail -20; then
  echo "=== API BUILD FAILED — last 30 lines ==="
  tail -30 /tmp/api-build.log
  exit 1
fi

echo "=== Building Web ==="
if ! pnpm --filter=@gifteeng/web build 2>&1 | tee /tmp/web-build.log | tail -20; then
  echo "=== WEB BUILD FAILED — last 30 lines ==="
  tail -30 /tmp/web-build.log
  exit 1
fi

echo "=== Restarting API ==="
systemctl restart gifteeng-api
sleep 5
systemctl is-active gifteeng-api && echo "api: active"

echo "=== Restarting Web ==="
systemctl restart gifteeng-web
sleep 5
systemctl is-active gifteeng-web && echo "web: active"

echo "=== Health check API ==="
curl -fsS http://127.0.0.1:4000/api/health || echo "API health failed"
echo

echo "=== Web HTTP code ==="
curl -fsS -o /dev/null -w "web: %{http_code}\n" http://127.0.0.1:3000 || echo "web check failed"

echo "=== Public banners endpoint (should be []) ==="
curl -fsS "http://127.0.0.1:4000/api/banners?placement=home"
echo

echo "=== Admin banners gating (should be 401) ==="
curl -fsS -o /dev/null -w "admin/banners (no auth): %{http_code}\n" "http://127.0.0.1:4000/api/admin/banners" || \
  curl -s -o /dev/null -w "admin/banners (no auth): %{http_code}\n" "http://127.0.0.1:4000/api/admin/banners"

echo "=== DONE ==="
