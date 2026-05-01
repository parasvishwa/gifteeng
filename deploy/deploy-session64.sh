#!/usr/bin/env bash
# session64 — dead-code purge + loading skeletons (UX polish)
#
# Web cleanup:
#   • Removed 5 unused components (~720 lines):
#       - app/b2b/super-admin/_components/StatsBar.tsx        (44 LOC)
#       - app/b2c/_components/CartBadge.tsx                   (16 LOC)
#       - app/b2c/_components/games/HomepageGames.tsx        (204 LOC)
#       - app/b2c/_components/games/HomepageGamesSlider.tsx  (410 LOC)
#       - app/b2c/_components/MobileNav.tsx                   (45 LOC)
#   • Added app/b2c/loading.tsx — instant skeleton for any /b2c/* route
#     while server components stream from the API.
#   • Added app/b2b/super-admin/loading.tsx — same idea for admin pages.
#
# Mobile cleanup (v1.0.0+4010):
#   • Removed legacy router + 9 dead screen files:
#       - lib/core/router.dart (replaced by router/app_router.dart)
#       - lib/features/profile/profile_page.dart (replaced by account)
#       - lib/features/orders/orders_page.dart + order_detail_page.dart
#       - lib/features/cart/cart_page.dart + cart_state.dart
#       - lib/features/checkout/checkout_page.dart
#       - lib/features/home/home_page.dart
#       - lib/features/auth/auth_page.dart
#       - lib/features/product/product_detail_page.dart
#   • Dropped 4 unused pubspec dependencies:
#       - flutter_staggered_animations (unreferenced)
#       - skeletonizer                 (unreferenced; we use shimmer)
#       - flutter_tilt                 (unreferenced)
#       - matrix_gesture_detector      (unreferenced)
#     Estimated APK shrink ~120KB.
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

# Explicitly remove the dead-code files. Safe: they were not imported
# anywhere, so even if delete failed for any reason the build would
# still work — but we want them off disk to keep the repo clean.
rm -fv \
  apps/web/app/b2b/super-admin/_components/StatsBar.tsx \
  apps/web/app/b2c/_components/CartBadge.tsx \
  apps/web/app/b2c/_components/games/HomepageGames.tsx \
  apps/web/app/b2c/_components/games/HomepageGamesSlider.tsx \
  apps/web/app/b2c/_components/MobileNav.tsx

tar xzf /tmp/patch_session64.tar.gz
pnpm --filter @gifteeng/web build
systemctl restart gifteeng-web
sleep 3
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/
echo "DEPLOY_OK session64"
