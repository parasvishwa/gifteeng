# Build patch_session88.tar.gz — Emil design engineering: animations, interactions, motion
# Run from repo root: .\deploy\build-patch-session88.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$files = @(
  # ── Global CSS: custom easing vars, button :active states, card hover guards,
  #    prefers-reduced-motion, stronger keyframe curves ────────────────────────
  "apps/web/app/globals.css",

  # ── ProductCard: image transition fix, heart/CTA/close button polish ────────
  "apps/web/app/b2c/_components/sections/ProductCard.tsx",

  # ── OccasionScroll: stagger-in, transition-transform, touch active states ───
  "apps/web/app/b2c/_components/sections/OccasionScroll.tsx",

  # ── HomePageShell: FadeInSection stronger easing, hero CTA brand red + active
  "apps/web/app/b2c/_HomePageShell.tsx"
)

$out = "deploy/patch_session88.tar.gz"
Write-Host "Building $out ..."
& tar -czf $out @files
Write-Host "Done: $out ($([math]::Round((Get-Item $out).Length/1KB, 1)) KB)"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  scp $out root@217.216.59.87:/tmp/patch_session88.tar.gz"
Write-Host "  scp deploy/deploy-session88.sh root@217.216.59.87:/tmp/deploy-session88.sh"
Write-Host "  ssh root@217.216.59.87 'bash /tmp/deploy-session88.sh'"
