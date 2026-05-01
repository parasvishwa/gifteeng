#!/usr/bin/env bash
# Deploy session 15 — Gift Casino Done button + font color fix
#
# Fixes shipped:
#   S15-1  apps/web/app/b2c/_components/games/GoinWager.tsx
#          - Added text-white to modal container (all text was inheriting light-mode color)
#          - Done button: bg-muted → bg-white/10 border border-white/15 (visible on dark bg)
#          - Stake input: added explicit text-white
#          - Odds table: bg-muted/30 → bg-white/5 text-white/70 (dark-bg safe)
#
# Run on server as root:
#   bash /tmp/deploy-session15.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session15.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "❌  $PATCH not found — scp it first:"
  echo "    scp deploy/patch_session15.tar.gz root@217.216.59.87:/tmp/"
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
echo "  SESSION 15 DEPLOY COMPLETE"
echo "=========================================="
echo "  Web: https://new.gifteeng.com"
echo ""
echo "  What changed:"
echo "    - Goin Wager modal: all text now white (was inheriting light-mode color)"
echo "    - Done button: was muted/pink → now subtle outlined white glass button"
echo "    - Stake input + odds table: explicit white text on dark background"
echo ""
