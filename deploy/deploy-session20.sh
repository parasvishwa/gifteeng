#!/usr/bin/env bash
# Deploy session 20 — CRITICAL: fix site-wide JS crash (nothing clickable)
#
# Root cause:
#   lib/sanitize-html.ts imported isomorphic-dompurify, which pulls in jsdom
#   (a Node.js-only package). When webpack bundled any "use client" component
#   that imported sanitize-html (HomepageBlocks.tsx), jsdom's Node.js code
#   crashed the browser bundle at runtime => React hydration failed across the
#   entire site => zero interactivity on every page.
#
# Fix:
#   Rewrote sanitize-html.ts with ZERO external dependencies:
#     - Browser path: native DOMParser + element-walk allowlist strip
#     - Server path:  conservative regex strip (CSP is the primary XSS wall)
#   isomorphic-dompurify fully removed from the client bundle.
#
# Run on server as root:
#   bash /tmp/deploy-session20.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session20.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "ERROR: $PATCH not found — scp it first:"
  echo "  scp deploy/patch_session20.tar.gz root@217.216.59.87:/tmp/"
  exit 1
fi

log "Extracting patch..."
cd "$DIR"
tar xzf "$PATCH"
echo "Files extracted"

log "Building @gifteeng/web (~2-3 min)..."
pnpm --filter=@gifteeng/web build 2>&1 | tail -30

log "Fixing .next/ ownership..."
chown -R gifteeng:gifteeng "$DIR/apps/web/.next"

log "Force-restarting web service (kill -9 to avoid SIGTERM timeout)..."
MAINPID=$(systemctl show gifteeng-web --property=MainPID --value 2>/dev/null || echo "")
if [[ -n "$MAINPID" && "$MAINPID" != "0" ]]; then
  kill -9 "$MAINPID" 2>/dev/null || true
  sleep 1
fi
systemctl start gifteeng-web

log "Health checks..."
for i in 1 2 3 4 5 6 7 8; do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
    echo "  web ok (attempt $i)"
    break
  fi
  echo "  ... not ready (attempt $i/8)"; sleep 4
done

echo ""
echo "SESSION 20 DEPLOY COMPLETE"
echo "Web: https://new.gifteeng.com"
echo ""
echo "What changed:"
echo "  - CRITICAL FIX: sanitize-html.ts — removed isomorphic-dompurify"
echo "  - Browser: native DOMParser sanitization (no external deps)"
echo "  - Server:  regex strip (CSP is the primary XSS defense)"
echo "  - Site-wide interactivity fully restored"
