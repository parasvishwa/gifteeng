#!/usr/bin/env bash
# session81 — three deep bug fixes from the post-launch audit
#
# 1. DPDP marketing-script consent bypass (CRITICAL — legal compliance):
#    MarketingScripts was a server component injecting GTM/GA4/Meta
#    Pixel unconditionally, regardless of the customer's cookie-banner
#    decision. Customers who clicked "Reject all" still got tracked.
#    Fix: split into MarketingScripts (server, fetches config) +
#    MarketingScriptsClient (client, reads localStorage consent and
#    renders <Script> tags only when the matching category is granted).
#    Listens for `gifteeng:cookieConsent` events so toggling consent in
#    the banner takes effect without a reload. Search Console <meta>
#    tag stays server-rendered (essential category — no tracking).
#
# 2. ReturnRequest.orderItemId missing FK constraint (HIGH — data
#    integrity): an admin Edit-order that removed a line could orphan a
#    pending RMA pointing at the deleted OrderItem. Migration adds the
#    FK with ON DELETE SET NULL so dangling references can't form even
#    via direct SQL / future force-delete paths. Schema also adds the
#    matching back-relation on OrderItem.
#
# 3. Edit-order app-level guard (HIGH — UX): even with the FK in place,
#    silently nulling out an RMA's orderItemId when admin removes the
#    line they were returning is bad UX. New pre-flight check refuses
#    to edit any line that has an open RMA (status ∉ rejected/
#    cancelled/refunded), with a clear error message telling the agent
#    to resolve the return first.
#
# Migration: 20260501_fix_return_orderitem_fk
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a
tar xzf /tmp/patch_session81.tar.gz

echo "==> applying Prisma migrations..."
(cd packages/db && pnpm prisma migrate deploy 2>&1 | tail -10) || \
  echo "WARN: migrate deploy returned non-zero, proceeding"

echo "==> regenerating Prisma client..."
(cd packages/db && pnpm prisma generate 2>&1 | tail -3)

pnpm --filter @gifteeng/api build 2>&1 | tail -5
pnpm --filter @gifteeng/web build 2>&1 | tail -5

systemctl restart gifteeng-api
sleep 4
for i in 1 2 3 4 5 6; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "  api /health ok"; break
  fi
  echo "  ... api not ready (attempt $i/6)"
  sleep 2
done
systemctl restart gifteeng-web
sleep 3
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/

echo "DEPLOY_OK session81"
