#!/usr/bin/env bash
set -e
cd /srv/gifteeng

echo "=== Session 147: Tax Invoices + Category Template Browser ==="

echo "--- Extracting patch ---"
tar xzf /tmp/patch_session147.tar.gz

echo "--- Installing deps ---"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "--- Building API ---"
pnpm --filter @gifteeng/api build

echo "--- Building Web ---"
pnpm --filter @gifteeng/web build

echo "--- Restarting API ---"
pm2 restart gifteeng-api --update-env

echo "--- Restarting Web ---"
pm2 restart gifteeng-web --update-env

sleep 3

echo "--- Health checks ---"
curl -sf http://localhost:4000/health && echo "api HTTP 200" || echo "api FAILED"
curl -sf http://localhost:3000 -o /dev/null && echo "web HTTP 200" || echo "web FAILED"

echo "=== Session 147 deploy complete ==="
