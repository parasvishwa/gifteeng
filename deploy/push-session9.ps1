# push-session9.ps1 — package web-only link fixes and SCP to VPS
# Run from repo root: .\deploy\push-session9.ps1

$REPO   = "E:\Gifteeng\gifteeng"
$SERVER = "root@217.216.59.87"
$PATCH  = "patch_session9.tar.gz"

Write-Host "=== Session 9 — packaging web link fixes ===" -ForegroundColor Cyan
Set-Location $REPO

$files = @(
  "apps/web/next.config.mjs",
  "apps/web/app/b2c/_components/sections/CategoryBento.tsx",
  "apps/web/app/b2c/_components/sections/HomepageSections.tsx",
  "apps/web/app/b2c/products/_SearchBox.tsx",
  "apps/web/app/b2c/cart/page.tsx",
  "apps/web/app/b2c/orders/[id]/success/page.tsx",
  "apps/web/app/b2c/cart/FreeGiftBanner.tsx",
  "apps/web/app/b2c/_components/chrome/OccasionBanner.tsx",
  "apps/web/app/b2c/_components/MobileNav.tsx",
  "apps/web/app/b2c/wishlist/page.tsx",
  "apps/web/app/b2c/ai-design/page.tsx",
  "apps/web/app/b2c/gift/[token]/page.tsx"
) -join " "

Write-Host "Creating $PATCH..." -ForegroundColor Yellow
$null = New-Item -ItemType Directory -Force -Path "$REPO\deploy"

# Use Windows tar directly (available in Win10 1803+)
Push-Location $REPO
$tarArgs = "-czf deploy\$PATCH " + $files
cmd /c "tar $tarArgs"
Pop-Location

if (Test-Path "$REPO\deploy\$PATCH") {
  $sz = [math]::Round((Get-Item "$REPO\deploy\$PATCH").Length / 1KB, 1)
  Write-Host "  Created deploy\$PATCH ($sz KB)" -ForegroundColor Green
} else {
  Write-Host "  ERROR: tar failed" -ForegroundColor Red
  exit 1
}

Write-Host "Uploading to $SERVER..." -ForegroundColor Yellow
scp "deploy\$PATCH" "${SERVER}:/tmp/${PATCH}"
scp "deploy\deploy-session9.sh" "${SERVER}:/tmp/deploy-session9.sh"

Write-Host ""
Write-Host "=== Upload complete. Now run on server: ===" -ForegroundColor Green
Write-Host "  ssh $SERVER" -ForegroundColor White
Write-Host "  bash /tmp/deploy-session9.sh" -ForegroundColor White
Write-Host ""
