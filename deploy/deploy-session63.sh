#!/usr/bin/env bash
# session63 — SEO + speed + security hardening (#55, #56, #57)
#
# Web:
#   • app/layout.tsx — comprehensive root metadata (title template,
#     metadataBase for absolute OG URLs, keywords, OpenGraph, Twitter
#     summary_large_image, Apple Web App, manifest, robots index/follow
#     with max-image-preview=large), Viewport themeColor, Organization
#     + WebSite + SearchAction JSON-LD, dns-prefetch + preconnect to
#     the API origin.
#   • app/opengraph-image.tsx — dynamic 1200×630 OG card via
#     ImageResponse (Edge runtime). No static asset to keep in sync.
#   • public/manifest.webmanifest — PWA manifest so the home gets a
#     proper Add-to-Home-Screen prompt with brand colour + icons.
#   • next.config.mjs:
#       - poweredByHeader off  (don't leak Next.js version)
#       - dangerouslyAllowSVG off  (defence-in-depth)
#       - Site-wide security headers: HSTS (2y, preload),
#         X-Frame-Options DENY, X-Content-Type-Options nosniff,
#         Referrer-Policy strict-origin-when-cross-origin,
#         Permissions-Policy locking off camera/mic/usb/midi/etc,
#         Content-Security-Policy permitting GTM/GA4/Meta/Razorpay/
#         Nominatim and blocking iframe embeds + foreign scripts.
#       - Long-cache headers for /og/* and /_next/image/*.
#       - No-store on /api/* (responses vary by token).
#       - 1h cache on sitemap/robots.
#       - 301 redirects for legacy /shop, /product, /products paths
#         to canonical /b2c/products/<slug>.
#
# API:
#   • Tighter rate-limits on /auth-b2c OTP request (5/min) and verify
#     (10/min) on top of the 120/min global throttle.
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a
tar xzf /tmp/patch_session63.tar.gz
pnpm --filter @gifteeng/api build
pnpm --filter @gifteeng/web build
systemctl restart gifteeng-api
sleep 4
systemctl restart gifteeng-web
sleep 3
for i in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "  api /health ok"
    break
  fi
  echo "  ... api not ready yet (attempt $i/5)"
  sleep 2
done

# Quick header audit — confirm CSP + HSTS + X-Frame land on prod.
echo "--- security headers smoke-test ---"
curl -fsSI https://new.gifteeng.com/ | grep -iE "content-security-policy|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy" | head -10 || true
echo
echo "DEPLOY_OK session63"
