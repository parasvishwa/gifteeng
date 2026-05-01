#!/usr/bin/env bash
set -euo pipefail

cd /srv/gifteeng
set -a
. /srv/gifteeng/.env
set +a

tar xzf /tmp/patch_session36.tar.gz

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

echo "=== API Health ==="
curl -fsS http://127.0.0.1:4000/api/health

echo ""
echo "=== Web HTTP ==="
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000
