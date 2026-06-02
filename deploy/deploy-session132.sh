#!/usr/bin/env bash
# session132 — Marketplace Phase 1a: Seller schema foundation.
# Adds `sellers` + `seller_otps` tables and `products.brandName`.

set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

tar xzf /tmp/patch_session132.tar.gz

echo "==> clearing stale prisma advisory locks..."
echo "SELECT pg_terminate_backend(pid) FROM pg_locks WHERE objid = 72707369;" \
  | sudo -u postgres psql gifteeng >/dev/null 2>&1 || true

echo "==> applying Prisma migrations..."
(cd packages/db && pnpm prisma migrate deploy 2>&1 | tail -10)
(cd packages/db && pnpm prisma generate 2>&1 | tail -3)

pnpm --filter @gifteeng/api build 2>&1 | tail -6

systemctl restart gifteeng-api
sleep 4
for i in 1 2 3 4 5 6; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "  api /health ok"; break
  fi
  echo "  ... api not ready (attempt $i/6)"
  sleep 2
done

echo "DEPLOY_OK session132"
