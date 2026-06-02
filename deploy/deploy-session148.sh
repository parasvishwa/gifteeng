#!/usr/bin/env bash
set -e
cd /srv/gifteeng

echo "=== Session 148: Dashboard + Insights chart overhaul ==="

echo "--- Extracting patch ---"
tar xzf /tmp/patch_session148.tar.gz

echo "--- Building Web ---"
pnpm --filter @gifteeng/web build

echo "--- Restarting Web ---"
systemctl restart gifteeng-web

sleep 4

echo "--- Health check ---"
curl -sf http://localhost:3000 -o /dev/null && echo "web HTTP 200" || echo "web FAILED"

echo "=== Session 148 deploy complete ==="
