#!/usr/bin/env bash
# Deploy session 92 — Flutter home screen retention redesign
#
#   FIX  apps/mobile/lib/features/home/presentation/screens/home_screen.dart
#
#   Retention-focused changes (goal: drive frequent return visits):
#
#   MOVED   _SmartRemindersCard  bottom → position 3 (after DeliveryZoneBanner,
#           before hero carousel). Upcoming occasions are the #1 reason users
#           open a gifting app — they were invisible at the very bottom.
#
#   REMOVED _CompactStatsBar ("3,00,000+ Gifts Delivered" trust bar).
#           Dead space for returning users; first-time trust is earned through
#           product quality, not marketing stats. Classes + _StatCell deleted.
#
#   REMOVED Trending 🔥 strip. It fetched sort=popular — identical products
#           to BestSellers (also sort=popular) one section earlier.
#           De-duplicates the feed. _homeTrendingProvider also removed.
#
#   REORDER Casino before Corporate. Gift Casino (spin/scratch = daily hook)
#           was buried below the B2B corporate banner most consumers skip.
#           Order: GoinsCard → Casino → Corporate.
#
#   UPGRADE _GoinsCard now receives the live `balance` from coinBalanceProvider
#           (already watched in parent). When balance > 0 shows actionable copy:
#             • Badge: "YOUR WALLET"  (was "EARN REWARDS")
#             • Headline: "You have 950G\nready to use"
#             • Body: "Apply at checkout for an instant discount."
#             • CTA: "Redeem 950G now →"  (was "View My Goins →")
#             • Right icon: shows balance number (with AnimatedSwitcher)
#           Falls back to original earn-focused copy for new users (balance=0).
#
#   CLEANUP Removed unused `package:animated_digit/animated_digit.dart` import.
#
# New section order (top → bottom):
#   AppBar → Greeting → Search → DeliveryZone
#   → SmartReminders  ← MOVED UP
#   → Hero carousel
#   → OccasionChips → NewArrivals → CuratedForYou → BestSellers
#   → CategoryBento
#   → GoinsCard → Casino  ← REORDERED (Trending removed)
#   → Corporate → UGC → Marketplace → Testimonials → GiftReels
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

PATCH=/tmp/patch_session92.tar.gz
DIR=/srv/gifteeng    # not used for Flutter, but kept for consistency

log "Checking patch…"
[[ -f "$PATCH" ]] || fail "$PATCH not found — scp it first:
    scp deploy/patch_session92.tar.gz root@217.216.59.87:/tmp/"

log "This is a Flutter mobile patch — build on dev machine, not the server."
echo ""
echo "  1. Extract the patch into your local monorepo root:"
echo "     tar xzf $PATCH"
echo ""
echo "  2. Build:"
echo "     cd apps/mobile"
echo "     flutter pub get"
echo "     flutter build appbundle --release   # Android"
echo "     flutter build ipa --release          # iOS"
echo ""
echo "  3. Distribute:"
echo "     Android: upload build/app/outputs/bundle/release/app-release.aab to Play Console"
echo "     iOS:     open build/ios/archive/Runner.xcarchive → Distribute App"

echo ""
echo "════════════════════════════════════════════════════════"
echo "  SESSION 92 — FLUTTER HOME SCREEN RETENTION REDESIGN"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  Changes:"
echo "    🔔  Smart Reminders moved to top (above hero carousel)"
echo "    🗑️   Compact Stats Bar removed (trust noise for returning users)"
echo "    🗑️   Trending strip removed (duplicate of Best Sellers)"
echo "    🃏  Gift Casino moved above Corporate"
echo "    💰  Goins Card: live balance + actionable 'Redeem XG now' CTA"
echo ""
echo "  Goal: surface retention hooks (reminders, daily spin, Goins) early"
echo "        so users have a reason to return every day."
echo ""
