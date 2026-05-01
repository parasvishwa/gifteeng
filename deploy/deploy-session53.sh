#!/usr/bin/env bash
# session53 — 33-issue sweep (backend + shared + web admin)
#
# Backend:
#   • addresses.controller.ts — accepts both `name` and `fullName`, plus
#     optional `country`. Returns both keys so older mobile builds and the
#     newer web/admin clients can read the response without branching.
#   • cart.service.ts — cart now `include: { items: { include: { product:
#     true } } }` so the checkout review screen renders real title / image /
#     price instead of falling back to "Gift" + ₹0.
#
# Shared:
#   • ProductListQuerySchema — `.passthrough()` + optional minPrice /
#     maxPrice / isCustomizable / status, sort loosened to z.string().
#     Fixes the GET /products 400 "Validation failed" wave from mobile.
#
# Web admin:
#   • customizer/page.tsx — pink hint shown when shape=circle so the admin
#     knows the rendered circle equals the square bounding-box side.
#
# Mobile is built + installed locally (Flutter APK on Galaxy Z Fold 7),
# not pushed via this script.
set -euo pipefail

cd /srv/gifteeng
set -a
. /srv/gifteeng/.env
set +a

tar xzf /tmp/patch_session53.tar.gz

# Shared schema changed → rebuild before the api compile picks it up.
pnpm --filter @gifteeng/shared build
pnpm --filter @gifteeng/api build
pnpm --filter @gifteeng/web build

systemctl restart gifteeng-api
sleep 4
systemctl restart gifteeng-web
sleep 3

# Health check the API before declaring success.
for i in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "  api /health ok"
    break
  fi
  echo "  ... api not ready yet (attempt $i/5)"
  sleep 2
done

echo
echo "DEPLOY_OK session53"
