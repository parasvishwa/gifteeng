#!/usr/bin/env bash
set -euo pipefail

cd /srv/gifteeng

# Load env
set -a
. /srv/gifteeng/.env
set +a

# Extract patch
tar xzf /tmp/patch_session32.tar.gz

# Build API
pnpm --filter=@gifteeng/api build

# Restart service
systemctl restart gifteeng-api

# Wait and health check
sleep 5
echo "--- Health check ---"
curl -fsS http://127.0.0.1:4000/api/health
echo ""
echo "--- HTTP code ---"
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4000/api/health
