# Upload the Gifteeng monorepo to a Hostinger / Contabo host.
#
# Windows PowerShell 5.1 compatible.
# Uses rsync if available; otherwise tar-to-file + scp + unpack (reliable on
# Windows where PowerShell pipes corrupt binary streams).
#
# Usage:
#   cd E:\Gifteeng\gifteeng
#   .\deploy\upload.ps1 -Target cloud-startup -RemoteHost root@217.216.59.87 -RemoteDir /srv/gifteeng

param(
  [Parameter(Mandatory=$true)][ValidateSet("cloud-startup","kvm")][string]$Target,
  [Parameter(Mandatory=$true)][string]$RemoteHost,
  [string]$RemoteDir = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if ($Target -eq "kvm") {
  Write-Host "==> Uploading postgres bootstrap script to $RemoteHost" -ForegroundColor Cyan
  scp "$root\deploy\bootstrap-postgres-kvm.sh" "${RemoteHost}:/root/bootstrap-postgres-kvm.sh"
  exit 0
}

if (-not $RemoteDir) {
  $hostUser = $RemoteHost.Split('@')[0]
  $RemoteDir = "/home/$hostUser/gifteeng"
}
Write-Host ("==> Uploading " + $root + " to " + $RemoteHost + ":" + $RemoteDir) -ForegroundColor Cyan

$excludes = @(
  "node_modules",
  ".next",
  "dist",
  ".git",
  ".turbo",
  "uploads",
  "*.log",
  ".env.local",
  ".env"
)

$rsyncCmd = Get-Command rsync -ErrorAction SilentlyContinue
if ($rsyncCmd) {
  Write-Host "Using rsync"
  $rsyncArgs = @("-avz", "--delete")
  foreach ($e in $excludes) {
    $rsyncArgs += "--exclude"
    $rsyncArgs += $e
  }
  $rsyncArgs += ($root + "/")
  $rsyncArgs += ($RemoteHost + ":" + $RemoteDir + "/")
  & rsync @rsyncArgs
  Write-Host ""
  Write-Host "==> Upload complete" -ForegroundColor Green
  exit 0
}

# Fallback: tar locally to a temp file, scp it, unpack remotely, delete.
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$tarFile = Join-Path $env:TEMP ("gifteeng-" + $timestamp + ".tar.gz")

Write-Host ("rsync not found - creating archive at " + $tarFile)
$tarArgs = @()
foreach ($e in $excludes) {
  $tarArgs += "--exclude=$e"
}
$tarArgs += @("-czf", $tarFile, "-C", $root, ".")
& tar @tarArgs
if ($LASTEXITCODE -ne 0) {
  Write-Host ("tar failed with exit code " + $LASTEXITCODE) -ForegroundColor Red
  exit 1
}

$size = (Get-Item $tarFile).Length
Write-Host ("Archive size: " + [math]::Round($size / 1MB, 1) + " MB")

Write-Host "==> Ensuring remote directory exists"
ssh $RemoteHost ("mkdir -p " + $RemoteDir)

Write-Host "==> Uploading archive via scp (enter password once)"
scp $tarFile ($RemoteHost + ":/tmp/gifteeng-upload.tar.gz")

Write-Host "==> Unpacking on remote"
ssh $RemoteHost ("cd " + $RemoteDir + " && tar xzf /tmp/gifteeng-upload.tar.gz && rm /tmp/gifteeng-upload.tar.gz")

Remove-Item $tarFile -Force

Write-Host ""
Write-Host "==> Upload complete" -ForegroundColor Green
Write-Host ""
Write-Host "Next on the server:" -ForegroundColor Cyan
Write-Host ("  ssh " + $RemoteHost)
Write-Host ("  bash " + $RemoteDir + "/deploy/deploy.sh")
