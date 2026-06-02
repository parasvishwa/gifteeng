# Build patch_session83.tar.gz
# Run from repo root: .\deploy\build-patch-session83.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$files = @(
  "apps/web/app/b2c/page.tsx",
  "apps/web/app/b2c/_components/sections/OccasionScroll.tsx",
  "apps/web/app/b2c/_components/sections/HowItWorksSection.tsx",
  "apps/web/app/b2c/_components/sections/CoinsBannerSection.tsx",
  "apps/web/app/b2c/_components/sections/UGCWallSection.tsx"
)

$out = "deploy/patch_session83.tar.gz"

Write-Host "Building $out ..."
$fileArgs = $files -join " "
& tar -czf $out $files
Write-Host "Done: $out"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  scp $out root@217.216.59.87:/tmp/patch_session83.tar.gz"
Write-Host "  ssh root@217.216.59.87 'bash /tmp/deploy-session83.sh'"
