#!/usr/bin/env bash
# session67 — Customised-product cross-device sync fix
#
# Bug 1 (Web → Phone): adding a personalised product on web wasn't visible
#   on the phone. Root cause: web was POSTing the FULL customization
#   payload — including `previewDataUrl`, a 2-5 MB base64 PNG of the
#   render. One stale row in the prod DB was 4.7 MB. /cart fetches over
#   mobile networks could blow past dio's buffers / decode time and
#   appear to "not arrive". Server now stores ONLY the structural data
#   (canvasJSON / zone defs / fills) — the preview thumbnail stays in
#   the web's localStorage zustand store across reloads.
#
# Bug 2 (Phone → Web shows item but no image): phone's customizer never
#   sent a previewDataUrl, and the web cart UI fell back to `item.image`
#   which was empty for items first observed via SSE reconcile. The
#   reconcile now derives `image` from the server-included
#   `product.images[0].url` (already done in session66), AND preserves
#   the LOCAL customization (with previewDataUrl) for any line we
#   already had — matched by server `id` first, then by
#   productId+variantOptions — so the local preview thumbnail isn't
#   wiped by the SSE-triggered reconcile right after the optimistic add.
#
# Web (apps/web/lib/stores/cart.ts):
#   • stripPreviewForServer() removes top-level + designs[].previewDataUrl
#     before POSTing customization to /cart/items. Saves bandwidth + DB.
#   • addItem() now captures the server-assigned `id` from the POST
#     response and patches it onto the optimistic local row, so the
#     next reconcile-by-id finds the same line and keeps its preview.
#   • reconcileFromServer() matches by id first, then by
#     productId+variantOptions. For matched rows whose local
#     customization carries a previewDataUrl, the local customization
#     is preserved verbatim (server's stripped copy doesn't have it).
#
# Database cleanup (one-time, idempotent): purge previewDataUrl from
# existing cart_items.customization rows so /cart fetches stop ferrying
# multi-megabyte payloads to phones. Done via a single UPDATE that
# strips both top-level and designs[].previewDataUrl using jsonb path ops.
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

# ── DB cleanup ────────────────────────────────────────────────────────────
echo "==> purging legacy previewDataUrl from cart_items.customization..."
sudo -u postgres psql -d gifteeng -c "
  UPDATE cart_items
     SET customization =
           (customization #- '{previewDataUrl}')
     WHERE customization ? 'previewDataUrl';

  -- strip designs[i].previewDataUrl entries one item at a time (jsonb_set
  -- doesn't have a native 'strip from each array element' op, so we use
  -- a CTE that rebuilds designs without those keys).
  UPDATE cart_items ci
     SET customization = jsonb_set(
           ci.customization, '{designs}',
           COALESCE(
             (SELECT jsonb_agg(d - 'previewDataUrl')
                FROM jsonb_array_elements(ci.customization->'designs') d),
             '[]'::jsonb))
     WHERE jsonb_typeof(ci.customization->'designs') = 'array'
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(ci.customization->'designs') dd
         WHERE dd ? 'previewDataUrl');
"

# ── Web build + restart ───────────────────────────────────────────────────
tar xzf /tmp/patch_session67.tar.gz
pnpm --filter @gifteeng/web build
systemctl restart gifteeng-web
sleep 3
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/
echo "DEPLOY_OK session67"
