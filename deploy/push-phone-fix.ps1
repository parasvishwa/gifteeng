# push-phone-fix.ps1 — package & upload phone normalization fix
# Run from repo root: .\deploy\push-phone-fix.ps1

$REPO   = "E:\Gifteeng\gifteeng"
$SERVER = "root@217.216.59.87"
$PATCH  = "patch_phone_fix.tar.gz"

Write-Host "=== Phone normalization fix ===" -ForegroundColor Cyan
Set-Location $REPO

$files = "apps/api/src/modules/auth-b2c/auth-b2c.service.ts " +
         "apps/web/app/b2c/auth/page.tsx " +
         "apps/web/app/b2c/account/page.tsx"

$repoUnix = $REPO.Replace("E:\", "/mnt/e/").Replace("\", "/")
$gitBash  = "C:\Program Files\Git\bin\bash.exe"

Write-Host "Creating $PATCH..." -ForegroundColor Yellow
if (Test-Path $gitBash) {
    $bashCmd = "cd '$repoUnix' && tar czf deploy/$PATCH $files && echo OK"
    & $gitBash -c $bashCmd
    Write-Host "  Created deploy\$PATCH" -ForegroundColor Green
} else {
    Write-Host "  Git Bash not found" -ForegroundColor Red; exit 1
}

Write-Host "Uploading to $SERVER..." -ForegroundColor Yellow
scp "deploy\$PATCH" "${SERVER}:/tmp/${PATCH}"
scp "deploy\deploy-phone-fix.sh" "${SERVER}:/tmp/deploy-phone-fix.sh"

Write-Host ""
Write-Host "=== Uploaded. Now run on server: ===" -ForegroundColor Green
Write-Host "  ssh $SERVER" -ForegroundColor White
Write-Host "  bash /tmp/deploy-phone-fix.sh" -ForegroundColor White
