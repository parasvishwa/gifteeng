# Build patch_session145.tar.gz — Schedule dispatch feature
# Run from repo root: .\deploy\build-patch-session145.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$files = @(
  # ── Schema: scheduledDispatchAt column ───────────────────────────────────
  "packages/db/prisma/schema.prisma",
  "packages/db/prisma/migrations/20260520_scheduled_dispatch/migration.sql",

  # ── API: service methods + controller endpoints ───────────────────────────
  "apps/api/src/modules/order-routing/order-routing.service.ts",
  "apps/api/src/modules/order-routing/seller-orders.controller.ts",

  # ── Web: order detail + list pages ───────────────────────────────────────
  "apps/web/app/seller/orders/[id]/page.tsx",
  "apps/web/app/seller/orders/page.tsx"
)

$out = "deploy/patch_session145.tar.gz"
Write-Host "Building $out ..."
& tar -czf $out @files
Write-Host "Done: $out ($([math]::Round((Get-Item $out).Length/1KB, 1)) KB)"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  scp $out root@217.216.59.87:/tmp/patch_session145.tar.gz"
Write-Host "  scp deploy/deploy-session145.sh root@217.216.59.87:/tmp/deploy-session145.sh"
Write-Host "  ssh root@217.216.59.87 'bash /tmp/deploy-session145.sh'"
