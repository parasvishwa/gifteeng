$ErrorActionPreference = "Stop"
$root = "E:\Gifteeng\gifteeng"
$out  = "$root\deploy\patch_session148.tar.gz"

$files = @(
  "apps/web/app/seller/dashboard/page.tsx",
  "apps/web/app/seller/insights/page.tsx"
)

Push-Location $root
try {
  $fileArgs = $files -join " "
  $cmd = "tar czf `"$out`" $fileArgs"
  Write-Host "Building patch_session148.tar.gz ..."
  Invoke-Expression $cmd
  Write-Host "Done: $out"
} finally {
  Pop-Location
}
