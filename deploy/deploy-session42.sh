#!/bin/bash
set -e
cd /srv/gifteeng
tar xzf /tmp/patch_session42.tar.gz
pnpm --filter=@gifteeng/api build
systemctl restart gifteeng-api
sleep 5
curl -fsS http://127.0.0.1:4000/api/health
echo ""
echo "=== DONE ==="
