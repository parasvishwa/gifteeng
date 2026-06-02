# Build patch_session87.tar.gz — Homepage polish: UGC hide, BottomThreeCol header fix
# Run from repo root: .\deploy\build-patch-session87.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$files = @(
  # ── UGCWallSection: fetch real photos, hide when none available ───────────
  "apps/web/app/b2c/_components/sections/UGCWallSection.tsx",

  # ── BottomThreeCol: col 3 header "Trusted Across Marketplaces" → "Our Promise" ─
  "apps/web/app/b2c/_components/sections/BottomThreeCol.tsx"
)

$out = "deploy/patch_session87.tar.gz"
Write-Host "Building $out ..."
& tar -czf $out @files
Write-Host "Done: $out ($([math]::Round((Get-Item $out).Length/1KB, 1)) KB)"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  scp $out root@217.216.59.87:/tmp/patch_session87.tar.gz"
Write-Host "  scp deploy/deploy-session87.sh root@217.216.59.87:/tmp/deploy-session87.sh"
Write-Host "  ssh root@217.216.59.87 'bash /tmp/deploy-session87.sh'"
