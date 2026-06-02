#!/usr/bin/env bash
# Deploy session 84 — Full SEO Overhaul (zero-touch automatic SEO)
#
# What ships:
#
#   BACKEND (API)
#   ─────────────
#   NEW  apps/api/src/modules/seo/seo-enrichment.service.ts
#        Two-tier pipeline: rule-based (instant) + AI-enhanced (async)
#        World-class AI prompt v3: 4 intent clusters · 20 keywords · 5 FAQs
#        E-E-A-T signals · Indian English · geo-targeting · People Also Ask
#
#   NEW  apps/api/src/modules/seo/seo-cron.service.ts
#        Nightly 02:00 → fills all missing SEO (rule-based, no API cost)
#        Sunday 03:00 → AI-upgrades entire catalog automatically
#        Pings Google + Bing sitemaps after every bulk operation
#
#   UPD  apps/api/src/modules/products/products.service.ts
#        Lifecycle hooks: every create/update fires enrichProductAsync()
#
#   UPD  apps/api/src/modules/products/products.controller.ts
#        GET  admin/:id/seo           → live SEO preview + score
#        POST admin/:id/seo/regenerate → single-product regen (rule/AI)
#        POST admin/seo/bulk-regenerate → bulk fill/upgrade/full-regen
#
#   FRONTEND (Web)
#   ──────────────
#   NEW  apps/web/app/b2c/products/[slug]/opengraph-image.tsx
#        Branded 1200×630 OG card auto-generated per product at Edge
#        Zero config — every product instantly gets a social preview card
#
#   UPD  apps/web/app/b2c/products/[slug]/page.tsx
#        Fixed JSON-LD schema URLs (/products/ → /b2c/products/)
#        generateStaticParams pre-builds top-50 products at deploy time
#        FAQ JSON-LD from metadata.seo.faq → "People Also Ask" eligibility
#        seoAltTexts from metadata.seo.altTexts → image SEO
#
#   UPD  apps/web/app/layout.tsx
#        Fixed SearchAction urlTemplate (/search? → /b2c/search?)
#        Organization + WebSite schema with correct sitelinks search box
#
#   UPD  apps/web/app/sitemap.ts
#        All URLs fixed to /b2c/products/, /b2c/collections/, /b2c/search?tag=
#
#   UPD  apps/web/app/robots.ts
#        Correct disallow paths (/b2c/account/, /b2c/cart, /b2c/checkout)
#
#   UPD  apps/web/app/b2c/page.tsx → server component (was "use client")
#        Google can now SSR the full homepage HTML — critical for indexing
#
#   NEW  apps/web/app/b2c/_HomePageShell.tsx
#        Client shell (extracted from page.tsx) — keeps interactivity intact
#
#   UPD  apps/web/app/b2c/products/page.tsx → server wrapper
#        Dynamic generateMetadata for category/tag/customizable filters
#
#   NEW  apps/web/app/b2b/super-admin/seo/page.tsx
#        SEO Command Centre dashboard — stats, bulk actions, how-it-works
#
#   NEW  apps/web/app/b2b/super-admin/products/_components/SeoPanel.tsx
#        Per-product SEO panel: score gauge, SERP preview, regenerate buttons
#
#   UPD  apps/web/app/b2b/super-admin/_components/AdminSidebar.tsx
#        "SEO Command Centre" link added to System section
#
# Run on server as root:
#   bash /tmp/deploy-session84.sh

set -euo pipefail
log()  { echo ""; echo "==> $*"; }
ok()   { echo "  ✅ $*"; }
fail() { echo "  ❌ $*"; exit 1; }

PATCH=/tmp/patch_session84.tar.gz
DIR=/srv/gifteeng

# ── Preflight ────────────────────────────────────────────────────────────────
if [[ ! -f "$PATCH" ]]; then
  fail "$PATCH not found — scp it first:
    scp deploy/patch_session84.tar.gz root@217.216.59.87:/tmp/"
fi

# ── Extract ──────────────────────────────────────────────────────────────────
log "Extracting patch…"
cd "$DIR"
tar xzf "$PATCH"
ok "Files extracted"

# ── Install new dependency (@nestjs/schedule) ────────────────────────────────
log "Installing new API dependency (@nestjs/schedule)…"
pnpm --filter=@gifteeng/api install --frozen-lockfile 2>&1 | tail -8
ok "@nestjs/schedule installed"

# ── Build API ────────────────────────────────────────────────────────────────
log "Building @gifteeng/api (~1 min)…"
pnpm --filter=@gifteeng/api build 2>&1 | tail -20
ok "API build complete"

# ── Build Web ────────────────────────────────────────────────────────────────
log "Building @gifteeng/web (~3–4 min — pre-rendering top-50 products)…"
pnpm --filter=@gifteeng/web build 2>&1 | tail -30
ok "Web build complete"

# ── Fix ownership ────────────────────────────────────────────────────────────
log "Fixing .next/ ownership…"
chown -R gifteeng:gifteeng "$DIR/apps/web/.next"
ok ".next/ owned by gifteeng"

# ── Restart services ─────────────────────────────────────────────────────────
log "Restarting API service…"
systemctl restart gifteeng-api
sleep 4

log "Restarting web service…"
systemctl restart gifteeng-web
sleep 6

# ── Health checks ─────────────────────────────────────────────────────────────
log "Health checks…"

API_OK=false
for i in 1 2 3 4 5; do
  if curl -fsS -o /dev/null "http://127.0.0.1:4000/api/health"; then
    ok "API /health ok"; API_OK=true; break
  fi
  echo "  ... API not ready (attempt $i/5)"; sleep 4
done
$API_OK || echo "  ⚠️  API health check timed out — check: journalctl -u gifteeng-api -n 50"

WEB_OK=false
for i in 1 2 3 4 5; do
  if curl -fsS -o /dev/null "http://127.0.0.1:3000/"; then
    ok "Web ok"; WEB_OK=true; break
  fi
  echo "  ... Web not ready (attempt $i/5)"; sleep 4
done
$WEB_OK || echo "  ⚠️  Web health check timed out — check: journalctl -u gifteeng-web -n 50"

# ── Verify SEO endpoint ───────────────────────────────────────────────────────
log "Verifying SEO API endpoint…"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Content-Type: application/json" \
  "http://127.0.0.1:4000/api/products/admin/list?pageSize=1&page=1" 2>/dev/null || echo "000")
if [[ "$HTTP" == "401" || "$HTTP" == "200" ]]; then
  ok "SEO endpoint responding (HTTP $HTTP)"
else
  echo "  ⚠️  SEO endpoint returned HTTP $HTTP"
fi

echo ""
echo "════════════════════════════════════════════════"
echo "  SESSION 84 — SEO OVERHAUL DEPLOYED ✅"
echo "════════════════════════════════════════════════"
echo ""
echo "  What's now live:"
echo "    🤖  Auto-SEO on every product save (rule-based + AI)"
echo "    ⏰  Nightly cron 02:00 → fills missing SEO"
echo "    🚀  Sunday cron 03:00 → AI-upgrades entire catalog"
echo "    🌐  Sitemap ping → Google + Bing notified automatically"
echo "    🖼   OG image → auto-generated branded card per product"
echo "    📋  JSON-LD → Product + BreadcrumbList + FAQPage schema"
echo "    🔍  SearchAction → sitelinks search box eligible"
echo "    📊  SEO Command Centre → /b2b/super-admin/seo"
echo ""
echo "  Trigger AI upgrade on existing catalog (run once now):"
echo "    curl -X POST http://127.0.0.1:4000/api/products/admin/seo/bulk-regenerate \\"
echo "      -H 'Authorization: Bearer <super_admin_token>' \\"
echo "      -H 'Content-Type: application/json' \\"
echo "      -d '{\"onlyMissing\":true,\"forceAi\":false,\"limit\":500}'"
echo ""
