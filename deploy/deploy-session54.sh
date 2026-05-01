#!/usr/bin/env bash
# session54 — Occasion routing (#27 + #32 catalog parity)
#
# Backend:
#   • Announcement model gets `slug`, `collection_slugs[]`, `category_names[]`
#     so an admin banner can wire its "Shop Now" CTA to a specific
#     occasion-filtered shop view + a list of collections / categories.
#   • Service serialises and accepts the new fields; controller schema
#     validates slug + max-50 string-arrays per field.
#   • Migration adds the three columns to `announcements` (all nullable —
#     reversible, no data backfill required).
#
# Web admin:
#   • /super-admin/announcements/page.tsx adds an "Occasion routing"
#     section to the form (slug + collection slugs + category names).
#
# Mobile:
#   • event_reminder_banner.dart prefers admin `slug` to build
#     /shop?occasion=<slug> when the legacy `link` column is empty/default.
#   • shop_screen.dart now requests pageSize=100 (was 24) so a growing
#     catalog never silently truncates — addresses the "I see this on web
#     but not in the app" parity bug from session 53.
set -euo pipefail

cd /srv/gifteeng
set -a
. /srv/gifteeng/.env
set +a

tar xzf /tmp/patch_session54.tar.gz

# Run the new migration before regenerating the Prisma client; otherwise
# `findMany` on the new columns will error with "column not found".
pnpm --filter @gifteeng/db prisma migrate deploy
pnpm --filter @gifteeng/db prisma generate

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
echo "DEPLOY_OK session54"
