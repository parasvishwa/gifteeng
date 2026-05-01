#!/usr/bin/env bash
# session68 — Customised cart fix (round 2)
#
# What user reported:
#   • Added a personalised product on web with 2 designs + 4 images.
#   • Web cart shows it briefly, BUT it disappears the moment they
#     refresh or remove any other cart item — and the phone's cart
#     never receives it at all.
#
# Root cause (confirmed in /var/log/gifteeng/api.err.log):
#   PayloadTooLargeError: request entity too large
#   at body-parser jsonParser …
#   The customizer embeds user-uploaded images as base64 inside the
#   Fabric canvasJSON. With 2 designs × 4 images, the POST exceeded
#   the 50 MB express body-parser limit. The fetch in cart.ts caught
#   the error and console.warned it, so the user only saw the
#   optimistic local row — which then vanished on the next reconcile
#   (the server didn't have it).
#
# Fixes:
#   1. api/main.ts — bump express json + urlencoded limit to 200mb
#      so 2-4 design canvases with embedded images can be saved.
#   2. nginx vhost — bump client_max_body_size to 250m so nginx
#      doesn't 413 before the body even reaches Nest.
#   3. web cart store — three changes that prevent the silent-
#      data-loss UX even when a future POST does fail:
#        a) addItem now generates a `_pending` tag for every
#           optimistic row. After the POST returns, the row is
#           found by tag (immune to array-index shifts caused by
#           a racing reconcile) and stamped with the server id.
#        b) On POST failure addItem ROLLS BACK the optimistic row
#           and rethrows so the customizer page can show a clear
#           error ("Your design is too large to save. Try fewer
#           or smaller images.") instead of silently losing it.
#        c) reconcileFromServer preserves any rows whose
#           `_pending` is set, so a concurrent SSE invalidate
#           doesn't wipe in-flight optimistic rows. The match key
#           also distinguishes customised vs non-customised so a
#           customised local row can no longer be cross-matched
#           onto a non-customised server row.
#   4. customize page — surfaces the addItem error to the user.
#
# This unblocks today's customised carts. Long-term the customizer
# should upload user images to /api/files first and reference them
# by URL in canvasJSON — that fix is queued separately.
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

# ── nginx body limit bump ─────────────────────────────────────────────────
# Live vhost is at /etc/nginx/sites-enabled/gifteeng.conf. Bump every
# client_max_body_size directive in it from 100m → 250m. Idempotent.
echo "==> bumping nginx client_max_body_size to 250m..."
sed -i 's/client_max_body_size [0-9]\+m;/client_max_body_size 250m;/g' \
  /etc/nginx/sites-enabled/gifteeng.conf
nginx -t
systemctl reload nginx
echo "  nginx reloaded"

# ── API + web build & restart ─────────────────────────────────────────────
tar xzf /tmp/patch_session68.tar.gz
pnpm --filter @gifteeng/api build
pnpm --filter @gifteeng/web build
systemctl restart gifteeng-api
sleep 4
for i in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "  api /health ok"
    break
  fi
  echo "  ... api not ready yet (attempt $i/5)"
  sleep 2
done
systemctl restart gifteeng-web
sleep 3
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/
echo "DEPLOY_OK session68"
