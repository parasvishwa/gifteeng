#!/usr/bin/env bash
set -e
cd /srv/gifteeng

echo "=== Session 156: UI/UX Pro Max — design system implementation ==="

echo "--- Extracting web patch ---"
tar xzf /tmp/patch_session156.tar.gz -C apps/web

echo "--- Building Web ---"
pnpm --filter @gifteeng/web build

echo "--- Restarting web service ---"
systemctl restart gifteeng-web

sleep 5

echo "--- Health check ---"
curl -sf http://localhost:3000 -o /dev/null && echo "web HTTP 200" || echo "web FAILED"

echo "=== Session 156 deploy complete ==="
echo "  What changed:"
echo "    - globals.css: section-heading uses Rubik (font-display), tight tracking"
echo "    - globals.css: card-product border shifts to primary/25 on hover (block-based)"
echo "    - ProductCard: emoji badges -> Lucide SVG (Sparkles/Trophy/Flame)"
echo "    - ProductCard: heart button 28x28 -> 44x44 touch target (a11y critical)"
echo "    - ProductCard: variants pill emoji -> Palette icon"
echo "    - ProductCard: title uses font-display (Rubik)"
echo "    - CompactStatsBar: emoji -> Lucide SVG (Users/Star/Zap/MessageCircle/Gift)"
echo "    - OccasionScroll: emoji navigation tiles -> colored Lucide icon blocks"
echo "    - OccasionScroll: each occasion has distinct color (rose/pink/blue/violet etc)"
