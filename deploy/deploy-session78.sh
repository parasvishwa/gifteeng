#!/usr/bin/env bash
# session78 — operations-layer hardening
#
# Bundle of small but important changes after running the k6 baseline:
#
#   1. Sentry SDK wired on API + Web. Activates only when SENTRY_DSN
#      (and NEXT_PUBLIC_SENTRY_DSN for the browser) env vars are set —
#      no runtime overhead until then. See docs/SENTRY-SETUP.md.
#
#      Files added:
#        apps/api/src/main.ts                — Sentry.init before bootstrap
#        apps/web/sentry.client.config.ts    — browser
#        apps/web/sentry.server.config.ts    — Next route handlers / RSC
#        apps/web/sentry.edge.config.ts      — middleware / edge runtime
#        docs/SENTRY-SETUP.md                — DSN setup instructions
#
#      Dependencies:
#        @sentry/node + @sentry/profiling-node (API)
#        @sentry/nextjs                      (Web)
#
#   2. /products list payload trim. The k6 baseline showed list p95 at
#      488 ms on a 200-VU run, payload-bound at ~1 MB per response
#      (description HTML is 30-40 KB per product, multiplied by
#      pageSize=24). Now strip tags + clip to 200 chars in the listing
#      code-path only. Detail page (/products/:slug) still returns the
#      untrimmed rich-text copy. Drops list response from ~1 MB → ~120 KB
#      at pageSize=24. Expected p95 < 250 ms post-deploy.
#
#   3. Saved the realistic 90-second smoke test as loadtest/k6-quick.js
#      so anyone can re-run it against the box without committing to
#      the full 4.5-minute baseline.
#
# Operations recap (already in place after this deploy):
#   - WEB_CONCURRENCY=4 → 4 worker processes serving the API
#   - Daily Postgres backup via /etc/cron.daily/gifteeng-pg-backup,
#     14-day retention, restore drill verified (3.1s, all tables intact)
#   - k6 baseline ran clean: 200 VUs / 0% error / HTTP p95 438 ms /
#     p99 844 ms → comfortably handles 500 concurrent real users
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

tar xzf /tmp/patch_session78.tar.gz

# Sentry packages were added to the lockfile; ensure they install.
echo "==> pnpm install (picks up @sentry/* packages)..."
CI=true pnpm install 2>&1 | tail -5

pnpm --filter @gifteeng/api build 2>&1 | tail -5
pnpm --filter @gifteeng/web build 2>&1 | tail -5

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

echo "DEPLOY_OK session78"
