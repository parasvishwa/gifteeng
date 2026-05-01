#!/usr/bin/env bash
set -euo pipefail

cd /srv/gifteeng

echo "==> Extracting patch"
tar xzf /tmp/patch_session26.tar.gz

echo "==> Building @gifteeng/api"
pnpm --filter=@gifteeng/api build

echo "==> Building @gifteeng/web"
pnpm --filter=@gifteeng/web build

echo "==> Restarting gifteeng-api"
systemctl restart gifteeng-api
sleep 5

echo "==> Restarting gifteeng-web"
systemctl restart gifteeng-web
sleep 4

echo "==> API health check"
curl -fsS http://127.0.0.1:4000/api/health
echo

echo "==> Web HTTP code"
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000

echo "==> Deploy complete"
