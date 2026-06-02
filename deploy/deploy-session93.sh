#!/usr/bin/env bash
# Deploy session 93 — Flutter shop screen: "Didn't find it?" request card
#
#   FIX  apps/mobile/lib/features/shop/presentation/screens/shop_screen.dart
#
#   NEW  _NotFoundCard widget — ConsumerStatefulWidget
#        Surfaces in two places so no user journey misses it:
#
#        1. End of product grid (SliverToBoxAdapter after all results)
#           — catches users who scrolled through everything without finding
#             what they needed.
#
#        2. Inside _EmptyState (search/filter returns zero results)
#           — _EmptyState restructured: emoji+copy centred in Expanded,
#             _NotFoundCard anchored to the bottom of the Column.
#
#   IMPORTS ADDED
#        dart:io                              (File for image thumbnail)
#        package:image_picker/image_picker.dart
#        package:dio/dio.dart show FormData, MultipartFile
#
#   _NotFoundCard behaviour
#        • Header:  🔍 "Didn't find what you need?" / "Tell us — we'll source it for you"
#        • Multi-line TextField (minLines 2, maxLines 4) for description
#        • "Add photo" button → ImagePicker gallery (quality 70, maxWidth 1024)
#          — shows a 52×52 thumbnail with a ✕ remove button once selected
#        • Send button (gold, active:scale) → POST /feedback/product-requests
#          via FormData (description + optional MultipartFile referenceImage)
#        • Submitting state: gold button dims, CircularProgressIndicator inside
#        • Success state: green ✓ badge + "Request sent! We'll look into it."
#        • Error state: SnackBar "Couldn't send. Please try again."
#
#   _EmptyState restructure
#        Column( Expanded(Center(emoji+title+subtitle+ClearFilters))  +  _NotFoundCard + SizedBox(24) )
#        — ensures the request card always sits at the bottom even on short
#          viewports while the "no results" message stays vertically centred.
#
# New shop page bottom sequence (product list present):
#   ... SliverGrid (products) ...
#   → SliverToBoxAdapter(_NotFoundCard())   ← NEW
#   → SliverToBoxAdapter(SizedBox(height: 24))
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

PATCH=/tmp/patch_session93.tar.gz
DIR=/srv/gifteeng    # not used for Flutter, kept for consistency

log "Checking patch…"
[[ -f "$PATCH" ]] || fail "$PATCH not found — scp it first:
    scp deploy/patch_session93.tar.gz root@217.216.59.87:/tmp/"

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
echo "  SESSION 93 — SHOP SCREEN: DIDN'T FIND IT? CARD"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  Changes:"
echo "    🔍  _NotFoundCard added — text description + optional photo upload"
echo "    📍  Appears at grid end (users who scrolled all results)"
echo "    📍  Anchored to bottom of empty-state screen"
echo "    📬  POSTs to /feedback/product-requests via FormData"
echo "    ✅  Success state: green badge + confirmation copy"
echo ""
echo "  Goal: zero dead ends — if the product isn't there, the user"
echo "        tells us instead of bouncing to a competitor."
echo ""
