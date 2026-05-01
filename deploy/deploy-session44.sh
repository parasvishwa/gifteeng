#!/bin/bash
set -e

cd /srv/gifteeng
tar xzf /tmp/patch_session44.tar.gz
pnpm --filter=@gifteeng/api build
systemctl restart gifteeng-api
sleep 5
echo "--- health ---"
curl -fsS http://127.0.0.1:4000/api/health
echo ""
echo "--- bulk-import ---"
curl -X POST -fsS -o /dev/null -w "bulk-import: %{http_code}\n" http://127.0.0.1:4000/api/admin/external-reviews/bulk-import || echo "bulk-import: $(curl -X POST -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4000/api/admin/external-reviews/bulk-import)"
