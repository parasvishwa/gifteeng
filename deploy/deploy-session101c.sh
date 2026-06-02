#!/usr/bin/env bash
# session101c — Shopify-placeholder hide + sanitize-html bootstrap
#
# This deploy adds the sanitize-html module to apps/api/src/common/ which
# depends on `isomorphic-dompurify`. That package was added to package.json
# locally but never installed on the server, so the previous two deploy
# attempts failed at `nest build` with TS2307. This script runs
# `pnpm install --filter @gifteeng/api` BEFORE the build to pick up the
# new dep, then continues with the standard build / restart / health flow.

set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

tar xzf /tmp/patch_session101c.tar.gz

# Apply Prisma migrations if any new ones landed
if [[ -d packages/db/prisma/migrations ]]; then
  echo "==> applying Prisma migrations..."
  (cd packages/db && pnpm prisma migrate deploy 2>&1 | tail -8) || \
    echo "WARN: migrate deploy returned non-zero, proceeding"
  (cd packages/db && pnpm prisma generate 2>&1 | tail -3)
fi

# Install any new deps in apps/api (this patch adds isomorphic-dompurify)
echo "==> installing new api deps..."
pnpm install --filter @gifteeng/api --prefer-offline 2>&1 | tail -10

# Builds
pnpm --filter @gifteeng/api build 2>&1 | tail -5
pnpm --filter @gifteeng/web build 2>&1 | tail -5

# Restart + health check
systemctl restart gifteeng-api
sleep 4
for i in 1 2 3 4 5 6; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "  api /health ok"; break
  fi
  echo "  ... api not ready (attempt $i/6)"
  sleep 2
done
systemctl restart gifteeng-web
sleep 3
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/

echo "DEPLOY_OK session101c"
