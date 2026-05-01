#!/usr/bin/env bash
set -euo pipefail

cd /srv/gifteeng

# Load env so prisma sees DATABASE_URL (same fix as session27)
set -a
. /srv/gifteeng/.env
set +a

echo "==> Extracting patch_session28.tar.gz"
tar xzf /tmp/patch_session28.tar.gz

echo "==> Building @gifteeng/api"
pnpm --filter=@gifteeng/api build

echo "==> Restarting gifteeng-api"
systemctl restart gifteeng-api

echo "==> Waiting 5s for service to come up"
sleep 5

echo "==> Health check"
curl -fsS http://127.0.0.1:4000/api/health
echo
echo "==> Deploy complete."
