#!/usr/bin/env bash
set -euo pipefail

cd /srv/gifteeng
set -a
. /srv/gifteeng/.env
set +a

tar xzf /tmp/patch_session49.tar.gz

# Force regen of prisma client - fixes case where it's stale on photoUrls/videoUrl
pnpm --filter=@gifteeng/db prisma generate

pnpm --filter=@gifteeng/api build

systemctl restart gifteeng-api
sleep 5
curl -fsS http://127.0.0.1:4000/api/health
echo
echo "DEPLOY_OK"
