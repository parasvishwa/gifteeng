#!/usr/bin/env bash
set -euo pipefail
cd /srv/gifteeng
set -a
. /srv/gifteeng/.env
set +a
tar xzf /tmp/patch_session37.tar.gz
pnpm --filter=@gifteeng/api build
systemctl restart gifteeng-api
sleep 5
echo "=== API HEALTH ==="
curl -fsS http://127.0.0.1:4000/api/health
echo ""
echo "=== PAYLOAD SIZE CHECK ==="
SIZE=$(curl -fsS "http://127.0.0.1:4000/api/products?page=1&pageSize=100" | wc -c)
echo "Products list response size: $SIZE bytes"
