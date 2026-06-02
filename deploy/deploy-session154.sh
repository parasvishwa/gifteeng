#!/usr/bin/env bash
set -e
cd /srv/gifteeng

echo "=== Session 154: LCP performance fix ==="

echo "--- Extracting patch ---"
tar xzf /tmp/patch_session154.tar.gz

echo "--- Building Web ---"
pnpm --filter @gifteeng/web build

echo "--- Restarting web service ---"
systemctl restart gifteeng-web

sleep 5

echo "--- Health check ---"
curl -sf http://localhost:3000 -o /dev/null && echo "web HTTP 200" || echo "web FAILED"

echo "=== Session 154 deploy complete ==="
echo "  What changed:"
echo "    - page.tsx: pre-fetch best-selling + new-arrivals products server-side"
echo "    - page.tsx: hero image preload hint (fetchpriority=high)"
echo "    - _HomePageShell.tsx: pass preloadedProducts prop through to HomepageBlocks"
echo "    - HomepageBlocks.tsx: ProductRow uses server-pre-fetched data for first paint"
echo "    - Expected LCP improvement: 14.4s -> ~3-5s (eliminates client fetch waterfall)"
