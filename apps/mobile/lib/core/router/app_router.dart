import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import '../../features/auth/presentation/screens/splash_screen.dart';
import '../../features/auth/presentation/screens/auth_screen.dart';
import '../../features/auth/presentation/screens/otp_screen.dart';
import '../../features/home/presentation/screens/shell_screen.dart';
import '../../features/home/presentation/screens/home_screen.dart';
import '../../features/shop/presentation/screens/shop_screen.dart';
import '../../features/shop/presentation/screens/product_detail_screen.dart';
import '../../features/shop/presentation/screens/customizer_screen.dart';
import '../../features/reviews/reviews_feature.dart' show ReviewsScreen;
import '../../features/games/presentation/screens/play_screen.dart';
import '../../features/account/presentation/screens/account_screen.dart';
import '../../features/account/presentation/screens/profile_subscreens.dart';
import '../../features/account/presentation/screens/privacy_screen.dart';
import '../../features/goins/presentation/screens/goins_screen.dart';
import '../../features/cart/presentation/screens/cart_screen.dart';
import '../../features/cart/presentation/screens/checkout_screen.dart';
import '../../features/cart/presentation/screens/order_success_screen.dart';
import '../../features/orders/presentation/screens/orders_screen.dart';
import '../../features/orders/presentation/screens/order_detail_screen.dart';
import '../../features/search/presentation/screens/search_screen.dart';
import '../../features/referrals/presentation/screens/referral_screen.dart';
import '../../features/reminders/presentation/screens/reminders_screen.dart';
import '../../features/settings/presentation/screens/language_screen.dart';
import '../../features/settings/presentation/screens/theme_screen.dart';
import '../../features/home/presentation/screens/ai_design_screen.dart';
import '../../features/shop/presentation/screens/collections_screen.dart';
import '../../features/shop/presentation/screens/categories_screen.dart';
import '../../features/vendors/presentation/screens/become_vendor_screen.dart';
import '../../features/reviews/presentation/screens/reviews_aggregated_screen.dart';
import '../api/api_client.dart';

part 'app_router.g.dart';

// ─── Auth listenable ──────────────────────────────────────────────────────────
// Bridges Riverpod auth state → GoRouter refreshListenable so the router
// re-runs redirect WITHOUT being recreated (which would reset navigation).

class _AuthNotifier extends ChangeNotifier {
  _AuthNotifier(this._ref) {
    // Listen to auth changes and notify GoRouter to re-evaluate redirect.
    _ref.listen<AsyncValue<String?>>(
      authTokenNotifierProvider,
      (_, __) => notifyListeners(),
    );
    // Also re-evaluate when the guest-mode pref changes (Continue-as-guest
    // tap from AuthScreen flips this).
    _ref.listen<AsyncValue<bool>>(
      guestModeNotifierProvider,
      (_, __) => notifyListeners(),
    );
  }

  final Ref _ref;

  bool get isLoggedIn =>
      _ref.read(authTokenNotifierProvider).valueOrNull != null;

  // True if user opted into guest browsing (Apple-required: can browse
  // without an account). Treated as "authenticated enough" for the
  // redirect rule below; specific account-required actions still gate
  // individually (e.g. checkout, wishlist, orders, account profile).
  bool get isGuest =>
      _ref.read(guestModeNotifierProvider).valueOrNull ?? false;
}

// ─── Router provider ──────────────────────────────────────────────────────────
// keepAlive: true  → never recreated; auth state changes trigger refreshListenable
// instead of rebuilding the whole router (which would reset to initialLocation).

// Root navigator key — used so deep routes (Customizer, Checkout) can opt
// out of the bottom-tab shell and render fullscreen instead.
final _rootNavigatorKey = GlobalKey<NavigatorState>();

@Riverpod(keepAlive: true)
GoRouter appRouter(Ref ref) {
  final authNotifier = _AuthNotifier(ref);
  ref.onDispose(authNotifier.dispose);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/splash',
    // refreshListenable INTENTIONALLY removed.
    //
    // Previously the router watched the auth token via _AuthNotifier and
    // ran redirect() on every change. On sign-out, this fired a redirect
    // from /account (shell) → /auth (root). That shell-to-root transition
    // triggers a Samsung One UI compositor bug — the activity gets
    // reparented to OffscreenRoot, producing a frozen black screen.
    //
    // Now ShellScreen handles logged-out state inline (renders AuthScreen
    // in place of the shell + bottom nav). The router only runs redirect()
    // on explicit navigation events (deep links, context.go calls). That
    // keeps the deep-link guards working without triggering the bug on
    // every auth-state change.
    //
    // Sentry navigator observer — every route change becomes a breadcrumb +
    // a performance transaction. Huge help when debugging "user crashed,
    // what were they doing?" — we see the exact screen path leading to it.
    observers: [SentryNavigatorObserver()],
    redirect: (context, state) {
      final onSplash = state.fullPath == '/splash';
      final onAuth   = state.fullPath?.startsWith('/auth') ?? false;

      final isLoggedIn = authNotifier.isLoggedIn;
      final isGuest    = authNotifier.isGuest;
      final canAccess  = isLoggedIn || isGuest;

      // Splash handles its own navigation — never redirect away from it.
      if (onSplash) return null;
      // Neither logged in nor browsing as guest → send to auth.
      if (!canAccess && !onAuth) return '/auth';
      // Authenticated user trying to reach auth screens → go home.
      if (isLoggedIn && onAuth) return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
      GoRoute(path: '/auth',   builder: (_, __) => const AuthScreen()),
      GoRoute(
        path: '/auth/otp',
        builder: (_, state) {
          final phone = state.extra as String? ?? '';
          return OtpScreen(phone: phone);
        },
      ),

      // Main shell with bottom nav
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => ShellScreen(shell: shell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/shop',
              builder: (_, state) => ShopScreen(
                initialCategoryId: state.uri.queryParameters['cat'],
                initialOccasion:   state.uri.queryParameters['occasion'],
              ),
              routes: [
                GoRoute(
                  path: ':slug',
                  builder: (_, state) =>
                      ProductDetailScreen(slug: state.pathParameters['slug']!),
                  routes: [
                    GoRoute(
                      // Customizer pushes via the ROOT navigator so the
                      // bottom tab bar is hidden during customization,
                      // giving the design canvas + sticky CTA the full
                      // screen height (issue #47). Without this, the
                      // tab bar consumed ~62px at the bottom and the
                      // sticky CTA had to pad above it, leaving a
                      // visible empty band.
                      path: 'customize',
                      parentNavigatorKey: _rootNavigatorKey,
                      builder: (_, state) {
                        final product = state.extra as Map<String, dynamic>? ?? {};
                        return CustomizerScreen(product: product);
                      },
                    ),
                    GoRoute(
                      path: 'reviews',
                      builder: (_, state) {
                        final extra = state.extra as Map? ?? const {};
                        return ReviewsScreen(
                          productId: (extra['productId'] ?? '').toString(),
                          productTitle: (extra['productTitle'] ?? '').toString(),
                        );
                      },
                    ),
                  ],
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/play', builder: (_, __) => const PlayScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/cart', builder: (_, __) => const CartScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/account', builder: (_, __) => const AccountScreen()),
          ]),
        ],
      ),

      // Modal / overlay routes (outside bottom nav)
      // Legacy / web-style /product/:slug deep links — share-link domains,
      // FCM push payloads, App Links, and old QR codes all use this shape.
      // Redirect to the canonical /shop/:slug route so navigation never
      // crashes into the GoRouter "Page Not Found" screen.
      GoRoute(
        path: '/product/:slug',
        redirect: (_, state) =>
            '/shop/${state.pathParameters['slug'] ?? ''}',
      ),
      GoRoute(
        path: '/products/:slug',
        redirect: (_, state) =>
            '/shop/${state.pathParameters['slug'] ?? ''}',
      ),
      GoRoute(path: '/orders',    builder: (_, __) => const OrdersScreen()),
      GoRoute(
        path: '/orders/:id',
        builder: (_, state) {
          final extra = state.extra as Map<String, dynamic>? ?? {};
          return OrderDetailScreen(
            orderId:    state.pathParameters['id'] ?? '',
            orderCache: extra,
          );
        },
      ),
      // Top-level customizer — used when navigating from order detail or any
      // non-shell context so the shell navigator is not involved.
      GoRoute(
        path: '/customize',
        builder: (_, state) {
          final product = state.extra as Map<String, dynamic>? ?? {};
          return CustomizerScreen(product: product);
        },
      ),
      GoRoute(path: '/goins',     builder: (_, __) => const GoinsScreen()),
      GoRoute(path: '/wishlist',  builder: (_, __) => const WishlistScreen()),
      GoRoute(path: '/addresses', builder: (_, __) => const AddressesScreen()),
      GoRoute(path: '/help',      builder: (_, __) => const HelpScreen()),
      GoRoute(path: '/search',    builder: (_, __) => const SearchScreen()),
      GoRoute(path: '/referrals', builder: (_, __) => const ReferralScreen()),
      GoRoute(path: '/reminders', builder: (_, __) => const RemindersScreen()),
      GoRoute(path: '/settings/language', builder: (_, __) => const LanguageScreen()),
      GoRoute(path: '/settings/theme',    builder: (_, __) => const ThemeScreen()),
      GoRoute(path: '/privacy',           builder: (_, __) => const PrivacyScreen()),
      GoRoute(path: '/ai-design',         builder: (_, __) => const AiDesignScreen()),
      GoRoute(path: '/collections',       builder: (_, __) => const CollectionsScreen()),
      GoRoute(path: '/categories',        builder: (_, __) => const CategoriesScreen()),
      GoRoute(path: '/become-a-vendor',   builder: (_, __) => const BecomeVendorScreen()),
      GoRoute(path: '/reviews',           builder: (_, __) => const ReviewsAggregatedScreen()),
      GoRoute(path: '/checkout', builder: (_, __) => const CheckoutScreen()),
      GoRoute(
        path: '/order-success',
        builder: (_, state) {
          final extra = state.extra as Map<String, dynamic>? ?? {};
          return OrderSuccessScreen(
            orderId:     extra['orderId']     as String? ?? '',
            orderNumber: extra['orderNumber'] as String? ?? '',
            payMethod:   extra['payMethod']   as String? ?? 'COD',
          );
        },
      ),
    ],
  );
}
