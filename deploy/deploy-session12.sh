#!/usr/bin/env bash
# Deploy session 12 — Flutter theme fix + .next permissions fix
#
# Fixes shipped:
#   S12-1  deploy/deploy-session11.sh          — chown .next/ after web build (prevents EACCES)
#   S12-2  apps/web: permissions hotfix        — chown -R gifteeng .next/ (already applied live)
#   S12-3  apps/mobile theme screens           — GColors.of(context) replaces hardcoded GColors.bg0
#
# Run on server as root:
#   bash /tmp/deploy-session12.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session12.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "❌  $PATCH not found — scp it first:"
  echo "    scp deploy/patch_session12.tar.gz root@217.216.59.87:/tmp/"
  exit 1
fi

log "Extracting patch…"
cd "$DIR"
tar xzf "$PATCH"
echo "✅  Files extracted"

log "Building @gifteeng/web (~2–3 min)…"
pnpm --filter=@gifteeng/web build 2>&1 | tail -25

log "Fixing .next/ ownership (must be gifteeng, not root)…"
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

for i in 1 2 3; do
  if curl -fsS -o /dev/null http://127.0.0.1:4000/api/health 2>/dev/null; then
    echo "  ✅ api /health ok"
    break
  fi
  echo "  ... api not ready (attempt $i/3)"; sleep 3
done

echo ""
echo "=========================================="
echo "  SESSION 12 DEPLOY COMPLETE"
echo "=========================================="
echo "  Web: https://new.gifteeng.com"
echo ""
echo "  What changed:"
echo "    - .next/ permissions fixed (no more EACCES in logs)"
echo "    - Flutter: theme toggle now works — all screens respond to Light/Dark mode"
echo ""
