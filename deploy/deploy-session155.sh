#!/usr/bin/env bash
set -e
cd /srv/gifteeng

echo "=== Session 155: UI/UX Pro Max — Design System fonts + typography ==="

echo "--- Extracting web patch ---"
tar xzf /tmp/patch_session155.tar.gz -C apps/web

echo "--- Extracting packages patch ---"
tar xzf /tmp/patch_session155_pkg.tar.gz

echo "--- Building Web ---"
pnpm --filter @gifteeng/web build

echo "--- Restarting web service ---"
systemctl restart gifteeng-web

sleep 5

echo "--- Health check ---"
curl -sf http://localhost:3000 -o /dev/null && echo "web HTTP 200" || echo "web FAILED"

echo "=== Session 155 deploy complete ==="
echo "  What changed:"
echo "    - Fonts: Inter + Plus Jakarta Sans → Rubik (headings) + Nunito Sans (body)"
echo "    - Tailwind preset: font-family vars updated"
echo "    - globals.css: base 16px, line-height 1.6, tabular-nums, heading styles"
echo "    - globals.css: :focus-visible with brand ring color"
echo "    - globals.css: prefers-reduced-motion kills all animations (a11y)"
echo "    - Expected: warmer, more energetic typography; better e-commerce feel"
