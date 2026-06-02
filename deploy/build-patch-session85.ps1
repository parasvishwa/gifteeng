# Build patch_session85.tar.gz — Flutter: SEO feature parity with web
# Run from repo root: .\deploy\build-patch-session85.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$files = @(
  # ── Product detail: FAQ accordion ─────────────────────────────────────────
  "apps/mobile/lib/features/shop/presentation/screens/product_detail_screen.dart",

  # ── Home: OccasionScroll upgrade (API-driven circular image cards) ────────
  "apps/mobile/lib/features/home/presentation/widgets/occasion_chips.dart",

  # ── Home: new sections (HowItWorks + UGC wall) ────────────────────────────
  "apps/mobile/lib/features/home/presentation/widgets/how_it_works_section.dart",
  "apps/mobile/lib/features/home/presentation/widgets/ugc_section.dart",

  # ── Home screen: wires all new sections, CompactStatsBar ─────────────────
  "apps/mobile/lib/features/home/presentation/screens/home_screen.dart"
)

$out = "deploy/patch_session85.tar.gz"
Write-Host "Building $out ..."
& tar -czf $out @files
Write-Host "Done: $out ($([math]::Round((Get-Item $out).Length/1KB, 1)) KB)"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  scp $out root@217.216.59.87:/tmp/patch_session85.tar.gz"
Write-Host "  ssh root@217.216.59.87 'bash /tmp/deploy-session85.sh'"
