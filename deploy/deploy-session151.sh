#!/usr/bin/env bash
set -e
cd /srv/gifteeng

echo "=== Session 151: Customiser button in seller product listing ==="

echo "--- Extracting patch ---"
tar xzf /tmp/patch_session151.tar.gz

echo "--- Building Web ---"
pnpm --filter @gifteeng/web build

echo "--- Restarting web service ---"
systemctl restart gifteeng-web

sleep 5

echo "--- Health check ---"
curl -sf http://localhost:3000 -o /dev/null && echo "web HTTP 200" || echo "web FAILED"

echo "=== Session 151 deploy complete ==="
echo "  What changed:"
echo "    - Seller product listing: own-listing rows now show a Wand2 icon"
echo "      linking to /seller/products/[id]/customizer"
