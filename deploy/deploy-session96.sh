#!/usr/bin/env bash
# Deploy session 96 — Cart + Checkout: faster checkout, minimised scroll
#
#   FIX  apps/mobile/lib/features/cart/presentation/screens/cart_screen.dart
#   FIX  apps/mobile/lib/features/cart/presentation/screens/checkout_screen.dart
#
#   Goal: reach "Proceed to Checkout" in the fewest possible scrolls.
#         All flows (gift toggle, pincode-first, OTP) left intact.
#
# ── Cart screen changes ───────────────────────────────────────────────────────
#
#   _PlayBanner  (−34px)
#     BEFORE  Full card: 44×44 logo, 2-line title+sub, arrow icon (~72px tall)
#     AFTER   Slim 38px strip: 🎰 emoji + one-line label + "Play →" link
#
#   _CartItemCard action row  (−item per row)
#     BEFORE  Qty stepper | Delete pill | Save for later (3 items in Wrap)
#     AFTER   Qty stepper | Save for later (Delete pill removed — trash icon
#             on qty=1 stepper already handles removal)
#
#   Gift-wrap hint  (−55px standalone box)
#     BEFORE  Standalone gold Container with 12px padding after Order Summary
#     AFTER   Compact 10.5px footnote line inside _OrderSummary card footer
#
#   "Continue Shopping" button  (−50px)
#     BEFORE  Full-width secondary button (same height as primary CTA)
#     AFTER   Underlined text link "← Continue shopping" centered below CTA
#
#   Trust row  (−66px)
#     BEFORE  Row of 3 expanded cards (emoji + 2-line label + sub, ~100px)
#     AFTER   _TrustStrip: single 38px line (🔒 Secure | 🚚 Fast | 🔄 Returns)
#             separated by 1px hairline dividers
#
#   NEW  _TrustStrip widget
#
#   Gap tuning:  Gap(14) → Gap(10) after PlayBanner
#                Gap(20) → Gap(16) before trust row
#
# ── Checkout screen changes ───────────────────────────────────────────────────
#
#   Step headers (Contact + Delivery)
#     BEFORE  40×40 icon, fontSize:20 title, Gap(22/18) after
#     AFTER   36×36 icon, fontSize:17 title, Gap(16/14) after
#
#   Delivery date disclaimer  (−55px)
#     BEFORE  Full amber Container with border, 12px padding, 3-line text
#     AFTER   Single inline row: ℹ icon + "Preferred date is a request, not a guarantee"
#
#   Add-ons section header
#     BEFORE  34×34 icon, fontSize:16 title, Gap(24) before + Gap(12) after
#     AFTER   30×30 icon, fontSize:14 title, Gap(20) before + Gap(10) after
#
#   Delivery form field gaps  (−3px per field × 5 fields)
#     BEFORE  Gap(14) between each label→input pair and between fields
#     AFTER   Gap(11) between fields, Gap(5) between label and input
#
# ── What was NOT changed ──────────────────────────────────────────────────────
#   - "Buying this as a gift?" toggle and all gift-recipient fields
#   - Pincode-first ordering in the address form
#   - OTP verify flow (phoneLocked / Verified badge / Edit pencil)
#   - Saved address chips (horizontal scroll)
#   - Order logic, API calls, validation
#
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
log()  { echo ""; echo "==> $*"; }
ok()   { echo "  ✅ $*"; }
fail() { echo "  ❌ $*"; exit 1; }

PATCH=/tmp/patch_session96.tar.gz

log "Checking patch…"
[[ -f "$PATCH" ]] || fail "$PATCH not found — scp it first:
    scp deploy/patch_session96.tar.gz root@217.216.59.87:/tmp/"

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
echo "  SESSION 96 — CART & CHECKOUT: FASTER CHECKOUT"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  Cart changes (layout polish, no functional changes):"
echo "    🎰  Play banner: full card → 38px slim strip (−34px)"
echo "    🗑️   Delete pill removed from item row (stepper covers it)"
echo "    ✨  Gift-wrap hint merged into Order Summary footer (−55px)"
echo "    🔗  Continue Shopping: full button → text link (−50px)"
echo "    🔒  Trust row: 3 cards → single compact strip (−66px)"
echo ""
echo "  Checkout changes (spacing polish, no flow changes):"
echo "    📦  Step headers: compact icon + tighter gap (−8px each)"
echo "    📅  Delivery date note: box → inline text (−55px)"
echo "    ✨  Add-ons header: compact (−14px)"
echo "    🔢  Form field gaps: 14 → 11 (−3px × 5 fields)"
echo ""
echo "  Preserved: gift toggle, pincode-first, OTP flow, saved addresses"
echo ""
echo "  Total estimated scroll savings on cart: ~200px"
echo "  Total estimated scroll savings on checkout delivery: ~90px"
echo ""
