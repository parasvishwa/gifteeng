#!/usr/bin/env bash
set -e
cd /srv/gifteeng

echo "=== Session 153: SEO fixes ==="

echo "--- Extracting patch ---"
tar xzf /tmp/patch_session153.tar.gz

echo "--- Building Web ---"
pnpm --filter @gifteeng/web build

echo "--- Restarting web service ---"
systemctl restart gifteeng-web

sleep 5

echo "--- Health check ---"
curl -sf http://localhost:3000 -o /dev/null && echo "web HTTP 200" || echo "web FAILED"

echo "=== Session 153 deploy complete ==="
echo "  What changed:"
echo "    - Homepage: title/desc optimised, canonical fixed to /, H1 added (sr-only), SEO body copy"
echo "    - layout.tsx: apple-touch-icon, preconnects, fuller sameAs, AggregateRating schema"
echo "    - robots.ts: removed /_next/ from disallow, added AI bot rules"
echo "    - sitemap.ts: homepage URL fixed, null-guard on collection slugs, real static dates"
echo "    - Footer: dynamic copyright year"
echo "    - collections/page.tsx: title dedup fix, canonical corrected"
echo "    - products/[slug]/page.tsx: empty-description fallback in schema"
echo "    - _HomePageShell.tsx: hero h1 -> h2 to avoid duplicate H1"
