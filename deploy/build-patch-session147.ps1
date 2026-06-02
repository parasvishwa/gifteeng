$ErrorActionPreference = "Stop"
$root = "E:\Gifteeng\gifteeng"
$out  = "$root\deploy\patch_session147.tar.gz"

$files = @(
  "apps/api/src/modules/marketplace/marketplace.service.ts",
  "apps/api/src/modules/marketplace/seller-products.controller.ts",
  "apps/api/src/modules/order-routing/order-routing.service.ts",
  "apps/api/src/modules/order-routing/seller-orders.controller.ts",
  "apps/api/src/modules/seller-payouts/seller-payouts.service.ts",
  "apps/api/src/modules/seller-payouts/seller-payouts.controller.ts",
  "apps/web/app/seller/orders/[id]/invoice/page.tsx",
  "apps/web/app/seller/orders/[id]/page.tsx",
  "apps/web/app/seller/payouts/[id]/invoice/page.tsx",
  "apps/web/app/seller/payouts/page.tsx",
  "apps/web/app/seller/products/bulk-upload/page.tsx"
)

Push-Location $root
try {
  $fileArgs = $files -join " "
  $cmd = "tar czf `"$out`" $fileArgs"
  Write-Host "Building patch_session147.tar.gz ..."
  Invoke-Expression $cmd
  Write-Host "Done: $out"
} finally {
  Pop-Location
}
