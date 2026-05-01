#!/usr/bin/env bash
# session69 — Scalability foundation + customizer image hoist + Flutter coupons
#
# Big-picture goals: take the current "100-200 concurrent users" ceiling
# up toward the 1000-user target with no external dependencies — every
# change here lives on the existing Contabo VPS.
#
# What ships:
#
#   PHASE 1 — Customizer image de-flate (the actual cart bug)
#     • New apps/web/lib/customization-deflate.ts walks the cart payload
#       and hoists every embedded `data:image/…` into /api/files,
#       substituting the URL. Idempotent. Cuts cart-customization rows
#       from MB to KB regardless of which customizer path slipped a
#       base64 through (Fabric paste, simple-zone fallback, drag-drop).
#     • Wired into apps/web/lib/stores/cart.ts addItem POST path.
#     • The 200 MB body limit from session68 stays as belt-and-braces
#       in case a really large canvas slips through.
#
#   PHASE 2 — Redis pub/sub for SSE realtime (cluster-ready)
#     • Installed redis-server 7 on the VPS (256 MB cap, allkeys-lru).
#     • `ioredis` added to apps/api dependencies.
#     • RealtimeService now PUB/SUBs on `rt:user` + `rt:global` channels.
#       Each worker process fans out locally AND publishes via Redis;
#       remote workers re-broadcast to their own local streams. Self-
#       publishes are deduped via a worker-id sentinel. Drop-in
#       backwards compat: single-process mode is unchanged.
#
#   PHASE 3 — Catalog read-cache (Redis)
#     • New CacheService with getOrSet/del/delByPattern, in-memory
#       fallback if Redis goes down (cache is never load-bearing).
#     • Wraps products list (b2c) + product detail by slug, categories
#       list, collections list+detail, hero-banners listActive. TTLs
#       60-120s, with mutation-driven invalidation through the existing
#       Prisma `$use` middleware → realtime broadcast hook → cache
#       delByPattern. So an admin save shows up to all clients within
#       the SSE round-trip, not on the next TTL.
#
#   PHASE 4 — pgbouncer (transaction pooling)
#     • Installed pgbouncer 1.25 on the VPS.
#     • Configured for pool_mode=transaction, default_pool_size=25,
#       max_client_conn=500, scram-sha-256 auth using the existing
#       gifteeng password hash from pg_authid.
#     • DATABASE_URL in /srv/gifteeng/.env repointed to 127.0.0.1:6432
#       with `?pgbouncer=true&connection_limit=50` so Prisma disables
#       prepared statements (incompatible with transaction pooling).
#
#   PHASE 5 — API clustering (Node cluster module)
#     • main.ts forks WEB_CONCURRENCY workers on the same port via the
#       cluster module. Each worker has its own Prisma client + Redis
#       client; pgbouncer multiplexes their queries onto a small real
#       backend pool. Singleton crons (AI targeting sweep) gated to
#       cluster.worker.id === 1 so they don't fire N times per cycle.
#     • This deploy sets WEB_CONCURRENCY=2 in /srv/gifteeng/.env. Bump
#       to match CPU count once we confirm no regressions.
#
#   PHASE 6 — Catalog ISR (already in place)
#     • Audited; revalidate set on every server page (60-3600s).
#       /b2c products + collections list pages are client-rendered for
#       filter UX; their performance now relies on the Phase-3 Redis
#       cache.
#
#   PHASE 7 — k6 baseline load-test
#     • New loadtest/k6-baseline.js + README. Run from a workstation:
#         k6 run --env BASE=https://new-api.gifteeng.com loadtest/k6-baseline.js
#       with thresholds at p95<800ms, p99<2s, error<1%.
#
#   FLUTTER — coupon / scratch-card support (mobile v1.0.0+4013)
#     • New cart_winnings.dart widget mirrors web's CartWinnings panel.
#     • Hits /rewards/active, /rewards/apply, /rewards/compute.
#     • _OrderSummary now shows the discount breakdown + struck-through
#       pre-discount total when rewards are applied.
#     • realtime_sync.dart invalidates rewardsProvider on cart + goins
#       SSE events so a phone-side reward unlock surfaces instantly.
#
# Build is shipped as patch_session69.tar.gz via scp; this script then
# tars-out, runs both pnpm builds, and restarts api+web.
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

# Set WEB_CONCURRENCY in .env if not already present. Idempotent.
if ! grep -q '^WEB_CONCURRENCY=' /srv/gifteeng/.env; then
  echo 'WEB_CONCURRENCY=2' >> /srv/gifteeng/.env
  echo "==> set WEB_CONCURRENCY=2 in .env"
fi

# Set REDIS_URL if not present (defaults to localhost:6379).
if ! grep -q '^REDIS_URL=' /srv/gifteeng/.env; then
  echo 'REDIS_URL=redis://127.0.0.1:6379' >> /srv/gifteeng/.env
  echo "==> set REDIS_URL=redis://127.0.0.1:6379 in .env"
fi

tar xzf /tmp/patch_session69.tar.gz

# pnpm install — ioredis was added to apps/api package.json this session
pnpm install --frozen-lockfile=false 2>&1 | tail -5

pnpm --filter @gifteeng/api build
pnpm --filter @gifteeng/web build

systemctl restart gifteeng-api
sleep 4
for i in 1 2 3 4 5 6; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "  api /health ok"
    break
  fi
  echo "  ... api not ready (attempt $i/6)"
  sleep 2
done

systemctl restart gifteeng-web
sleep 3
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/

echo "---  Sanity: redis + pgbouncer  ---"
redis-cli ping
PGPASSWORD=$(grep '^DATABASE_URL=' /srv/gifteeng/.env | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|') \
  psql -h 127.0.0.1 -p 6432 -U gifteeng -d gifteeng -c "SELECT 1 AS pgbouncer_ok;" 2>&1 | tail -3

echo "DEPLOY_OK session69"
