#!/usr/bin/env bash
# session141 — seller customizer, profile edit, bulk accept, packing slip, dispatch slot
#
# New features:
#   - /seller/products/[id]/customizer  — full customiser config (same as admin)
#   - /seller/profile                   — edit profile, dispatch slot (days)
#   - /seller/orders                    — bulk select + bulk accept + packing slip
#   - /seller/orders/packing-slip       — printable packing slip page
#   - PATCH /seller/auth/me             — seller self-update profile API
#   - PATCH /seller/orders/bulk-accept  — bulk accept API
#   - Schema: sellers.dispatchDays INT DEFAULT 2
#
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

tar xzf /tmp/patch_session141.tar.gz

# Run new migration
pnpm --filter @gifteeng/db prisma migrate deploy 2>&1 | tail -6

# Rebuild API (new endpoints)
pnpm --filter @gifteeng/api build 2>&1 | tail -6

# Rebuild web (new pages)
pnpm --filter @gifteeng/web build 2>&1 | tail -6

systemctl restart gifteeng-api
sleep 3
systemctl restart gifteeng-web
sleep 3

curl -fsS -o /dev/null -w 'api HTTP %{http_code}\n' http://127.0.0.1:4000/api/health
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/
echo "DEPLOY_OK session141"
