$ErrorActionPreference = "Stop"
$root = "E:\Gifteeng\gifteeng"
$out  = "$root\deploy\patch_session149.tar.gz"

$files = @(
  "apps/api/src/modules/order-routing/order-routing.service.ts"
)

Push-Location $root
try {
  $fileArgs = $files -join " "
  $cmd = "tar czf `"$out`" $fileArgs"
  Write-Host "Building patch_session149.tar.gz ..."
  Invoke-Expression $cmd
  Write-Host "Done: $out"
} finally {
  Pop-Location
}
