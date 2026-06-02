#!/usr/bin/env bash
# Deploy session 87 — Homepage polish: hide UGC placeholders, fix BottomThreeCol header
#
# What ships:
#
#   HOMEPAGE (apps/web/app/b2c/_components/sections/)
#   ────────────────────────────────────────────────
#   FIX  UGCWallSection.tsx — no more placeholder gradients
#        Now fetches real photos from /api/ugc?status=approved
#        Returns null (hidden) when no approved photos are available
#        Shows real customer photo grid when photos exist
#
#   FIX  BottomThreeCol.tsx — col 3 header copy update
#        "Trusted Across Marketplaces ❤️" → "Our Promise ❤️"
#        Icon: 🏅 → 🤝
#        Subtitle: "Find us on your favourite platform" → "Quality you can count on"
#        Matches the new OurPromiseColumn content (replaced marketplace links)
#
# Run on server as root:
#   bash /tmp/deploy-session87.sh

set -euo pipefail
log()  { echo ""; echo "==> $*"; }
ok()   { echo "  ✅ $*"; }
fail() { echo "  ❌ $*"; exit 1; }

PATCH=/tmp/patch_session87.tar.gz
DIR=/srv/gifteeng

[[ -f "$PATCH" ]] || fail "$PATCH not found — scp it first:
    scp deploy/patch_session87.tar.gz root@217.216.59.87:/tmp/"

log "Extracting patch…"
cd "$DIR"
tar xzf "$PATCH"
ok "Files extracted"

log "Verifying extracted files…"
for f in \
  "apps/web/app/b2c/_components/sections/UGCWallSection.tsx" \
  "apps/web/app/b2c/_components/sections/BottomThreeCol.tsx"; do
  [[ -f "$DIR/$f" ]] && ok "$f" || echo "  ⚠️  $f not found after extraction"
done

log "Building @gifteeng/web…"
sudo -u gifteeng -H pnpm --filter @gifteeng/web build

log "Restarting web service…"
systemctl restart gifteeng-web
sleep 4

log "Health check…"
for i in 1 2 3 4 5; do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/b2c 2>&1; then
    ok "web /b2c ok"
    break
  fi
  echo "  ... web not ready yet (attempt $i/5)"
  sleep 3
done

echo ""
echo "════════════════════════════════════════════════════════"
echo "  SESSION 87 — HOMEPAGE POLISH DEPLOYED ✅"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  Changes live at: https://new.gifteeng.com/b2c"
echo ""
echo "  What's new:"
echo "    🖼️   UGC section hidden — no more placeholder gradient cards"
echo "    🤝  BottomThreeCol col 3: 'Our Promise' (was 'Trusted Across Marketplaces')"
echo ""
echo "  Logs: journalctl -u gifteeng-web -f"
echo ""
