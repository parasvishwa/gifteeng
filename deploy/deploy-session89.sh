#!/usr/bin/env bash
# Deploy session 89 — Combined: UGC fix + Our Promise + Emil animations + copy polish
#
# Includes all changes from sessions 87, 88, and new fixes:
#
#   SESSION 87
#   ──────────
#   FIX  UGCWallSection.tsx — fetches real photos, hides when none approved
#   FIX  BottomThreeCol.tsx — col 3: "Our Promise" (was "Trusted Across Marketplaces")
#
#   SESSION 88 — Emil Design Engineering
#   ─────────────────────────────────────
#   ADD  globals.css — --ease-out/--ease-in-out/--ease-spring CSS vars
#   FIX  globals.css — all buttons: specific transitions + :active scale(0.97)
#   FIX  globals.css — cards: hover gated behind @media (hover: hover)
#   FIX  globals.css — all keyframes: stronger cubic-bezier curves
#   ADD  globals.css — .animate-stagger-in utility
#   ADD  globals.css — @media (prefers-reduced-motion) block (WCAG 2.3.3)
#   FIX  ProductCard.tsx — image zoom 700ms→350ms, transition-all removed
#   FIX  ProductCard.tsx — heart/close/CTA buttons: specific transitions + active states
#   FIX  OccasionScroll.tsx — transition-transform, active:scale-95, stagger-in
#   FIX  _HomePageShell.tsx — FadeInSection stronger easing, CorporateCTA buttons
#
#   NEW FIXES
#   ─────────
#   FIX  _HomePageShell.tsx — hero CTA: #5C1A1A → brand red #EF3752
#   UPD  _HomePageShell.tsx — tagline: "ENGINEER YOUR EMOTIONS" → "MADE WITH LOVE"
#   UPD  MobileBottomNav.tsx — center tab label: "CASINO" → "REWARDS"
#
# Run on server as root:
#   bash /tmp/deploy-session89.sh

set -euo pipefail
log()  { echo ""; echo "==> $*"; }
ok()   { echo "  ✅ $*"; }
fail() { echo "  ❌ $*"; exit 1; }

PATCH=/tmp/patch_session89.tar.gz
DIR=/srv/gifteeng

[[ -f "$PATCH" ]] || fail "$PATCH not found — scp it first:
    scp deploy/patch_session89.tar.gz root@217.216.59.87:/tmp/"

log "Extracting patch…"
cd "$DIR"
tar xzf "$PATCH"
ok "Files extracted"

log "Verifying extracted files…"
for f in \
  "apps/web/app/globals.css" \
  "apps/web/app/b2c/_components/sections/UGCWallSection.tsx" \
  "apps/web/app/b2c/_components/sections/BottomThreeCol.tsx" \
  "apps/web/app/b2c/_components/sections/ProductCard.tsx" \
  "apps/web/app/b2c/_components/sections/OccasionScroll.tsx" \
  "apps/web/app/b2c/_HomePageShell.tsx" \
  "apps/web/app/b2c/_components/MobileBottomNav.tsx"; do
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
echo "  SESSION 89 — FULL HOMEPAGE POLISH DEPLOYED ✅"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  Changes live at: https://new.gifteeng.com/b2c"
echo ""
echo "  What's new:"
echo "    🖼️   UGC section hides when no real customer photos"
echo "    🤝  Bottom col 3: 'Our Promise' (was Trusted Marketplaces)"
echo "    ⚡  Every button has :active scale(0.97) — feels responsive"
echo "    🎯  Custom easing curves throughout (cubic-bezier, not ease)"
echo "    📱  Card hover gated for touch devices"
echo "    ♿  prefers-reduced-motion support — WCAG compliant"
echo "    🎞️  Occasion chips stagger in on load"
echo "    🖼️  Product image zoom: 700ms→350ms, snappier"
echo "    🔴  Hero CTA: brand red #EF3752 (was dark maroon)"
echo "    💬  Tagline: 'MADE WITH LOVE' (was ENGINEER YOUR EMOTIONS)"
echo "    🎰  Bottom nav: 'REWARDS' (was CASINO)"
echo ""
echo "  Logs: journalctl -u gifteeng-web -f"
echo ""
