#!/usr/bin/env bash
# Deploy session 94 — Product detail screen: layout polish + micro-interactions
#
#   FIX  apps/mobile/lib/features/shop/presentation/screens/product_detail_screen.dart
#
#   No functional changes — layout, visual hierarchy, and interaction polish only.
#
# ── Changes ───────────────────────────────────────────────────────────────────
#
#   FAQ section (_FaqSection / _FaqSectionState)
#     BEFORE  One heavy rounded card per FAQ item (N cards stacked).
#             Each AI-generated question repeats the full product title —
#             3-4 identical heavy cards dominated the lower half of the page.
#     AFTER   All FAQ items unified in ONE shared container (bg1, border,
#             radius 12). Items separated by 1px hairline Dividers.
#             Per-item AnimatedContainer (bg tint + border color change) removed
#             — open state indicated by brand-color question text only.
#             Answer stays as AnimatedCrossFade (same logic, tighter padding).
#             chevron AnimatedRotation (200ms easeOut) unchanged.
#             Empty items (q or a missing) pre-filtered before render.
#
#   Trust row (_TrustRow)
#     BEFORE  Horizontal Row(Icon 13px, Gap, Text 9px) per item — crammed,
#             reads like a receipt footer strip.
#     AFTER   Vertical Column(Icon 18px, Gap 5, Text 10px) per item.
#             Outer container vertical padding 10 → 14 for breathing room.
#             Item horizontal padding 4 → 8.
#             Right-side hairline dividers (0.5px) between items unchanged.
#
#   Quantity buttons (_QtyBtn)
#     BEFORE  StatelessWidget — no visual press feedback.
#     AFTER   StatefulWidget (_QtyBtnState) with _pressing bool.
#             AnimatedScale(scale: 0.82 on press, 100ms easeOut).
#             onTapDown / onTapUp / onTapCancel manage _pressing state.
#             Haptic + callback logic unchanged.
#
#   Sticky CTA (_StickyBottomBar)
#     BEFORE  StatelessWidget — no active scale on Add to Cart or Customise.
#     AFTER   StatefulWidget (_StickyBottomBarState) with _pressingCart
#             and _pressingCustomize bools.
#             AnimatedScale(scale: 0.97 on press, 120ms easeOut) wraps each button.
#             Scale guard: disabled when addingToCart or cartSuccess is true.
#             AnimatedContainer (color: brand → emerald) + Lottie checkmark unchanged.
#
# Build & distribute:
#   Android:  flutter build appbundle --release
#             Upload to Play Store (Internal Test → Production)
#   iOS:      flutter build ipa --release
#             Upload via Xcode / Transporter → TestFlight → App Store
#
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
log()  { echo ""; echo "==> $*"; }
ok()   { echo "  ✅ $*"; }
fail() { echo "  ❌ $*"; exit 1; }

PATCH=/tmp/patch_session94.tar.gz

log "Checking patch…"
[[ -f "$PATCH" ]] || fail "$PATCH not found — scp it first:
    scp deploy/patch_session94.tar.gz root@217.216.59.87:/tmp/"

log "This is a Flutter mobile patch — build on dev machine, not the server."
echo ""
echo "  1. Extract:"
echo "     tar xzf $PATCH"
echo ""
echo "  2. Build:"
echo "     cd apps/mobile && flutter pub get"
echo "     flutter build appbundle --release   # Android"
echo "     flutter build ipa --release          # iOS"
echo ""
echo "  3. Distribute:"
echo "     Android: upload build/app/outputs/bundle/release/app-release.aab"
echo "     iOS:     open build/ios/archive/Runner.xcarchive → Distribute App"

echo ""
echo "════════════════════════════════════════════════════════"
echo "  SESSION 94 — PRODUCT DETAIL: LAYOUT POLISH"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  Changes (layout + micro-interactions only, no functional changes):"
echo "    📋  FAQ: N separate cards → 1 unified container, hairline dividers"
echo "    🏅  Trust row: horizontal cramped → vertical icon+label (18px icons)"
echo "    ➕  Qty ±  buttons: press scale feedback (0.82, 100ms easeOut)"
echo "    🛒  Add to Cart CTA: active scale (0.97, 120ms easeOut)"
echo "    ✨  Customise & Add: active scale (0.97, 120ms easeOut)"
echo ""
echo "  Goal: every piece of buying information is scannable and every"
echo "        interactive element confirms it heard the tap."
echo ""
