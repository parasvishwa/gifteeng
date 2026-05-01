#!/usr/bin/env bash
# Deploy session 18 — SimpleZoneCustomizer: image rotate + zoom + persist
#
# Fixes shipped:
#   S18-1  packages/ui/src/components/simple-zone-customizer.tsx
#          - Added imageRotations state (persisted in canvasJSON payload)
#          - Edit image sheet: added rotate controls
#              · ↺ and ↻ buttons for quick 90° left/right rotation
#              · Fine-tune slider 0°–359°
#              · "Reset rotation" shortcut when rotated
#              · Live preview reflects both zoom + rotation in real time
#          - Zoom slider extended to 3× (was 2.5×), styled with brand red
#          - Apply button now saves both scale AND rotation
#          - Zone overlay img now applies rotation in CSS transform
#          - composePreview now draws rotation correctly on canvas
#          - imageScales + imageRotations persisted in canvasJSON → restored on cart edit
#
# Run on server as root:
#   bash /tmp/deploy-session18.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session18.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "❌  $PATCH not found — scp it first:"
  echo "    scp deploy/patch_session18.tar.gz root@217.216.59.87:/tmp/"
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
echo "  SESSION 18 DEPLOY COMPLETE"
echo "=========================================="
echo "  Web: https://new.gifteeng.com"
echo ""
echo "  What changed:"
echo "    - Customiser image zones: tap uploaded photo → Edit sheet"
echo "    - Zoom slider (1×–3×) + Rotate (↺/↻ 90° tap + fine slider)"
echo "    - Live preview shows zoom + rotation before applying"
echo "    - Scale + rotation saved in cart and restored on 'Edit design'"
echo ""
