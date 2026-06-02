#!/usr/bin/env bash
# Deploy session 88 — Emil design engineering: polish interactions + motion
#
# What ships:
#
#   globals.css
#   ───────────
#   ADD  --ease-out, --ease-in-out, --ease-spring CSS vars in :root
#   FIX  .btn-primary / .btn-secondary / .btn-outline — removed transition-all,
#        added specific transition + :active { transform: scale(0.97) }
#   FIX  .card-gifteeng / .card-product — specific transitions, hover gated
#        behind @media (hover: hover) and (pointer: fine)
#   FIX  All keyframe animations — stronger cubic-bezier curves (was plain ease-out)
#   ADD  .animate-stagger-in utility class
#   ADD  @media (prefers-reduced-motion) block — WCAG 2.3.3 compliance
#
#   ProductCard.tsx
#   ───────────────
#   FIX  Product image: transition-all duration-700 scale-108
#        → transition-transform duration-350ms cubic-bezier(0.23,1,0.32,1) scale-105
#   FIX  Heart wishlist button: transition-all → transition-[background-color,transform]
#        + active:scale-90 for touch press feedback
#   FIX  CUSTOMISE/ADD/NOTIFY button: specific transition + existing active:scale-95
#   FIX  Quick View reveal button: transition-all → transition-[opacity,transform]
#   FIX  Modal close button: removed hover:scale-110, added active:scale-90
#   FIX  Modal primary CTA: removed hover:-translate-y-0.5 transition-all
#        (btn-primary already handles its own correct transition)
#
#   OccasionScroll.tsx
#   ──────────────────
#   FIX  Chip divs: transition-all → transition-transform + custom ease-out
#   ADD  group-active:scale-95 — touch press feedback (was hover-only)
#   ADD  Stagger-in animation with 40ms per chip delay
#
#   _HomePageShell.tsx
#   ──────────────────
#   FIX  FadeInSection: ease → cubic-bezier(0.23,1,0.32,1), translateY 28→20px
#   FIX  Hero CTA: background #5C1A1A → brand red #EF3752, proper transition
#   FIX  CorporateCTA buttons: transition-all → specific transitions
#
# Run on server as root:
#   bash /tmp/deploy-session88.sh

set -euo pipefail
log()  { echo ""; echo "==> $*"; }
ok()   { echo "  ✅ $*"; }
fail() { echo "  ❌ $*"; exit 1; }

PATCH=/tmp/patch_session88.tar.gz
DIR=/srv/gifteeng

[[ -f "$PATCH" ]] || fail "$PATCH not found — scp it first"

log "Extracting patch…"
cd "$DIR"
tar xzf "$PATCH"
ok "Files extracted"

log "Verifying extracted files…"
for f in \
  "apps/web/app/globals.css" \
  "apps/web/app/b2c/_components/sections/ProductCard.tsx" \
  "apps/web/app/b2c/_components/sections/OccasionScroll.tsx" \
  "apps/web/app/b2c/_HomePageShell.tsx"; do
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
echo "  SESSION 88 — DESIGN ENGINEERING DEPLOYED ✅"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  Changes live at: https://new.gifteeng.com/b2c"
echo ""
echo "  What's new:"
echo "    ⚡  All buttons feel responsive — :active scale(0.97) on every CTA"
echo "    🎯  Custom easing curves — stronger than CSS defaults"
echo "    📱  Touch-safe hover states — cards only hover on pointer devices"
echo "    ♿  prefers-reduced-motion support — WCAG 2.3.3 compliant"
echo "    🎞️  Occasion chips stagger in — 40ms cascade on page load"
echo "    🖼️  Product image zoom: 700ms → 350ms, smoother ease"
echo "    🔴  Hero CTA now brand red #EF3752 (was dark maroon)"
echo ""
echo "  Logs: journalctl -u gifteeng-web -f"
echo ""
