#!/usr/bin/env bash
# Deploy session 83 — Homepage redesign (emotional layout)
#
# Changes shipped (8 files total):
#   - page.tsx: "Personalized Gifts That Create Forever Memories" headline
#   - page.tsx: "Customized with love. Delivered with happiness." subtext
#   - page.tsx: "Shop Bestsellers" + "► How It Works" CTA buttons
#   - page.tsx: CompactStatsBar replaces StatsBand, OccasionScroll replaces OccasionChips
#   - page.tsx: CategoryBento removed, PickedForYou moved after HomepageBlocks
#   - page.tsx: Bottom order — HowItWorks → Coins → UGC → App → Testimonials → Marketplaces → Trust → CTA
#   - NEW: OccasionScroll.tsx   — circular occasion cards with coloured rings from API
#   - NEW: CompactStatsBar.tsx  — 3 stats: 3,00,000+ | Top Rated Amazon | 24 Hrs Dispatch
#   - NEW: HowItWorksSection.tsx — 3-step horizontal (Upload→Personalize→Delivered) + Make Extra Special add-ons
#   - NEW: CoinsBannerSection.tsx — "Play Games Win Coins Redeem & Save!" deep purple banner
#   - NEW: UGCWallSection.tsx   — "Real Gifts. Real People. Real Smiles." 3 photos + View More
#   - NEW: AppDownloadSection.tsx — Gifteeng App feature list + Google Play / App Store buttons
#   - NEW: TrustQualitySection.tsx — Made in India, Premium Quality, Secure Packaging, etc.
#
# Run on server as root:
#   bash /tmp/deploy-session83.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_session83.tar.gz
DIR=/srv/gifteeng

if [[ ! -f "$PATCH" ]]; then
  echo "❌  $PATCH not found — scp it first:"
  echo "    scp deploy/patch_session83.tar.gz root@217.216.59.87:/tmp/"
  exit 1
fi

log "Extracting patch…"
cd "$DIR"
tar xzf "$PATCH"
echo "✅  Files extracted"

log "Building @gifteeng/web (~2–3 min)…"
pnpm --filter=@gifteeng/web build 2>&1 | tail -25

log "Fixing .next/ ownership…"
chown -R gifteeng:gifteeng "$DIR/apps/web/.next"

log "Restarting web service…"
systemctl restart gifteeng-web
sleep 6

log "Health checks…"
for i in 1 2 3 4 5; do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
    echo "  ✅ web ok"
    break
  fi
  echo "  ... web not ready (attempt $i/5)"; sleep 4
done

echo ""
echo "=========================================="
echo "  SESSION 83 DEPLOY COMPLETE"
echo "=========================================="
echo "  What changed:"
echo "    - Hero: 'Personalized Gifts That Create Forever Memories'"
echo "    - Stats: 3L+ Gifts Delivered · 4.5★ Rating"
echo "    - Shop by Occasion: circular images from category API"
echo "    - How Gifteeng Works: 3-step timeline (replaces Why Gifteeng)"
echo "    - Make Your Gift Extra Special: feature checklist + CTA"
echo "    - Play & Win Coins: dark gradient banner → /play"
echo "    - Real Gifts UGC: placeholder photo grid"
echo ""
