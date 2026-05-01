# push-session8.ps1 - package changed files and SCP to VPS
# Run from repo root: .\deploy\push-session8.ps1

$REPO = "E:\Gifteeng\gifteeng"
$SERVER = "root@217.216.59.87"
$PATCH = "patch_session8.tar.gz"

Write-Host "=== Session 8 - packaging changed files ===" -ForegroundColor Cyan

Set-Location $REPO

$files = "packages/shared/src/schemas/homepage.ts " +
         "apps/api/src/modules/admin/admin.module.ts " +
         "apps/web/app/b2c/_components/sections/HeroSlider.tsx " +
         "apps/web/app/b2c/_components/sections/HomepageBlocks.tsx " +
         "apps/web/app/b2c/products/page.tsx " +
         "apps/web/app/b2c/products/[slug]/MultiVariantGrid.tsx " +
         "apps/web/app/b2c/products/[slug]/ProductDetailClient.tsx " +
         "apps/web/app/b2b/super-admin/homepage-content/page.tsx " +
         "apps/web/app/b2c/checkout/page.tsx"

Write-Host "Creating $PATCH via Git Bash..." -ForegroundColor Yellow

$repoUnix = $REPO.Replace("E:\", "/mnt/e/").Replace("\", "/")
$gitBash = "C:\Program Files\Git\bin\bash.exe"

if (Test-Path $gitBash) {
    $bashCmd = "cd '$repoUnix' && tar czf deploy/$PATCH $files && echo OK"
    & $gitBash -c $bashCmd
    Write-Host "  Created deploy\$PATCH" -ForegroundColor Green
} else {
    Write-Host "  Git Bash not found at $gitBash" -ForegroundColor Red
    exit 1
}

Write-Host "Uploading to $SERVER..." -ForegroundColor Yellow
scp "deploy\$PATCH" "${SERVER}:/tmp/${PATCH}"
scp "deploy\deploy-session8.sh" "${SERVER}:/tmp/deploy-session8.sh"

Write-Host ""
Write-Host "Uploaded. Now run on server:" -ForegroundColor Green
Write-Host "  ssh $SERVER" -ForegroundColor White
Write-Host "  bash /tmp/deploy-session8.sh" -ForegroundColor White
