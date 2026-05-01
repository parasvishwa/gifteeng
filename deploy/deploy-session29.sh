#!/bin/bash
set -e
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a
tar xzf /tmp/patch_session29.tar.gz
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
echo "=== Health Check API ==="
curl -fsS http://127.0.0.1:4000/api/health
echo ""
echo "=== Health Check Web ==="
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000
echo "=== Verify new endpoint (expect 401) ==="
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4000/api/admin/analytics/users
