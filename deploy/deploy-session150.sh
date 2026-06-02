#!/usr/bin/env bash
set -e
cd /srv/gifteeng

echo "=== Session 150: Seller store page + onboarding improvements ==="

echo "--- Extracting patch ---"
tar xzf /tmp/patch_session150.tar.gz

echo "--- Running DB migration ---"
psql "$DATABASE_URL" -f deploy/session150.sql

echo "--- Regenerating Prisma client ---"
pnpm --filter @gifteeng/db exec prisma generate

echo "--- Building API ---"
pnpm --filter @gifteeng/api build

echo "--- Building Web ---"
pnpm --filter @gifteeng/web build

echo "--- Restarting services ---"
systemctl restart gifteeng-api gifteeng-web

sleep 5

echo "--- Health checks ---"
curl -s http://localhost:4000/api/store/sellers/test-slug -o /dev/null -w "%{http_code}" | \
  grep -qE "^(200|404)$" && echo "API store endpoint OK" || echo "API store endpoint FAILED"

curl -sf http://localhost:3000 -o /dev/null && echo "web HTTP 200" || echo "web FAILED"

echo "=== Session 150 deploy complete ==="
