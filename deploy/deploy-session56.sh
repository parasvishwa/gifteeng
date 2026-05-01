#!/usr/bin/env bash
# session56 — Shopify migration (customers + orders CSV import)
#
# Backend:
#   • New module @gifteeng/api/src/modules/shopify-migrate
#       - controller with two POST endpoints (customers + orders)
#       - service with tolerant CSV parser, phone normaliser,
#         dedup-by-shopify-id, status / payment mapping
#   • All migrated order line-items hang off a hidden placeholder
#     Product (`shopify-migrated-line-item`) so OrderItem.productId
#     stays satisfied — full original info lives in `snapshot`.
#   • Admin-only (super_admin role). Both endpoints support ?dryRun.
#   • Module registered in app.module.ts.
#
# Web:
#   • New page /super-admin/data-import/shopify with two tabs
#     (Customers / Orders), drag-drop CSV upload, dry-run preview,
#     skipped-row inspector.
#   • Sidebar gets a "Shopify Migrate" entry under System.
#
# No DB migration needed — uses the existing Customer / Order /
# OrderItem / SavedAddress / Product tables.
set -euo pipefail

cd /srv/gifteeng
set -a
. /srv/gifteeng/.env
set +a

tar xzf /tmp/patch_session56.tar.gz

pnpm --filter @gifteeng/api build
pnpm --filter @gifteeng/web build

systemctl restart gifteeng-api
sleep 4
systemctl restart gifteeng-web
sleep 3

for i in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "  api /health ok"
    break
  fi
  echo "  ... api not ready yet (attempt $i/5)"
  sleep 2
done

echo
echo "DEPLOY_OK session56"
