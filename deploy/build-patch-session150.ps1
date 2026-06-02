$ErrorActionPreference = "Stop"
$root = "E:\Gifteeng\gifteeng"
$out  = "$root\deploy\patch_session150.tar.gz"

$files = @(
  "packages/db/prisma/schema.prisma",
  "apps/api/src/modules/auth-seller/auth-seller.service.ts",
  "apps/api/src/modules/auth-seller/auth-seller.controller.ts",
  "apps/api/src/common/guards/optional-jwt-b2c.guard.ts",
  "apps/api/src/modules/marketplace/marketplace.service.ts",
  "apps/api/src/modules/marketplace/marketplace.module.ts",
  "apps/api/src/modules/marketplace/seller-store.controller.ts",
  "apps/web/app/seller/onboard/page.tsx",
  "apps/web/app/store/[slug]/page.tsx",
  "deploy/session150.sql"
)

Push-Location $root
try {
  $fileArgs = $files -join " "
  $cmd = "tar czf `"$out`" $fileArgs"
  Write-Host "Building patch_session150.tar.gz ..."
  Invoke-Expression $cmd
  Write-Host "Done: $out"
} finally {
  Pop-Location
}
