#!/usr/bin/env bash
# session76 — search quality + cart-abandonment nudge
#
# Two upgrades layered on the back of session75:
#
#   1. Product search — pg_trgm trigram-similarity ranked.
#      • Migration 20260430_add_search_indexes enables the pg_trgm
#        extension and creates GIN trigram indexes on products.title,
#        products.description, and products.sku.
#      • Sets pg_trgm.similarity_threshold = 0.2 on the gifteeng
#        database so "hammre" still surfaces "hammer" (sim ≈ 0.27)
#        instead of being filtered out at the default 0.3.
#      • ProductsService.listB2cUncached now branches: when q.search
#        is non-empty it calls the new searchB2cByTrigram, which runs
#        a single CTE that scores each row as
#          3.0 × similarity(title)  +
#          1.0 × similarity(description) +
#          2.0 × similarity(sku)
#        ORDERs by that rank, applies category/collection/tag filters
#        as AND conditions inside the CTE, and returns IDs + a single
#        total. Items hydrate via the existing Prisma `select` so the
#        response shape stays card-sized.
#      • No-search browse path is unchanged — we only re-route when
#        search is set, so we don't risk regressing the catalog list.
#
#   2. Cart abandonment nudge — new deterministic 10-min cron in
#      AiTargetingService.
#      • Pulls non-empty customer carts whose `updatedAt` falls in the
#        30-min … 12-hr window. Excludes customers who placed an order
#        since their last cart activity. 24-hour anti-spam memory
#        keyed separately from the AI intent nudge so a customer can
#        receive one of each per day at most.
#      • Sends a push notification with the cart subtotal + item count
#        ("Hey Paras, your cart is waiting 🛒 — 3 items worth ₹1,247
#        finish checkout in 2 taps."). Skips SMS — that's still the
#        AI intent sweep's job when it picks nudge_whatsapp.
#      • Cluster-aware: only worker.id === 1 schedules the cron, same
#        guard as the AI intent sweep, so multi-worker deployments
#        don't fire N nudges per cycle.
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

tar xzf /tmp/patch_session76.tar.gz

echo "==> applying Prisma migrations..."
(cd packages/db && pnpm prisma migrate deploy 2>&1 | tail -10) || \
  echo "WARN: migrate deploy returned non-zero, proceeding"

echo "==> regenerating Prisma client..."
(cd packages/db && pnpm prisma generate 2>&1 | tail -3)

pnpm --filter @gifteeng/api build 2>&1 | tail -5

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

echo "DEPLOY_OK session76"
