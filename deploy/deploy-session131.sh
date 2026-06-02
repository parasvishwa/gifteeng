#!/usr/bin/env bash
# session131 — Corporate removal STAGE 2b (drop DB tables).
#
# Applies the 20260520_remove_corporate migration: DROPs the 8
# corporate-feature tables (campaigns, wallets, catalogs, company_products
# + children) and the two orphaned `orders` columns.
#
# `companies` + `company_users` are KEPT — the super-admin panel logs in
# through them. Backup: /backups/gifteeng-pre-corporate-removal.dump

set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

tar xzf /tmp/patch_session131.tar.gz

# Clear any stuck Prisma advisory lock from earlier interrupted deploys.
echo "==> clearing stale prisma advisory locks..."
echo "SELECT pg_terminate_backend(pid) FROM pg_locks WHERE objid = 72707369;" \
  | sudo -u postgres psql gifteeng >/dev/null 2>&1 || true

echo "==> applying Prisma migrations..."
(cd packages/db && pnpm prisma migrate deploy 2>&1 | tail -12)
(cd packages/db && pnpm prisma generate 2>&1 | tail -3)

pnpm --filter @gifteeng/api build 2>&1 | tail -8
pnpm --filter @gifteeng/web build 2>&1 | tail -5

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

echo "DEPLOY_OK session131"
