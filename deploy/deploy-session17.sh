#!/usr/bin/env bash
# Deploy session 17 — Cart customization preview fix
#
# Root cause:
#   normaliseUrl() in customize page only stripped localhost — not 217.216.59.87.
#   So composePreview() tried to load http://217.216.59.87/uploads/... with
#   crossOrigin="anonymous". Server has no CORS headers on /uploads/ static files
#   → canvas tainted → toDataURL() throws → returns "" → stored as ""
#   → cart image check (if preview) treats "" as falsy → shows default product image.
#
# Fixes:
#   S17-1  apps/web/app/b2c/customize/[slug]/page.tsx
#          - normaliseUrl() now strips all internal hosts (217.216.59.87, localhost,
#            127.0.0.1) to relative paths → same-origin → no CORS issues in canvas
#          - onSave: previewDataUrl uses || null (not ?? null) so "" is also caught
#
#   S17-2  apps/web/app/b2c/cart/page.tsx
#          - preview check uses || null as safety net against stored ""
#
# Run on server as root:
#   bash /tmp/deploy-session17.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session17.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "❌  $PATCH not found — scp it first:"
  echo "    scp deploy/patch_session17.tar.gz root@217.216.59.87:/tmp/"
  exit 1
fi

log "Extracting patch…"
cd "$DIR"
tar xzf "$PATCH"
echo "✅  Files extracted"

log "Building @gifteeng/web (~2–3 min)…"
pnpm --filter=@gifteeng/web build 2>&1 | tail -25

log "Fixing .next/ ownership…"
chown -R gifteeng:gifteeng "$DIR/apps/web/.next"
echo "  ✅ .next/ owned by gifteeng"

log "Restarting web service…"
systemctl restart gifteeng-web
sleep 5

log "Health checks…"
for i in 1 2 3 4 5; do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
    echo "  ✅ web ok"
    break
  fi
  echo "  ... web not ready (attempt $i/5)"; sleep 4
done

echo ""
echo "=========================================="
echo "  SESSION 17 DEPLOY COMPLETE"
echo "=========================================="
echo "  Web: https://new.gifteeng.com"
echo ""
echo "  What changed:"
echo "    - Customizer: base image now loads same-origin (CORS fix)"
echo "    - Cart: user-generated preview will now show correctly"
echo ""
