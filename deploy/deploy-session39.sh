#!/usr/bin/env bash
# Run on root@217.216.59.87 after: scp deploy/patch_session39.tar.gz root@217.216.59.87:/tmp/
set -euo pipefail

cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

tar xzf /tmp/patch_session39.tar.gz

pnpm --filter=@gifteeng/db prisma migrate deploy
pnpm --filter=@gifteeng/db prisma generate
pnpm --filter=@gifteeng/api build
pnpm --filter=@gifteeng/web build

systemctl restart gifteeng-api
sleep 5
systemctl restart gifteeng-web
sleep 5

curl -fsS http://127.0.0.1:4000/api/health
echo
curl -fsS -o /dev/null -w "web: %{http_code}\n" http://127.0.0.1:3000
curl -fsS -o /dev/null -w "config: %{http_code}\n" http://127.0.0.1:4000/api/admin/milestone-rewards/config || true
echo "session39 deploy complete"
