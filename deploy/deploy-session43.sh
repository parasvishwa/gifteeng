#!/usr/bin/env bash
set -euo pipefail

cd /srv/gifteeng
tar xzf /tmp/patch_session43.tar.gz

echo "=== Building API ==="
pnpm --filter=@gifteeng/api build

echo "=== Building Web ==="
pnpm --filter=@gifteeng/web build

echo "=== Restarting API ==="
systemctl restart gifteeng-api
sleep 5

echo "=== Restarting Web ==="
systemctl restart gifteeng-web
sleep 5

echo "=== Health checks ==="
curl -fsS http://127.0.0.1:4000/api/health
echo ""
curl -fsS -o /dev/null -w "WEB_HTTP=%{http_code}\n" http://127.0.0.1:3000
