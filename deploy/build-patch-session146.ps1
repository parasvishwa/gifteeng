# Build patch_session146.tar.gz — Gap-fill from Meesho screenshot audit
# Run from repo root: .\deploy\build-patch-session146.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$files = @(
  # ── API ───────────────────────────────────────────────────────────────────
  "apps/api/src/modules/seller-payouts/seller-payouts.service.ts",
  "apps/api/src/modules/seller-payouts/seller-payouts.controller.ts",
  "apps/api/src/modules/seller-payouts/seller-reports.controller.ts",
  "apps/api/src/modules/seller-payouts/seller-insights.service.ts",

  # ── Web ───────────────────────────────────────────────────────────────────
  "apps/web/app/seller/payouts/page.tsx",
  "apps/web/app/seller/reports/page.tsx",
  "apps/web/app/seller/dashboard/page.tsx",
  "apps/web/app/seller/insights/page.tsx"
)

$out = "deploy/patch_session146.tar.gz"
Write-Host "Building $out ..."
& tar -czf $out @files
Write-Host "Done: $out ($([math]::Round((Get-Item $out).Length/1KB, 1)) KB)"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  scp $out root@217.216.59.87:/tmp/patch_session146.tar.gz"
Write-Host "  scp deploy/deploy-session146.sh root@217.216.59.87:/tmp/deploy-session146.sh"
Write-Host "  ssh root@217.216.59.87 'bash /tmp/deploy-session146.sh'"
