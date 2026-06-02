# Build patch_session84.tar.gz  — Full SEO Overhaul
# Run from repo root: .\deploy\build-patch-session84.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$files = @(
  # ── API: SEO enrichment module (new + rewritten) ──────────────────────────
  "apps/api/package.json",
  "pnpm-lock.yaml",
  "apps/api/src/modules/seo/seo-enrichment.service.ts",
  "apps/api/src/modules/seo/seo-enrichment.module.ts",
  "apps/api/src/modules/seo/seo-cron.service.ts",
  "apps/api/src/modules/products/products.controller.ts",
  "apps/api/src/modules/products/products.module.ts",
  "apps/api/src/modules/products/products.service.ts",

  # ── Web: global metadata fixes ────────────────────────────────────────────
  "apps/web/app/layout.tsx",
  "apps/web/app/sitemap.ts",
  "apps/web/app/robots.ts",

  # ── Web: homepage SSR (was use client, now server component) ──────────────
  "apps/web/app/b2c/page.tsx",
  "apps/web/app/b2c/_HomePageShell.tsx",

  # ── Web: products listing — server wrapper for generateMetadata ───────────
  "apps/web/app/b2c/products/page.tsx",
  "apps/web/app/b2c/products/_ProductsPageClient.tsx",

  # ── Web: search page generateMetadata ────────────────────────────────────
  "apps/web/app/b2c/search/page.tsx",

  # ── Web: product detail — URL fixes, OG image, FAQ/altText schema ─────────
  "apps/web/app/b2c/products/[slug]/page.tsx",
  "apps/web/app/b2c/products/[slug]/ImageGallery.tsx",
  "apps/web/app/b2c/products/[slug]/opengraph-image.tsx",

  # ── Web: admin SEO panel + bulk command centre ────────────────────────────
  "apps/web/app/b2b/super-admin/products/_editor.tsx",
  "apps/web/app/b2b/super-admin/products/_components/SeoPanel.tsx",
  "apps/web/app/b2b/super-admin/seo/page.tsx",
  "apps/web/app/b2b/super-admin/_components/AdminSidebar.tsx"
)

$out = "deploy/patch_session84.tar.gz"
Write-Host "Building $out ..."
& tar -czf $out @files
Write-Host "Done: $out ($([math]::Round((Get-Item $out).Length/1KB, 1)) KB)"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  scp $out root@217.216.59.87:/tmp/patch_session84.tar.gz"
Write-Host "  ssh root@217.216.59.87 'bash /tmp/deploy-session84.sh'"
