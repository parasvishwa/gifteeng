#!/usr/bin/env bash
# Deploy session 86 — Homepage redesign: contrast fix, D2C stats, section reorder
#
# What ships:
#
#   HOMEPAGE (apps/web/app/b2c/)
#   ─────────────────────────────
#   FIX  globals.css — theme color contrast overhaul
#        --card: light pink (#FFF1F4) → pure white
#        --muted: pink wash → neutral gray (220 14% 96%)
#        --border/--input: pink-tinted → neutral gray
#        Eliminates pink-on-pink contrast issue across all cards/inputs
#
#   FIX  CompactStatsBar.tsx — removed Amazon/Flipkart/Meesho branding
#        New D2C stats: 3,00,000+ Happy Customers · 4.5★ Avg Rating ·
#        24 Hrs Dispatch · 5,000+ 5-Star Reviews · 500+ Gift Designs
#
#   UPD  _HomePageShell.tsx — section order + dedup
#        New order: Hero → Trust strip (moved up) → Shop By Occasion →
#        CompactStatsBar → PickedForYou → Promotions → HomepageBlocks →
#        Reels → CorporateCTA → HowItWorks → Coins → UGC → BottomThreeCol
#        Removed duplicate trust icons inside hero (trust strip below covers it)
#        HowItWorks / BottomThreeCol / TrustQuality now always visible
#
#   UPD  ProductCard.tsx — price visual prominence
#        Price font: text-sm → text-base md:text-lg, color → brand red #EF3752
#        Added discount % badge (X% off in green) when original price shown
#
#   FIX  next.config.mjs — SSR build fixes for Windows + production
#        canvas: false webpack alias (stops canvas.node native binary error)
#        serverExternalPackages: isomorphic-dompurify/jsdom/canvas
#        Fixes 500 errors caused by jsdom __dirname path resolution on server
#
# Run on server as root:
#   bash /tmp/deploy-session86.sh

set -euo pipefail
log()  { echo ""; echo "==> $*"; }
ok()   { echo "  ✅ $*"; }
fail() { echo "  ❌ $*"; exit 1; }

PATCH=/tmp/patch_session86.tar.gz
DIR=/srv/gifteeng

[[ -f "$PATCH" ]] || fail "$PATCH not found — scp it first:
    scp deploy/patch_session86.tar.gz root@217.216.59.87:/tmp/"

log "Extracting patch…"
cd "$DIR"
tar xzf "$PATCH"
ok "Files extracted"

log "Verifying extracted files…"
for f in \
  "apps/web/app/globals.css" \
  "apps/web/app/b2c/_components/sections/CompactStatsBar.tsx" \
  "apps/web/app/b2c/_HomePageShell.tsx" \
  "apps/web/app/b2c/_components/sections/ProductCard.tsx" \
  "apps/web/next.config.mjs"; do
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
echo "  SESSION 86 — HOMEPAGE REDESIGN DEPLOYED ✅"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  Changes live at: https://new.gifteeng.com/b2c"
echo ""
echo "  What's new:"
echo "    🎨  White card backgrounds — no more pink-on-pink contrast"
echo "    📊  D2C stats bar — removed Amazon/Flipkart/Meesho branding"
echo "    🗂️   Better section order — trust strip right below hero"
echo "    💰  Bigger red price on product cards + discount % badge"
echo "    🔧  Fixed jsdom SSR 500 errors on server"
echo ""
echo "  Logs: journalctl -u gifteeng-web -f"
echo ""
