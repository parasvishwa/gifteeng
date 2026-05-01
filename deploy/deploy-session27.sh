#!/usr/bin/env bash
set -euo pipefail

echo "=== session27 deploy: analytics rollup + pruning ==="
cd /srv/gifteeng

echo "--- extracting patch ---"
tar xzf /tmp/patch_session27.tar.gz

echo "--- prisma migrate deploy ---"
if pnpm --filter=@gifteeng/db prisma migrate deploy 2>/tmp/migrate.err; then
  echo "migration via filter ok"
else
  echo "filter route failed, falling back to packages/db cwd:"
  cat /tmp/migrate.err || true
  cd packages/db
  pnpm prisma migrate deploy
  cd /srv/gifteeng
fi

echo "--- prisma generate ---"
pnpm --filter=@gifteeng/db prisma generate

echo "--- api build ---"
pnpm --filter=@gifteeng/api build

echo "--- restart api ---"
systemctl restart gifteeng-api
sleep 5

echo "--- health check ---"
curl -fsS http://127.0.0.1:4000/api/health
echo
echo "--- endpoint registration check (expect 401) ---"
echo "rollup-daily:"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST http://127.0.0.1:4000/api/admin/analytics/rollup-daily
echo "prune-old:"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"daysToKeep":90}' http://127.0.0.1:4000/api/admin/analytics/prune-old

echo "--- table existence check ---"
cd /srv/gifteeng/packages/db
pnpm prisma db execute --stdin <<'SQL' || echo "(prisma db execute returned non-zero)"
SELECT count(*) FROM page_view_daily_summary;
SQL
cd /srv/gifteeng

cat <<'CRON_SUGGESTION'

=== SUGGESTED CRON CONTENT (NOT INSTALLED) ===
# /etc/cron.d/gifteeng-analytics
# Daily rollup at 01:00 UTC, then prune raw page_views older than 90d at 02:00 UTC
0 1 * * * root curl -X POST -H "Authorization: Bearer ${ADMIN_JWT}" https://new-api.gifteeng.com/api/admin/analytics/rollup-daily
0 2 * * * root curl -X POST -H "Authorization: Bearer ${ADMIN_JWT}" -H "Content-Type: application/json" -d '{"daysToKeep":90}' https://new-api.gifteeng.com/api/admin/analytics/prune-old
# NOTE: store ADMIN_JWT in /etc/gifteeng/admin-token and source it from a wrapper
#       script (e.g. /usr/local/bin/gifteeng-rollup.sh) rather than embedding here.
=== END SUGGESTED CRON ===

echo "=== session27 deploy complete ==="
CRON_SUGGESTION
