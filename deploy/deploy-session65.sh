#!/usr/bin/env bash
# session65 — Variant thumbnail + presence replay + realtime debug logs
#
# Backend:
#   • cart.service.getOrCreate now also includes `product.variantOptions`
#     so the cart UI can swap thumbnails to the variant-specific image.
#   • PageViewsService presence tracking refactored — replaced the
#     never-evicted `announcedSessions` Set with a `presence` Map of
#     PresenceSnap rows (path / lastSeen / device / customer label).
#       - Refresh on every track keeps lastSeen current
#       - First track per session emits the publishGlobal("presence")
#       - Stale eviction at 3 min matches the LivePresenceStrip TTL
#   • RealtimeService.attachGlobal now replays the current presence
#     snapshot on every new SSE connect so a freshly-opened admin tab
#     sees every active visitor immediately, not after the next
#     page-view event from each device.
#   • Diagnostic logs on RealtimeService.publish + attach/close streams
#     so `journalctl -u gifteeng-api -f` shows real-time SSE activity.
#
# Mobile (v1.0.0+4011):
#   • Cart screen renders the per-variant image when the customer picked
#     a design — was always showing the parent's first image regardless
#     of variant. Falls back to the parent image when no variant matches.
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a
tar xzf /tmp/patch_session65.tar.gz
pnpm --filter @gifteeng/api build
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

# Quick sanity: open SSE for 1.5s and confirm we see at least the ready event.
echo "--- public SSE smoke test ---"
curl -fsS --max-time 1.5 http://127.0.0.1:4000/api/public/events | head -c 200 || true
echo
echo "DEPLOY_OK session65"
