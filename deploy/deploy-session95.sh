#!/usr/bin/env bash
# Deploy session 95 — Gift Casino: retention hooks + win-to-buy conversion
#
#   FIX  apps/mobile/lib/features/games/presentation/screens/play_screen.dart
#
#   Goal: users open the casino daily to protect their streak, win Goins,
#         then immediately flow to the shop before "offers reset at midnight".
#
# ── Changes ───────────────────────────────────────────────────────────────────
#
#   Imports
#     +  dart:async   (for Timer in new StatefulWidgets)
#
#   Section order (top → bottom) — REORDERED
#     BEFORE  AppBar → Ticker → StoryBanner → FreeSpin → Games → HowToPlay
#             → StreakStats → StickerAlbum → RecentWinners
#     AFTER   AppBar → Ticker → DailyResetBanner → FreeSpin → StreakStats
#             → WinToBuyBanner (conditional) → StoryBanner → Games
#             → HowToPlay → StickerAlbum → RecentWinners
#
#   NEW  _DailyResetBanner  (StatefulWidget, Timer every 30s)
#        Thin 34px amber strip directly below the marquee ticker.
#        Shows: "⏱ Daily games reset in 6h 42m — don't break your streak"
#        Counts down to local midnight. Keeps urgency at the very first glance.
#
#   NEW  _WinToBuyBanner  (StatefulWidget, conditional on balance > 0)
#        Gold gradient card between StreakStats and StoryBanner.
#        Shows only when hub coinBalance > 0:
#          "You have 950G ready to spend"
#          "Offers reset in 6h 42m — shop now"
#          [Shop →] pill CTA → context.push('/shop')
#        Purpose: surface the win→shop loop while the user is still
#        motivated by seeing their streak, before they scroll into games.
#
#   MOVED  _StreakStatsSection  position 8 → position 5 (right after FreeSpin)
#          Streak is the #1 daily-return hook. Users feel the cost of
#          skipping before they see the game grid.
#
#   MOVED  _StoryBanner  position 3 → position 7 (after WinToBuyBanner)
#          Social proof is valuable but not the hook — retention levers
#          come first.
#
#   UPGRADED  _FreeDailySpinCard  (StatelessWidget, copy only)
#     BEFORE  "No Goins needed — spin once per day, win real prizes!"
#     AFTER   "No Goins needed. Spin once daily. Miss it and your streak breaks."
#
#   UPGRADED  _StreakStatsSection  (urgency bar inside card)
#     When streak > 0: amber Container at top of card:
#       "⚠️ Play today or lose your X-day streak!"
#     Shown before the flame+count row so users feel the cost immediately.
#
#   NEW  Post-win shop CTA in _ResultContent (inside game dialog)
#     Shown when won && coins > 0 && !compact — after the Goins earn animation.
#     Gold-tinted full-width button: "🛒 Use your Goins in the shop →"
#     Pops dialog then pushes /shop.
#     Delay 700ms so it animates in after the confetti/coin-fall settles.
#
#   NEW helpers (top-level)
#     _secondsToMidnight() → int
#     _countdownLabel(int secs) → String  ("6h 42m" or "34m")
#
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
log()  { echo ""; echo "==> $*"; }
ok()   { echo "  ✅ $*"; }
fail() { echo "  ❌ $*"; exit 1; }

PATCH=/tmp/patch_session95.tar.gz

log "Checking patch…"
[[ -f "$PATCH" ]] || fail "$PATCH not found — scp it first:
    scp deploy/patch_session95.tar.gz root@217.216.59.87:/tmp/"

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
echo "  SESSION 95 — GIFT CASINO: RETENTION + WIN→BUY"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  Changes (layout + micro-interactions only, no functional changes):"
echo "    ⏱   Daily reset banner: amber strip with live midnight countdown"
echo "    🔥  Streak section moved to top — feel the cost before the games"
echo "    ⚠️   Streak danger bar: 'Play today or lose your X-day streak!'"
echo "    🛒  Win-to-buy banner: 'Xg ready — offers reset in Xh Xm'"
echo "    🎡  Free spin copy: 'Miss it and your streak breaks'"
echo "    🛒  Post-win dialog CTA: 'Use your Goins in the shop →'"
echo ""
echo "  Goal: users open the casino daily to protect their streak,"
echo "        win Goins, and immediately convert to a shop purchase"
echo "        before 'offers reset at midnight'."
echo ""
