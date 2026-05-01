#!/bin/bash
set -e

echo "=== Session 25 Deploy ==="
cd /srv/gifteeng

echo "--- Extracting patch ---"
tar xzf /tmp/patch_session25.tar.gz

echo "--- Building API ---"
pnpm --filter=@gifteeng/api build

echo "--- Building Web ---"
pnpm --filter=@gifteeng/web build

echo "--- Restarting API ---"
systemctl restart gifteeng-api
sleep 5

echo "--- Restarting Web ---"
systemctl restart gifteeng-web
sleep 5

echo "--- API health ---"
curl -fsS http://127.0.0.1:4000/health
echo

echo "--- Web check ---"
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000

echo "=== Deploy complete ==="
