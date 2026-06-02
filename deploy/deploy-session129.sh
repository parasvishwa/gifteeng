#!/usr/bin/env bash
# session129 — Corporate offering removal, STAGE 1 (web UI + routes).
#
# Removes every corporate entry point from the website + admin:
#   • Admin sidebar CORPORATE group (Companies/HR Admins/Campaigns/Wallets)
#   • Storefront navbar "Corporate" link + "Corporate Gifts" megamenu item
#     + "Corporate Gifting" category-row link
#   • Footer "Corporate Orders" link
#   • Homepage CorporateCTA ("Return Gifts & Bulk Orders") section
#   • OccasionChips corporate chip
#   • 8 route folders (deleted on the server below — tar only adds files)
#
# Stage 2 (API modules + Prisma schema + DROP migration) ships separately.

set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

tar xzf /tmp/patch_session129.tar.gz

# Delete the corporate route folders on the server (the patch tar only
# *adds* files; removed folders must be deleted explicitly).
echo "==> removing corporate route folders..."
rm -rf apps/web/app/b2b/super-admin/companies \
       apps/web/app/b2b/super-admin/hr-admins \
       apps/web/app/b2b/super-admin/campaigns \
       apps/web/app/b2b/super-admin/wallets \
       apps/web/app/b2c/corporate \
       apps/web/app/b2c/catalogs \
       apps/web/app/b2b/employee \
       apps/web/app/b2b/hr-admin
echo "    done"

# Web-only change — no migrations, no API rebuild needed.
pnpm --filter @gifteeng/web build 2>&1 | tail -6

systemctl restart gifteeng-web
sleep 3
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/

echo "DEPLOY_OK session129"
