#!/bin/bash
set -e
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a
echo "=== Extracting patch ==="
tar xzf /tmp/patch_session38.tar.gz
echo "=== Prisma migrate deploy ==="
pnpm --filter=@gifteeng/db prisma migrate deploy
echo "=== Prisma generate ==="
pnpm --filter=@gifteeng/db prisma generate
echo "=== API build ==="
pnpm --filter=@gifteeng/api build
echo "=== Web build ==="
pnpm --filter=@gifteeng/web build
echo "=== Restart API ==="
systemctl restart gifteeng-api
sleep 5
echo "=== Restart Web ==="
systemctl restart gifteeng-web
sleep 5
echo "=== Health checks ==="
curl -fsS http://127.0.0.1:4000/api/health && echo
curl -fsS -o /dev/null -w "web: %{http_code}\n" http://127.0.0.1:3000
curl -s -o /dev/null -w "config: %{http_code}\n" http://127.0.0.1:4000/api/admin/inactivity-rewards/config
curl -s -X POST -o /dev/null -w "run: %{http_code}\n" http://127.0.0.1:4000/api/admin/inactivity-rewards/run
echo "=== DB row check ==="
psql "$DATABASE_URL" -c "SELECT id, min_amount, max_amount, inactivity_days, cooldown_days, daily_probability, enabled FROM inactivity_reward_config;" || true
echo "=== Done ==="
