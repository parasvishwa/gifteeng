#!/usr/bin/env bash
set -e
cd /srv/gifteeng

echo "=== Session 149: Fix accept-order client crash (missing include) ==="

echo "--- Extracting patch ---"
tar xzf /tmp/patch_session149.tar.gz

echo "--- Building API ---"
pnpm --filter @gifteeng/api build

echo "--- Restarting API ---"
systemctl restart gifteeng-api

sleep 4

echo "--- Health check ---"
curl -s http://localhost:4000/api/seller/products/bulk-categories \
  -H 'Authorization: Bearer test' -o /dev/null -w "%{http_code}" | grep -q 401 \
  && echo "API OK (401 = auth gated)" || echo "API FAILED"

echo "=== Session 149 deploy complete ==="
