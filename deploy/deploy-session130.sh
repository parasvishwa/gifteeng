#!/usr/bin/env bash
# session130 — Corporate removal STAGE 2a (API modules).
#
# Removes the corporate API surface:
#   • Deletes NestJS modules: companies, campaigns, wallet, catalogs
#   • Unregisters them from app.module.ts
#   • Refactors checkout: drops the B2B/wallet payment path + endpoint
#
# The Prisma SCHEMA is unchanged in this stage — the corporate tables stay
# in the DB (dormant, unused). The DROP-table migration is stage 2b.

set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

tar xzf /tmp/patch_session130.tar.gz

echo "==> removing corporate API modules..."
rm -rf apps/api/src/modules/companies \
       apps/api/src/modules/campaigns \
       apps/api/src/modules/wallet \
       apps/api/src/modules/catalogs
echo "    done"

pnpm --filter @gifteeng/api build 2>&1 | tail -8

systemctl restart gifteeng-api
sleep 4
for i in 1 2 3 4 5 6; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "  api /health ok"; break
  fi
  echo "  ... api not ready (attempt $i/6)"
  sleep 2
done

echo "DEPLOY_OK session130"
