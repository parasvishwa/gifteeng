import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:gap/gap.dart';
import 'package:shimmer/shimmer.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/gift_image.dart';
import '../../../../core/widgets/floating_cart_bar.dart';
import '../../../../core/widgets/delivery_zone_banner.dart';
import '../../../../core/widgets/delivery_zone_popup.dart';
import '../../../../core/widgets/g_button.dart';
import '../widgets/home_sections.dart';
import '../widgets/home_product_card.dart';
import '../widgets/event_reminder_banner.dart';
import '../widgets/testimonials_section.dart';
import '../widgets/gift_reels_section.dart';
import '../widgets/occasion_chips.dart';
import '../widgets/category_bento.dart';
import '../widgets/marketplace_stores_section.dart';
import '../widgets/ugc_section.dart';
import '../../../../core/widgets/coin_fly.dart';
import '../../../../core/widgets/birthday_city_popup.dart';
import '../../../../core/widgets/milestone_popup.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/services/audio_service.dart';
import '../../../../core/state/app_state.dart';
import '../../../../core/analytics/analytics_service.dart';
import '../../data/homepage_config_repository.dart';
// profileProvider — lets the home greeting display the logged-in customer's
// first name ("Hi Ananya 👋") instead of a generic placeholder.
import '../../../account/presentation/screens/account_screen.dart' show profileProvider;

// ─── Providers ────────────────────────────────────────────────────────────────

final _homeFeaturedProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final dio = ref.watch(dioProvider);
  try {
    final res = await dio.get('/products',
        queryParameters: {'pageSize': 10, 'sort': 'newest', 'status': 'active'});
    final data = res.data;
    if (data is Map) return List<Map<String, dynamic>>.from(data['items'] ?? []);
    if (data is List) return List<Map<String, dynamic>>.from(data);
  } catch (_) {}
  return [];
});

/// Curated / personalised picks — tries `/products?personalized=true` first,
/// falls back to /products?sort=recommended, then newest. Ensures the section
/// always has content even before the recommendation engine is live.
final _homeCuratedProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final dio = ref.watch(dioProvider);
  for (final params in [
    {'pageSize': 10, 'personalized': 'true', 'status': 'active'},
    {'pageSize': 10, 'sort': 'recommended', 'status': 'active'},
    {'pageSize': 10, 'sort': 'newest', 'status': 'active'},
  ]) {
    try {
      final res = await dio.get('/products', queryParameters: params);
      final data = res.data;
      final list = data is Map
          ? List<Map<String, dynamic>>.from(data['items'] ?? [])
          : data is List
              ? List<Map<String, dynamic>>.from(data)
              : <Map<String, dynamic>>[];
      if (list.isNotEmpty) return list;
    } catch (_) {}
  }
  return [];
});

// Live wallet total. Aligns with the My Goins screen: pick the largest
// non-zero balance among `totalBalance`, `balance`, `coinBalance` so a
// stale 0 in any one field doesn't shadow the real number. Earlier
// `totalBalance ?? balance` returned 0 whenever totalBalance came back
// as a literal 0 instead of null, even if balance was positive.
final coinBalanceProvider = FutureProvider.autoDispose<int>((ref) async {
  final dio = ref.watch(dioProvider);
  try {
    final res = await dio.get('/coins/balance');
    final data = res.data;
    if (data is! Map) return 0;
    int _toInt(dynamic v) {
      if (v is num) return v.toInt();
      if (v is String) return int.tryParse(v) ?? 0;
      return 0;
    }
    final total   = _toInt(data['totalBalance']);
    final balance = _toInt(data['balance']);
    final coinBal = _toInt(data['coinBalance']);
    final picked = [total, balance, coinBal].fold<int>(0, (m, v) => v > m ? v : m);
    return picked;
  } catch (_) {
    return 0;
  }
});

// Backend-driven hero banners — image-only, identical web + mobile.
// Source: GET /banners?placement=home (managed via /super-admin/banners).
// Each banner is a single 3:1 image with a tap-target URL — no app-rendered
// title/subtitle/CTA.
final _heroBannersProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final dio = ref.watch(dioProvider);
  try {
    final res = await dio.get('/banners',
        queryParameters: {'placement': 'home'});
    final data = res.data;
    if (data is! List) return [];
    return data
        .whereType<Map>()
        .map((m) => Map<String, dynamic>.from(m))
        .where((m) => (m['imageUrl'] as String?)?.isNotEmpty == true)
        .toList();
  } catch (_) {
    return [];
  }
});

/// Top-level active categories for the horizontal category tab bar.
final _homeCategoriesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get(
        '/categories', queryParameters: {'pageSize': 50});
    final data = res.data;
    List<Map<String, dynamic>> list;
    if (data is List) {
      list = List<Map<String, dynamic>>.from(data);
    } else if (data is Map) {
      list = List<Map<String, dynamic>>.from(
          data['items'] ?? data['data'] ?? []);
    } else {
      return [];
    }
    // Top-level active only
    final active = list.where((c) {
      final pid = c['parentId'];
      final isActive = c['isActive'] == true || c['active'] == true;
      return isActive && (pid == null || pid.toString().isEmpty);
    }).toList();
    final flagged = active
        .where((c) => c['showOnHome'] == true || c['featured'] == true)
        .toList();
    final result = flagged.isNotEmpty ? flagged : active;
    result.sort((a, b) =>
        ((a['homeOrder'] ?? a['sortOrder'] ?? 99) as num)
            .compareTo((b['homeOrder'] ?? b['sortOrder'] ?? 99) as num));
    return result.take(12).toList();
  } catch (_) {}
  return [];
});

// ─── Screen ───────────────────────────────────────────────────────────────────

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  late final PageController _heroPageCtrl;
  int _heroPage = 0;

  @override
  void initState() {
    super.initState();
    _heroPageCtrl = PageController(viewportFraction: 0.88);
    // Fire home-view analytics once per mount.
    Analytics.screen('/home');
    // Maybe show the birthday + city popup (skipped for anonymous, dismissed
    // users, and users who already filled both fields). Fires after a 6s delay.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // First-launch delivery-zone picker — replaces the old GPS-only
      // "Tap to detect delivery zone" banner with a one-tap Mumbai /
      // Other-than-Mumbai chooser. Skipped once the user has already
      // saved a choice (stored in SharedPreferences).
      DeliveryZonePopup.maybeShowOnce(context, ref);
      maybeShowBirthdayCityPopup(ref, context);
      // Milestone celebration — fires once per claim. Short delay so confetti
      // lands AFTER the home screen finishes its initial fade-in.
      maybeShowMilestonePopup(ref, context);
    });
  }

  @override
  void dispose() {
    _heroPageCtrl.dispose();
    super.dispose();
  }

  /// Navigate to shop with a specific category filter
  void _goToShopWithCategory(String catId) {
    HapticFeedback.selectionClick();
    AudioService.instance.tap();
    // Write to shared state, then navigate to shop tab
    ref.read(shopCategoryFilterProvider.notifier).state = catId;
    context.go('/shop');
  }

  @override
  Widget build(BuildContext context) {
    final topPad    = MediaQuery.of(context).padding.top;
    final balance   = ref.watch(coinBalanceProvider).valueOrNull ?? 0;
    // Pull admin's homepage-builder config so toggling a section in
    // /super-admin/homepage-content actually hides it here too. Falls back
    // to `HomepageConfig.empty` (everything visible) on transient errors.
    final homeCfg = ref.watch(homepageConfigProvider).valueOrNull
        ?? HomepageConfig.empty;
    // Local helper — keeps the section-rendering block readable below.
    bool _show(String type) => homeCfg.isMobileVisible(type);

    final _c = GColors.of(context);
    return Scaffold(
      backgroundColor: _c.bg0,
      body: Stack(
        children: [
          // ── Main scrollable content ──────────────────────────────────────
          RefreshIndicator(
        color: GColors.brand,
        onRefresh: () async {
          // Invalidate every home-screen provider so a pull yields fresh data
          // for hero banners, categories, featured products, trending, coins.
          ref.invalidate(_heroBannersProvider);
          ref.invalidate(_homeCategoriesProvider);
          ref.invalidate(_homeFeaturedProvider);
          ref.invalidate(_homeCuratedProvider);
          ref.invalidate(coinBalanceProvider);
          // Pick up any admin section-visibility changes made since last load.
          ref.invalidate(homepageConfigProvider);
          // Wait for the most "felt" provider so the spinner doesn't snap.
          await ref.read(_homeFeaturedProvider.future);
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
          slivers: [
          // ── Pinned app bar ─────────────────────────────────────────────
          SliverPersistentHeader(
            pinned: true,
            delegate: _AppBarDelegate(
              topPad:  topPad,
              balance: balance,
              onCart:  () {
                HapticFeedback.selectionClick();
                AudioService.instance.tap();
                context.push('/cart');
              },
            ),
          ),

          // ── Personalised greeting ───────────────────────────────────────
          // "Hi <FirstName> 👋" + "Find the perfect gift today ✨" — matches
          // the home-screen mockup. Falls back to "there" when the customer
          // is logged out / hasn't set a name.
          const SliverToBoxAdapter(child: _GreetingBlock()),

          // ── Search bar ──────────────────────────────────────────────────
          SliverToBoxAdapter(child: _SearchBar()),

          // ── Delivery zone banner (location-aware) ───────────────────────
          const SliverToBoxAdapter(child: DeliveryZoneBanner()),

          // ── Smart Reminders — near top for daily retention ──────────────
          // Moved above the hero: upcoming occasions (Father's Day, anniversaries
          // etc.) are the strongest reason to open the app again tomorrow.
          // Buried at the bottom they were invisible; here they're actionable.
          if (_show('smart-reminders')) ...[
            // No _HSep here — the delivery banner already creates enough
            // visual breathing room above. Adding a 44px gradient divider
            // produced an obvious empty band on tall screens (Fold 7).
            const SliverToBoxAdapter(child: SizedBox(height: 12)),
            const SliverToBoxAdapter(child: _SmartRemindersCard()),
          ],

          // ── Hero carousel (admin banners or 3 hardcoded fallbacks) ───────
          // Section type `hero` in the builder controls this strip.
          if (_show('hero'))
            SliverToBoxAdapter(
              child: _HeroCarousel(
                ctrl: _heroPageCtrl,
                page: _heroPage,
                onPageChanged: (p) => setState(() => _heroPage = p),
              ),
            ),

          // ── Category tab bar (horizontal icon chips → shop filtered) ────────
          // _CategoryTabBar is gated on the same `shop-by-category` toggle so
          // admins can hide both category surfaces at once from the builder.
          if (_show('shop-by-category')) ...[
            const SliverToBoxAdapter(child: _HSep()),
            SliverToBoxAdapter(
              child: _CategoryTabBar(onCatTap: _goToShopWithCategory),
            ),
          ],

          // ── Shop by Occasion ─────────────────────────────────────────────
          // Builder type `shop-by-category` covers both the occasion chips
          // and the categories bento — they're parallel "browse by" entries.
          if (_show('shop-by-category')) ...const [
            SliverToBoxAdapter(child: _HSep()),
            SliverToBoxAdapter(child: OccasionChips()),
            SliverToBoxAdapter(child: _HSep()),
          ],

          // ── New Arrivals ─────────────────────────────────────────────────
          // Builder `product-row` with source=new-arrivals.
          if (_show('product-row')) ...[
            SliverToBoxAdapter(
              child: _ProductStrip(
                title:    homeCfg.titleFor('product-row') ?? 'New Arrivals 🆕',
                provider: _homeFeaturedProvider,
              ),
            ),
            const SliverToBoxAdapter(child: _HSep()),

            // ── Curated for You (personalised picks) ─────────────────────
            SliverToBoxAdapter(
              child: _ProductStrip(
                title:    'Curated for You ✨',
                provider: _homeCuratedProvider,
              ),
            ),
            const SliverToBoxAdapter(child: _HSep()),

            // ── Best Sellers ─────────────────────────────────────────────
            const SliverToBoxAdapter(child: BestSellersSection()),
            const SliverToBoxAdapter(child: _HSep()),
          ],

          // ── Shop by Category bento ──────────────────────────────────────
          if (_show('shop-by-category')) ...[
            SliverToBoxAdapter(
              child: CategoryBento(onCatTap: _goToShopWithCategory),
            ),
            const SliverToBoxAdapter(child: _HSep()),
          ],

          // ── Earn Goins card ─────────────────────────────────────────────
          // Builder section `gamification-widget` controls this card.
          // Balance is passed in so the card shows actionable copy when the
          // user actually has Goins ("Redeem 950G now" vs "Start Earning").
          if (_show('gamification-widget')) ...[
            SliverToBoxAdapter(child: _GoinsCard(balance: balance)),
            const SliverToBoxAdapter(child: _HSep()),
          ],

          // ── Gift Casino promo (daily-return hook) ────────────────────────
          // Moved above Corporate: spin/scratch is a daily-visit driver;
          // corporate is a B2B discovery surface most consumers skip.
          if (_show('spin-wheel')) ...const [
            SliverToBoxAdapter(child: _CasinoBanner()),
            SliverToBoxAdapter(child: _HSep()),
          ],

          // ── Corporate Gifts (B2B banner) ────────────────────────────────
          if (_show('return-gifts')) ...const [
            SliverToBoxAdapter(child: CorporateGiftsSection()),
            SliverToBoxAdapter(child: _HSep()),
          ],

          // ── UGC wall ────────────────────────────────────────────────────
          // Builder type `testimonials` is the parallel — both surface real
          // customer content. Admin can keep one or both.
          if (_show('testimonials')) ...const [
            SliverToBoxAdapter(child: UgcSection()),
            SliverToBoxAdapter(child: _HSep()),
          ],

          // ── Marketplace stores ──────────────────────────────────────────
          // No direct builder type — gate on `features-grid` until we add one.
          if (_show('features-grid')) ...const [
            SliverToBoxAdapter(child: MarketplaceStoresSection()),
            SliverToBoxAdapter(child: _HSep()),
          ],

          // ── Testimonials ────────────────────────────────────────────────
          if (_show('testimonials')) ...const [
            SliverToBoxAdapter(child: TestimonialsSection()),
            SliverToBoxAdapter(child: _HSep()),
          ],

          // ── Gift Reels — short-form video inspiration sourced from
          // /super-admin/videos. Same data the web home page consumes.
          if (_show('testimonials')) ...const [
            SliverToBoxAdapter(child: GiftReelsSection()),
            SliverToBoxAdapter(child: _HSep()),
          ],

          const SliverToBoxAdapter(child: SizedBox(height: 24)),
        ],
      ),
      ),
          // ── Compact floating cart pill (bottom-right, dismissable) ──
          const FloatingCartBar(bottomOffset: 12),
        ],
      ),
    );
  }
}

// ─── App bar delegate ─────────────────────────────────────────────────────────

class _AppBarDelegate extends SliverPersistentHeaderDelegate {
  final double topPad;
  final int    balance;
  final VoidCallback onCart;

  const _AppBarDelegate({
    required this.topPad,
    required this.balance,
    required this.onCart,
  });

  @override double get minExtent => topPad + 58;
  @override double get maxExtent => topPad + 58;

  @override
  Widget build(BuildContext ctx, double shrinkOffset, bool overlaps) {
    final c = GColors.of(ctx);
    return Container(
      color: c.bg1,
      padding: EdgeInsets.fromLTRB(20, topPad + 12, 16, 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Gifteeng logo — tinted with brand color for both themes
          SizedBox(
            height: 32,
            child: Image.asset(
              'assets/icon/logo.png',
              fit: BoxFit.contain,
              color: GColors.brand,
              colorBlendMode: BlendMode.srcIn,
              errorBuilder: (_, __, ___) => RichText(
                text: TextSpan(children: [
                  TextSpan(
                    text: 'gifte',
                    style: GoogleFonts.inter(
                      fontSize: 22, fontWeight: FontWeight.w900,
                      color: c.text0, letterSpacing: -0.5,
                    ),
                  ),
                  TextSpan(
                    text: 'eng',
                    style: GoogleFonts.inter(
                      fontSize: 22, fontWeight: FontWeight.w900,
                      color: GColors.brand, letterSpacing: -0.5,
                    ),
                  ),
                ]),
              ),
            ),
          ),
          const Spacer(),
          // Coin balance — tappable → /goins
          CoinTarget(
            child: GestureDetector(
              onTap: () {
                HapticFeedback.selectionClick();
                ctx.push('/goins');
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: GColors.gold.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: GColors.gold.withValues(alpha: 0.25)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.toll_outlined, size: 14, color: GColors.gold),
                    const Gap(4),
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 400),
                      transitionBuilder: (child, anim) => ScaleTransition(
                        scale: anim, child: child),
                      child: Text(
                        key: ValueKey('bal-$balance'),
                        balance.toString(),
                        style: GoogleFonts.inter(
                          fontSize: 12, fontWeight: FontWeight.w800,
                          color: GColors.gold,
                        ),
                      ),
                    ),
                    Text(' G',
                      style: GoogleFonts.inter(
                        fontSize: 12, fontWeight: FontWeight.w800,
                        color: GColors.gold,
                      )),
                  ],
                ),
              ),
            ),
          ),
          const Gap(8),
          // Cart
          GestureDetector(
            onTap: onCart,
            child: Container(
              width: 38, height: 38,
              decoration: BoxDecoration(
                color: c.bg2,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(Icons.shopping_bag_outlined, size: 18, color: c.text0),
            ),
          ),
        ],
      ),
    );
  }

  @override
  bool shouldRebuild(_AppBarDelegate o) =>
      o.balance != balance || o.topPad != topPad;
}

// ─── Greeting block ─────────────────────────────────────────────────────────
//
// "Hi <FirstName> 👋" + "Find the perfect gift today ✨" sits between the
// pinned app bar and the search bar. The first-name is pulled from
// /auth/b2c/me via the shared `profileProvider`; if the customer is
// signed-out or hasn't set a name we fall back to "there" so the line
// never reads "Hi !".
class _GreetingBlock extends ConsumerWidget {
  const _GreetingBlock();

  String _firstNameFrom(Map<String, dynamic>? profile) {
    if (profile == null) return "there";
    // Prefer fullName (Google / Apple sign-in fill this) then the email
    // local-part as a graceful fallback ("ananya123@gmail.com" → "ananya123").
    final raw = (profile['fullName'] as String?)?.trim()
        ?? ((profile['email'] as String?)?.split('@').first ?? '');
    if (raw.isEmpty) return "there";
    // Take just the first token + title-case it.
    final first = raw.split(RegExp(r'\s+')).first;
    if (first.isEmpty) return "there";
    return first[0].toUpperCase() + first.substring(1);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = GColors.of(context);
    final profileAsync = ref.watch(profileProvider);
    final name = _firstNameFrom(profileAsync.valueOrNull);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // First line — "Hi Ananya 👋" in a softer/lighter weight.
          Text(
            "Hi $name 👋",
            style: GoogleFonts.inter(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: c.text1,
            ),
          ),
          const Gap(4),
          // Tagline — bigger, bolder, matches the mockup's pull quote.
          Text(
            "Find the perfect gift today ✨",
            style: GoogleFonts.inter(
              fontSize: 22,
              fontWeight: FontWeight.w900,
              color: c.text0,
              letterSpacing: -0.5,
              height: 1.15,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Search bar ───────────────────────────────────────────────────────────────

class _SearchBar extends ConsumerWidget {
  const _SearchBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final catsAsync = ref.watch(_homeCategoriesProvider);
    final hints = catsAsync.valueOrNull
            ?.map((c) => c['name']?.toString() ?? '')
            .where((s) => s.isNotEmpty)
            .toList() ??
        const [];

    final c = GColors.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          Analytics.track('search_bar_tap');
          context.push('/search');
        },
        child: Container(
          height: 46,
          decoration: BoxDecoration(
            color: c.bg1,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: c.border, width: 1),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Row(
            children: [
              Icon(Icons.search_rounded, size: 18, color: c.text2),
              const Gap(10),
              Expanded(
                child: hints.isNotEmpty
                    ? _AnimatedSearchHint(hints: hints)
                    : Text(
                        'Search gifts, occasions, categories…',
                        style: GoogleFonts.inter(
                          fontSize: 13,
                          color: c.text2,
                          fontWeight: FontWeight.w400,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
              ),
              // Mic button — taps navigate to /search with a voice flag so
              // the search screen kicks off speech-to-text on mount instead
              // of the icon being a dead decorative pixel.
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  HapticFeedback.selectionClick();
                  Analytics.track('search_mic_tap');
                  context.push('/search', extra: {'voice': true});
                },
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Icon(Icons.mic_none_rounded, size: 20, color: c.text2),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Animated search hint — cycles through category names ────────────────────

class _AnimatedSearchHint extends StatefulWidget {
  final List<String> hints;
  const _AnimatedSearchHint({required this.hints});

  @override
  State<_AnimatedSearchHint> createState() => _AnimatedSearchHintState();
}

class _AnimatedSearchHintState extends State<_AnimatedSearchHint> {
  int _idx = 0;
  bool _visible = true;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(milliseconds: 2500), (_) {
      if (!mounted) return;
      setState(() => _visible = false);
      Future.delayed(const Duration(milliseconds: 220), () {
        if (!mounted) return;
        setState(() {
          _idx = (_idx + 1) % widget.hints.length;
          _visible = true;
        });
      });
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 200),
      opacity: _visible ? 1.0 : 0.0,
      child: RichText(
        overflow: TextOverflow.ellipsis,
        text: TextSpan(
          style: GoogleFonts.inter(
            fontSize: 13,
            color: GColors.of(context).text2,
            fontWeight: FontWeight.w400,
          ),
          children: [
            const TextSpan(text: 'Search for '),
            TextSpan(
              text: widget.hints[_idx],
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            const TextSpan(text: '…'),
          ],
        ),
      ),
    );
  }
}

// ─── Elegant section separator ───────────────────────────────────────────────
// Fixed 33 px tall so the 1 px line sits exactly in the middle:
//   16 px gap above  |  1 px line  |  16 px gap below
// Every section widget must have zero top padding — spacing lives here only.
class _HSep extends StatelessWidget {
  const _HSep();
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Container(
            height: 1,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  Colors.transparent,
                  GColors.brand.withValues(alpha: 0.22),
                  Colors.transparent,
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Hero carousel ─────────────────────────────────────────────────────────────
// Loads banners from /banners?placement=home (admin-configurable).
// Falls back to 3 hardcoded gradient banners when the API returns empty.

// Hardcoded fallback banners shown when admin hasn't uploaded any yet.
const _kFallbackBanners = <Map<String, dynamic>>[
  {
    'gradient': [Color(0xFFEF3752), Color(0xFFFF6B35)],
    'emoji': '🎁',
    'title': 'Find the Perfect Gift',
    'subtitle': 'For every occasion, every budget',
    'cta': 'Shop Now',
    'link': '/shop',
  },
  {
    'gradient': [Color(0xFF6C3FFF), Color(0xFFAB47BC)],
    'emoji': '✨',
    'title': 'Personalised Gifts',
    'subtitle': 'Make it uniquely theirs',
    'cta': 'Explore',
    'link': '/shop?filter=personalised',
  },
  {
    'gradient': [Color(0xFF0EA5E9), Color(0xFF10B981)],
    'emoji': '🚀',
    'title': 'Same-Day Delivery',
    'subtitle': 'Order before 3 PM for delivery today',
    'cta': 'Order Now',
    'link': '/shop',
  },
];

class _HeroCarousel extends ConsumerStatefulWidget {
  final PageController ctrl;
  final int page;
  final ValueChanged<int> onPageChanged;

  const _HeroCarousel({
    required this.ctrl,
    required this.page,
    required this.onPageChanged,
  });

  @override
  ConsumerState<_HeroCarousel> createState() => _HeroCarouselState();
}

class _HeroCarouselState extends ConsumerState<_HeroCarousel> {
  Timer? _autoScrollTimer;

  @override
  void initState() {
    super.initState();
    // Auto-scroll every 4 seconds
    _autoScrollTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted || !widget.ctrl.hasClients) return;
      final itemCount = _currentItemCount();
      if (itemCount < 2) return;
      final next = (widget.page + 1) % itemCount;
      widget.ctrl.animateToPage(
        next,
        duration: const Duration(milliseconds: 500),
        curve: Curves.easeInOut,
      );
    });
  }

  int _currentItemCount() {
    final bannersAsync = ref.read(_heroBannersProvider);
    final banners = bannersAsync.valueOrNull ?? [];
    return banners.isEmpty ? _kFallbackBanners.length : banners.length;
  }

  @override
  void dispose() {
    _autoScrollTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bannersAsync = ref.watch(_heroBannersProvider);
    final c = GColors.of(context);

    return bannersAsync.when(
      loading: () => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
        child: AspectRatio(
          aspectRatio: 16 / 7,
          child: Container(
            decoration: BoxDecoration(
              color: c.bg2,
              borderRadius: BorderRadius.circular(20),
            ),
          ),
        ),
      ),
      error: (_, __) => _buildCarousel([], c),
      data: (banners) => _buildCarousel(banners, c),
    );
  }

  Widget _buildCarousel(List<Map<String, dynamic>> apiBanners, GColorsPalette c) {
    final useApi = apiBanners.isNotEmpty;
    final count  = useApi ? apiBanners.length : _kFallbackBanners.length;

    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 16, 0, 0),
      child: Column(
        children: [
          AspectRatio(
            aspectRatio: 16 / 7,
            child: PageView.builder(
              controller: widget.ctrl,
              onPageChanged: widget.onPageChanged,
              itemCount: count,
              itemBuilder: (_, i) => useApi
                  ? _ImageBanner(banner: apiBanners[i])
                  : _GradientBanner(data: _kFallbackBanners[i]),
            ),
          ),
          if (count > 1) ...[
            const Gap(10),
            _buildDots(count),
          ],
        ],
      ),
    );
  }

  Widget _buildDots(int count) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(count, (i) {
        return AnimatedContainer(
          duration: 200.ms,
          width: widget.page == i ? 18 : 5,
          height: 5,
          margin: const EdgeInsets.symmetric(horizontal: 3),
          decoration: BoxDecoration(
            color: widget.page == i
                ? GColors.brand
                : GColors.brand.withValues(alpha: 0.25),
            borderRadius: BorderRadius.circular(3),
          ),
        );
      }),
    );
  }
}

// ─── Gradient fallback banner ─────────────────────────────────────────────────
class _GradientBanner extends StatelessWidget {
  final Map<String, dynamic> data;
  const _GradientBanner({required this.data});

  @override
  Widget build(BuildContext context) {
    final colors   = data['gradient'] as List<Color>;
    final emoji    = data['emoji']    as String;
    final title    = data['title']    as String;
    final subtitle = data['subtitle'] as String;
    final cta      = data['cta']      as String;
    final link     = data['link']     as String;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          if (link.startsWith('/')) context.push(link);
        },
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: colors,
                begin: Alignment.topLeft,
                end:   Alignment.bottomRight,
              ),
            ),
            padding: const EdgeInsets.fromLTRB(24, 0, 20, 0),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: GoogleFonts.inter(
                        fontSize: 20, fontWeight: FontWeight.w900,
                        color: Colors.white, height: 1.1,
                      )),
                      const Gap(6),
                      Text(subtitle, style: GoogleFonts.inter(
                        fontSize: 12, color: Colors.white.withValues(alpha: 0.82),
                      )),
                      const Gap(14),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 8),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(cta, style: GoogleFonts.inter(
                          fontSize: 12, fontWeight: FontWeight.w800,
                          color: colors.first,
                        )),
                      ),
                    ],
                  ),
                ),
                Text(emoji, style: const TextStyle(fontSize: 64)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Hero banner card ──────────────────────────────────────────────────────
// Two render modes, decided per-banner:
//   • Text-overlay  — when the admin set any text field on the banner, the
//     card splits text-left / image-right (matches the web HeroSlider).
//   • Image-only    — legacy: a single full-bleed image, all copy baked in.
// Tap navigates to linkUrl (and the primary button to its own link).

/// Parse a `#RRGGBB` / `#RRGGBBAA` hex string into a Color. CSS gradient
/// strings (which the web banner allows) and empty values return [fallback].
Color _bannerHex(String? raw, Color fallback) {
  if (raw == null) return fallback;
  final s = raw.trim();
  if (s.isEmpty || s.contains('gradient')) return fallback;
  var hex = s.startsWith('#') ? s.substring(1) : s;
  if (hex.length == 6) hex = 'FF$hex';            // add opaque alpha
  if (hex.length != 8) return fallback;
  final v = int.tryParse(hex, radix: 16);
  return v == null ? fallback : Color(v);
}

class _ImageBanner extends StatelessWidget {
  final Map<String, dynamic> banner;
  const _ImageBanner({required this.banner});

  String _str(String key) => (banner[key] as String?)?.trim() ?? '';

  void _go(BuildContext context, String link) {
    HapticFeedback.selectionClick();
    AudioService.instance.tap();
    final l = link.isEmpty ? '/shop' : link;
    if (l.startsWith('/')) {
      context.push(l);
    } else if (l.startsWith('http')) {
      launchUrl(Uri.parse(l), mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final image = _str('imageUrl');
    final link  = _str('linkUrl').isEmpty ? '/shop' : _str('linkUrl');
    final c = GColors.of(context);

    final tagline       = _str('tagline');
    final heading       = _str('heading');
    final headingAccent = _str('headingAccent');
    final subtitle      = _str('subtitle');
    final button1Text   = _str('button1Text');
    final button1Link   = _str('button1Link');

    final hasText = tagline.isNotEmpty ||
        heading.isNotEmpty ||
        headingAccent.isNotEmpty ||
        subtitle.isNotEmpty ||
        button1Text.isNotEmpty;

    final img = Image.network(
      image,
      fit: BoxFit.cover,
      width: double.infinity,
      height: double.infinity,
      errorBuilder: (_, __, ___) => Container(color: c.bg2),
      loadingBuilder: (ctx, child, loading) {
        if (loading == null) return child;
        return Container(color: c.bg2);
      },
    );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: GestureDetector(
        onTap: () => _go(context, link),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: Container(
            color: c.bg2,
            child: hasText
                ? _textOverlay(
                    context, img,
                    tagline: tagline,
                    heading: heading,
                    headingAccent: headingAccent,
                    subtitle: subtitle,
                    button1Text: button1Text,
                    button1Link: button1Link.isEmpty ? link : button1Link,
                  )
                : img,
          ),
        ),
      ),
    );
  }

  // Text column (left ~54%) + image (right ~46%). Colors come from the
  // per-banner overrides, falling back to the brand cream/red defaults.
  Widget _textOverlay(
    BuildContext context,
    Widget img, {
    required String tagline,
    required String heading,
    required String headingAccent,
    required String subtitle,
    required String button1Text,
    required String button1Link,
  }) {
    final bg     = _bannerHex(banner['textBgColor'] as String?, const Color(0xFFFFF5F7));
    final fg     = _bannerHex(banner['textColor']   as String?, const Color(0xFF1A1A2E));
    final accent = _bannerHex(banner['accentColor'] as String?, const Color(0xFFEF3752));
    final btnBg  = _bannerHex(banner['buttonColor'] as String?, const Color(0xFFEF3752));

    return Row(
      children: [
        Expanded(
          flex: 54,
          child: Container(
            color: bg,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (tagline.isNotEmpty)
                  Text(
                    tagline.toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 8.5,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.4,
                      color: accent.withValues(alpha: 0.85),
                    ),
                  ),
                if (heading.isNotEmpty || headingAccent.isNotEmpty) ...[
                  const Gap(3),
                  Text.rich(
                    TextSpan(children: [
                      if (heading.isNotEmpty) TextSpan(text: heading),
                      if (heading.isNotEmpty && headingAccent.isNotEmpty)
                        const TextSpan(text: '\n'),
                      if (headingAccent.isNotEmpty)
                        TextSpan(text: headingAccent, style: TextStyle(color: accent)),
                    ]),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 16,
                      height: 1.1,
                      fontWeight: FontWeight.w900,
                      color: fg,
                    ),
                  ),
                ],
                if (subtitle.isNotEmpty) ...[
                  const Gap(4),
                  Text(
                    subtitle,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 10,
                      height: 1.25,
                      color: fg.withValues(alpha: 0.7),
                    ),
                  ),
                ],
                if (button1Text.isNotEmpty) ...[
                  const Gap(8),
                  GestureDetector(
                    onTap: () => _go(context, button1Link),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                      decoration: BoxDecoration(
                        color: btnBg,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        button1Text,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        Expanded(flex: 46, child: img),
      ],
    );
  }
}


// ─── AI Gift Finder card ──────────────────────────────────────────────────────

// Simple banner replacement for the dual-column "Find the Perfect Gift"
// card. Same single-image, single-tap-target shape as the Mother's Day
// banner — image-first, no internal CTA / dual columns.
class _AiFinderCard extends StatelessWidget {
  const _AiFinderCard();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      child: GestureDetector(
        onTap: () {
          HapticFeedback.mediumImpact();
          context.push('/ai-design');
        },
        child: AspectRatio(
          aspectRatio: 3,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight,
                  colors: [
                    GColors.brand.withValues(alpha: 0.92),
                    const Color(0xFFFB923C).withValues(alpha: 0.92),
                  ],
                ),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 20),
              alignment: Alignment.centerLeft,
              child: Row(children: [
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Find the Perfect Gift',
                        style: GoogleFonts.inter(
                          fontSize: 18, fontWeight: FontWeight.w900,
                          color: Colors.white, letterSpacing: -0.4)),
                      const Gap(2),
                      Text('AI-powered gift quiz · 30 sec',
                        style: GoogleFonts.inter(
                          fontSize: 11, color: Colors.white.withValues(alpha: 0.92))),
                    ],
                  ),
                ),
                const Icon(Icons.auto_awesome_rounded,
                    size: 36, color: Colors.white),
              ]),
            ),
          ),
        ),
      ),
    ).animate().fadeIn(delay: 200.ms).slideY(begin: 0.05, end: 0);
  }
}


// ─── Product strip ────────────────────────────────────────────────────────────

class _ProductStrip extends ConsumerWidget {
  final String title;
  final ProviderListenable<AsyncValue<List<Map<String, dynamic>>>> provider;
  const _ProductStrip({required this.title, required this.provider});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(provider);

    final c = GColors.of(context);
    return Padding(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
            child: Row(
              children: [
                Text(title, style: GoogleFonts.inter(
                  fontSize: 18, fontWeight: FontWeight.w800,
                  color: c.text0,
                )),
                const Spacer(),
                GestureDetector(
                  onTap: () => context.push('/shop'),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('View all', style: GoogleFonts.inter(
                        fontSize: 12, fontWeight: FontWeight.w600,
                        color: GColors.brand,
                      )),
                      const Gap(2),
                      const Icon(Icons.arrow_forward_rounded,
                          size: 13, color: GColors.brand),
                    ],
                  ),
                ),
              ],
            ),
          ),

          async.when(
            loading: () => _ProductStripShimmer(),
            error:   (_, __) => const SizedBox.shrink(),
            data:    (products) {
              if (products.isEmpty) return const SizedBox.shrink();
              // Unified product card across all home strips. Height fits
              // the 172 image + price/CTA row + title + rating +
              // variation pill, with a few px of safety.
              return SizedBox(
                height: 310,
                child: ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                  scrollDirection: Axis.horizontal,
                  itemCount: products.length,
                  itemBuilder: (ctx, i) => Padding(
                    padding: const EdgeInsets.only(right: 12),
                    child: HomeProductCard(product: products[i])
                        .animate()
                        .fadeIn(delay: (i * 45).ms)
                        .slideX(begin: 0.05, end: 0),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _MiniProductCard extends StatefulWidget {
  final Map<String, dynamic> product;
  const _MiniProductCard({required this.product});

  @override
  State<_MiniProductCard> createState() => _MiniProductCardState();
}

class _MiniProductCardState extends State<_MiniProductCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final c      = GColors.of(context);
    final p      = widget.product;
    final title  = p['title']    as String? ?? '';
    final price  = double.tryParse(p['basePrice']?.toString() ?? '0') ?? 0;
    final slug   = p['slug']     as String? ?? '';
    final images = p['images']   as List?   ?? [];
    final first  = images.isNotEmpty ? images.first : null;

    return GestureDetector(
      onTapDown:   (_) => setState(() => _pressed = true),
      onTapUp:     (_) {
        setState(() => _pressed = false);
        HapticFeedback.selectionClick();
        AudioService.instance.tap();
        if (slug.isNotEmpty) context.push('/shop/$slug');
      },
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.95 : 1.0,
        duration: 110.ms,
        child: SizedBox(
          width: 152,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Square card — border on outer Container, clip on inner ClipRRect
              // (avoids double-edge artifact at rounded corners)
              Container(
                height: 152, width: 152,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: c.border, width: 1),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(15),
                  child: GiftImage(src: first, fit: BoxFit.cover),
                ),
              ),
              const Gap(9),
              Text(title,
                maxLines: 1, overflow: TextOverflow.ellipsis,
                style: GoogleFonts.inter(
                  fontSize: 12, fontWeight: FontWeight.w600,
                  color: c.text0,
                )),
              const Gap(3),
              Text('₹${price.toInt()}',
                style: GoogleFonts.inter(
                  fontSize: 13, fontWeight: FontWeight.w800,
                  color: c.text0,
                )),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Browse links row (Collections + All Categories) ─────────────────────────

class _BrowseLinksRow extends StatelessWidget {
  const _BrowseLinksRow();

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 4),
      child: Row(
        children: [
          Expanded(child: _BrowseCard(
            emoji: '📂',
            label: 'Collections',
            sub: 'Curated gift sets',
            onTap: () => context.push('/collections'),
            c: c,
          )),
          const Gap(12),
          Expanded(child: _BrowseCard(
            emoji: '🛍️',
            label: 'All Categories',
            sub: 'Browse every type',
            onTap: () => context.push('/categories'),
            c: c,
          )),
        ],
      ).animate().fadeIn(delay: 200.ms, duration: 400.ms).slideY(begin: 0.1, end: 0),
    );
  }
}

class _BrowseCard extends StatelessWidget {
  final String emoji, label, sub;
  final VoidCallback onTap;
  final GColorsPalette c;
  const _BrowseCard({
    required this.emoji, required this.label, required this.sub,
    required this.onTap, required this.c,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: c.bg1,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: c.border),
        ),
        child: Row(
          children: [
            Text(emoji, style: const TextStyle(fontSize: 22)),
            const Gap(10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: GoogleFonts.inter(
                      fontSize: 13, fontWeight: FontWeight.w800, color: c.text0)),
                  Text(sub, style: GoogleFonts.inter(
                      fontSize: 10, color: c.text2)),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, size: 16, color: c.text2),
          ],
        ),
      ),
    );
  }
}

// ─── Goins card ───────────────────────────────────────────────────────────────

class _GoinsCard extends StatelessWidget {
  // Balance is passed from the parent (already watched there via
  // coinBalanceProvider) so this card stays a StatelessWidget and avoids
  // a second provider read for the same data.
  final int balance;
  const _GoinsCard({this.balance = 0});

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final hasBalance = balance > 0;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      child: GestureDetector(
        onTap: () {
          HapticFeedback.mediumImpact();
          AudioService.instance.coinCollect();
          context.push('/goins');
        },
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: c.bg1,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: GColors.gold.withValues(alpha: 0.20)),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: GColors.gold.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        hasBalance ? 'YOUR WALLET' : 'EARN REWARDS',
                        style: GoogleFonts.inter(
                          fontSize: 9, fontWeight: FontWeight.w800,
                          color: GColors.gold, letterSpacing: 0.8,
                        )),
                    ),
                    const Gap(10),
                    Text(
                      hasBalance
                          ? 'You have ${balance}G\nready to use'
                          : 'Collect Goins,\nUnlock Surprises',
                      style: GoogleFonts.inter(
                        fontSize: 18, fontWeight: FontWeight.w800,
                        color: c.text0, height: 1.3,
                      )),
                    const Gap(6),
                    Text(
                      hasBalance
                          ? 'Apply at checkout for an instant discount.'
                          : 'Every purchase earns Goins. Redeem for discounts.',
                      style: GoogleFonts.inter(
                        fontSize: 12, color: c.text1, height: 1.4,
                      )),
                    const Gap(14),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.toll_outlined, size: 14, color: GColors.gold),
                        const Gap(5),
                        Text(
                          hasBalance ? 'Redeem ${balance}G now' : 'Start Earning',
                          style: GoogleFonts.inter(
                            fontSize: 13, fontWeight: FontWeight.w700,
                            color: GColors.gold,
                          )),
                        const Gap(3),
                        Icon(Icons.arrow_forward_rounded,
                            size: 13, color: GColors.gold),
                      ],
                    ),
                  ],
                ),
              ),
              const Gap(16),
              // Right side: show balance number when the user has Goins;
              // fall back to the coin icon for new users.
              Container(
                width: 64, height: 64,
                decoration: BoxDecoration(
                  color: GColors.gold.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                      color: GColors.gold.withValues(alpha: 0.22)),
                ),
                child: hasBalance
                    ? Center(
                        child: AnimatedSwitcher(
                          duration: const Duration(milliseconds: 350),
                          child: Text(
                            key: ValueKey('goins-$balance'),
                            '$balance',
                            style: GoogleFonts.inter(
                              fontSize: balance >= 1000 ? 14 : 18,
                              fontWeight: FontWeight.w900,
                              color: GColors.gold,
                              height: 1.0,
                            ),
                          ),
                        ),
                      )
                    : const Icon(Icons.toll_outlined, size: 30, color: GColors.gold),
              ),
            ],
          ),
        ),
      ),
    ).animate().fadeIn(delay: 150.ms);
  }
}

// ─── Gift Casino banner ────────────────────────────────────────────────────────

class _CasinoBanner extends StatelessWidget {
  const _CasinoBanner();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      child: GestureDetector(
        onTap: () {
          HapticFeedback.mediumImpact();
          AudioService.instance.tap();
          context.go('/play');
        },
        child: Container(
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF6B0000), Color(0xFF2A0000)],
            ),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: GColors.gold.withValues(alpha: 0.22)),
            boxShadow: [
              BoxShadow(
                color: GColors.gold.withValues(alpha: 0.10),
                blurRadius: 20,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          padding: const EdgeInsets.fromLTRB(20, 20, 18, 20),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // LIVE label
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 9, vertical: 4),
                          decoration: BoxDecoration(
                            color: GColors.brand.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(
                                color: GColors.brand.withValues(alpha: 0.35)),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 5, height: 5,
                                decoration: const BoxDecoration(
                                    color: Color(0xFF4ADE80),
                                    shape: BoxShape.circle),
                              ),
                              const Gap(5),
                              Text('GIFT CASINO',
                                style: GoogleFonts.inter(
                                  fontSize: 9, fontWeight: FontWeight.w900,
                                  color: GColors.brand, letterSpacing: 0.8)),
                            ],
                          ),
                        ),
                        const Gap(8),
                        Text('432 winners today 🏆',
                          style: GoogleFonts.inter(
                            fontSize: 9, fontWeight: FontWeight.w700,
                            color: GColors.gold.withValues(alpha: 0.75))),
                      ],
                    ),
                    const Gap(12),
                    Text('Win Real Gifts\n& Goins Daily',
                      style: GoogleFonts.inter(
                        fontSize: 22, fontWeight: FontWeight.w900,
                        color: Colors.white, height: 1.15,
                        letterSpacing: -0.4)),
                    const Gap(6),
                    Text('Spin, scratch & open mystery boxes',
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        color: Colors.white.withValues(alpha: 0.50),
                        height: 1.4)),
                    const Gap(18),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 18, vertical: 10),
                      decoration: BoxDecoration(
                        color: GColors.gold,
                        borderRadius: BorderRadius.circular(10),
                        boxShadow: [
                          BoxShadow(
                            color: GColors.gold.withValues(alpha: 0.45),
                            blurRadius: 12,
                            offset: const Offset(0, 3),
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.play_arrow_rounded,
                              size: 14, color: Colors.black),
                          const Gap(5),
                          Text('Play Now',
                            style: GoogleFonts.inter(
                              fontSize: 13, fontWeight: FontWeight.w900,
                              color: Colors.black)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const Gap(16),
              // Big emoji in glowing circle
              Container(
                width: 76, height: 76,
                decoration: BoxDecoration(
                  color: GColors.gold.withValues(alpha: 0.10),
                  shape: BoxShape.circle,
                  border: Border.all(
                      color: GColors.gold.withValues(alpha: 0.28), width: 2),
                  boxShadow: [
                    BoxShadow(
                      color: GColors.gold.withValues(alpha: 0.12),
                      blurRadius: 20,
                    ),
                  ],
                ),
                child: const Center(
                  child: Text('🎰', style: TextStyle(fontSize: 34)),
                ),
              ),
            ],
          ),
        ),
      ),
    ).animate().fadeIn(delay: 100.ms);
  }
}

// ─── Smart Reminders ──────────────────────────────────────────────────────────

class _SmartRemindersCard extends ConsumerStatefulWidget {
  const _SmartRemindersCard();

  @override
  ConsumerState<_SmartRemindersCard> createState() => _SmartRemindersCardState();
}

class _SmartRemindersCardState extends ConsumerState<_SmartRemindersCard> {
  // Tuple: (icon, name, color, date)
  // "when" label is computed dynamically so it stays fresh each session.
  // Only entries whose date is within the next 15 days are shown.
  final List<(IconData, String, Color, DateTime)> _reminders = [];

  // ── Helpers ─────────────────────────────────────────────────────────────────

  static String _whenLabel(DateTime date) {
    final now   = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final days  = date.difference(today).inDays;
    if (days == 0) return 'Today';
    if (days == 1) return 'Tomorrow';
    if (days <  7) return '$days days away';
    return '${(days / 7).ceil()} weeks away';
  }

  List<(IconData, String, Color, DateTime)> get _upcoming {
    final today = DateTime.now();
    final cutoff = today.add(const Duration(days: 15));
    return _reminders.where((r) {
      final d = r.$4;
      return !d.isBefore(DateTime(today.year, today.month, today.day)) &&
             !d.isAfter(cutoff);
    }).toList()
      ..sort((a, b) => a.$4.compareTo(b.$4)); // nearest first
  }

  void _showAddReminderSheet() {
    HapticFeedback.selectionClick();
    final nameCtrl = TextEditingController();
    DateTime? selectedDate;
    IconData selectedIcon = Icons.cake_outlined;
    final icons = [
      Icons.cake_outlined,
      Icons.favorite_outline,
      Icons.card_giftcard_outlined,
      Icons.star_outline_rounded,
      Icons.emoji_events_outlined,
      Icons.school_outlined,
      Icons.celebration_outlined,
      Icons.child_care_outlined,
      Icons.local_florist_outlined,
      Icons.wb_sunny_outlined,
      Icons.nightlight_outlined,
      Icons.home_outlined,
    ];

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: GColors.of(context).bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModal) {
          final _c = GColors.of(ctx);
          return Padding(
          padding: EdgeInsets.only(
            left: 20, right: 20, top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Add Reminder', style: GoogleFonts.inter(
                fontSize: 20, fontWeight: FontWeight.w800, color: _c.text0)),
              const Gap(4),
              Text('We\'ll remind you to shop in advance',
                style: GoogleFonts.inter(fontSize: 12, color: _c.text2)),
              const Gap(18),

              // Icon picker
              Text('Choose icon', style: GoogleFonts.inter(
                fontSize: 12, fontWeight: FontWeight.w700, color: _c.text2)),
              const Gap(10),
              Wrap(
                spacing: 8, runSpacing: 8,
                children: icons.map((ic) => GestureDetector(
                  onTap: () => setModal(() => selectedIcon = ic),
                  child: Container(
                    width: 42, height: 42,
                    decoration: BoxDecoration(
                      color: selectedIcon == ic
                          ? GColors.brand.withValues(alpha: 0.15)
                          : _c.bg2,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: selectedIcon == ic
                            ? GColors.brand
                            : _c.border),
                    ),
                    child: Icon(ic,
                      size: 20,
                      color: selectedIcon == ic
                          ? GColors.brand
                          : _c.text2),
                  ),
                )).toList(),
              ),
              const Gap(18),

              // Name input
              Text('Occasion name', style: GoogleFonts.inter(
                fontSize: 12, fontWeight: FontWeight.w700, color: _c.text2)),
              const Gap(8),
              TextField(
                controller: nameCtrl,
                style: GoogleFonts.inter(fontSize: 14, color: _c.text0),
                decoration: InputDecoration(
                  hintText: 'e.g. Mom\'s Birthday',
                  hintStyle: GoogleFonts.inter(fontSize: 14, color: _c.text2),
                  filled: true, fillColor: _c.bg2,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(6),
                    borderSide: BorderSide(color: _c.border),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(6),
                    borderSide: BorderSide(color: _c.border),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(6),
                    borderSide: const BorderSide(color: GColors.brand, width: 1.5),
                  ),
                ),
              ),
              const Gap(14),

              // Date picker
              Text('Date', style: GoogleFonts.inter(
                fontSize: 12, fontWeight: FontWeight.w700, color: _c.text2)),
              const Gap(8),
              GestureDetector(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: ctx,
                    initialDate: DateTime.now().add(const Duration(days: 7)),
                    firstDate: DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 730)),
                    builder: (c, child) => Theme(
                      data: Theme.of(c).copyWith(
                        colorScheme: ColorScheme.dark(
                          primary: GColors.brand,
                          onPrimary: Colors.white,
                          surface: _c.bg1,
                          onSurface: _c.text0,
                        ),
                      ),
                      child: child!,
                    ),
                  );
                  if (picked != null) setModal(() => selectedDate = picked);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: _c.bg2,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: _c.border),
                  ),
                  child: Row(children: [
                    Icon(Icons.calendar_today_outlined, size: 18, color: _c.text2),
                    const Gap(10),
                    Text(
                      selectedDate == null
                          ? 'Pick a date'
                          : '${selectedDate!.day}/${selectedDate!.month}/${selectedDate!.year}',
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        color: selectedDate == null ? _c.text2 : _c.text0,
                      ),
                    ),
                  ]),
                ),
              ),
              const Gap(20),

              GButton(
                label: 'Save Reminder',
                onPressed: () {
                  if (nameCtrl.text.trim().isEmpty || selectedDate == null) return;
                  const colors = [
                    Color(0xFFEC4899), Color(0xFF6366F1),
                    Color(0xFF10B981), Color(0xFFF59E0B),
                    Color(0xFF8B5CF6),
                  ];
                  setState(() {
                    _reminders.add((
                      selectedIcon,
                      nameCtrl.text.trim(),
                      colors[_reminders.length % colors.length],
                      selectedDate!,  // actual date — "when" is computed on render
                    ));
                  });
                  Navigator.pop(ctx);
                  HapticFeedback.mediumImpact();
                },
              ),
              const Gap(8),
            ],
          ),
        );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final eventAsync = ref.watch(eventReminderProvider);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.notifications_none_rounded, size: 20, color: c.text0),
              const Gap(8),
              Text('Reminders', style: GoogleFonts.inter(
                fontSize: 18, fontWeight: FontWeight.w800, color: c.text0,
              )),
              const Spacer(),
              GestureDetector(
                onTap: _showAddReminderSheet,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: GColors.brand.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: GColors.brand.withValues(alpha: 0.3)),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.add_rounded, size: 14, color: GColors.brand),
                    const Gap(2),
                    Text('Add', style: GoogleFonts.inter(
                      fontSize: 12, fontWeight: FontWeight.w700, color: GColors.brand,
                    )),
                  ]),
                ),
              ),
            ],
          ),
          const Gap(12),

          // ── Upcoming occasion card (from announcements / local calendar) ──
          eventAsync.when(
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
            data: (occ) {
              if (occ == null) return const SizedBox.shrink();
              return GestureDetector(
                onTap: () {
                  HapticFeedback.selectionClick();
                  if (occ.link.startsWith('/')) context.push(occ.link);
                },
                child: Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: GColors.brand.withValues(alpha: 0.07),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: GColors.brand.withValues(alpha: 0.2)),
                  ),
                  child: Row(children: [
                    Text(occ.emoji, style: const TextStyle(fontSize: 22)),
                    const Gap(10),
                    Expanded(child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(occ.name, style: GoogleFonts.inter(
                          fontSize: 13, fontWeight: FontWeight.w700, color: c.text0)),
                        Text(occ.tagline, maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(fontSize: 11, color: c.text2)),
                      ],
                    )),
                    const Gap(8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: GColors.brand,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text('Shop Now', style: GoogleFonts.inter(
                        fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white)),
                    ),
                  ]),
                ),
              ).animate().fadeIn(duration: 300.ms);
            },
          ),

          // Only reminders within the next 15 days — computed fresh each build
          ..._upcoming.map((o) {
            final color    = o.$3;
            final whenText = _whenLabel(o.$4);
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color:        c.bg1,
                borderRadius: BorderRadius.circular(12),
                border:       Border.all(color: c.border, width: 0.5),
              ),
              child: Row(
                children: [
                  Container(
                    width: 36, height: 36,
                    decoration: BoxDecoration(
                      color:        color.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(10),
                      border:       Border.all(color: color.withValues(alpha: 0.22)),
                    ),
                    child: Icon(o.$1, size: 18, color: color),
                  ),
                  const Gap(12),
                  Expanded(
                    child: Text(o.$2, style: GoogleFonts.inter(
                      fontSize: 14, fontWeight: FontWeight.w600, color: c.text0,
                    )),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color:        color.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(6),
                      border:       Border.all(color: color.withValues(alpha: 0.25)),
                    ),
                    child: Text(whenText, style: GoogleFonts.inter(
                      fontSize: 10, fontWeight: FontWeight.w600, color: color,
                    )),
                  ),
                ],
              ),
            ).animate().fadeIn(delay: 100.ms);
          }),

          // Empty state — shown when no reminders fall within 15 days.
          // SizedBox(width: double.infinity) forces the Text to fill the column
          // width so textAlign: center actually centers within the available
          // space (Column with crossAxisAlignment.start shrink-wraps children,
          // making Text center within its own content width — invisible).
          if (_upcoming.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 8),
              child: SizedBox(
                width: double.infinity,
                child: Text(
                  // Single-line copy — short enough to never wrap on Fold 7
                  // outer screen even at 12px. Previous two-line version
                  // looked cramped between two cards.
                  'No reminders yet · Tap + Add to create one',
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.inter(
                    fontSize: 12, color: c.text2, height: 1.4,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}


// ─── Category Icon Rail — circular icon + label below ────────────────────────
//
// Replaces the old pill-chip bar. Each category gets a circular icon button
// (52 × 52) with the category name underneath. "All" uses the brand accent;
// others use a neutral bg2 circle that adapts to the current theme.

class _CategoryTabBar extends ConsumerWidget {
  final void Function(String catName) onCatTap;
  const _CategoryTabBar({required this.onCatTap});

  IconData _iconFor(String name, bool isAll) {
    if (isAll) return Icons.grid_view_rounded;
    final n = name.toLowerCase();
    if (n.contains('flower') || n.contains('bouquet')) return Icons.local_florist_outlined;
    if (n.contains('cake')   || n.contains('bakery'))  return Icons.cake_outlined;
    if (n.contains('jewel')  || n.contains('ring'))    return Icons.diamond_outlined;
    if (n.contains('watch'))                            return Icons.watch_outlined;
    if (n.contains('plant'))                            return Icons.eco_outlined;
    if (n.contains('book'))                             return Icons.menu_book_outlined;
    if (n.contains('perfume') || n.contains('scent'))  return Icons.spa_outlined;
    if (n.contains('toy')    || n.contains('kid'))     return Icons.toys_outlined;
    if (n.contains('photo')  || n.contains('frame'))   return Icons.photo_outlined;
    if (n.contains('mug')    || n.contains('drink'))   return Icons.coffee_outlined;
    if (n.contains('candle'))                           return Icons.local_fire_department_outlined;
    if (n.contains('corpor') || n.contains('b2b'))     return Icons.business_outlined;
    if (n.contains('tech')   || n.contains('gadget'))  return Icons.headphones_outlined;
    if (n.contains('home')   || n.contains('decor'))   return Icons.home_outlined;
    if (n.contains('key'))                              return Icons.vpn_key_outlined;
    if (n.contains('car'))                             return Icons.directions_car_outlined;
    if (n.contains('desk')   || n.contains('office'))  return Icons.edit_outlined;
    if (n.contains('choc'))                             return Icons.icecream_outlined;
    if (n.contains('fashion') || n.contains('apparel')) return Icons.shopping_bag_outlined;
    if (n.contains('magnet'))                           return Icons.attractions_outlined;
    if (n.contains('sport') || n.contains('outdoor'))  return Icons.sports_outlined;
    if (n.contains('return') || n.contains('return'))  return Icons.card_giftcard_outlined;
    if (n.contains('personal'))                        return Icons.edit_note_outlined;
    if (n.contains('stationer'))                       return Icons.draw_outlined;
    return Icons.card_giftcard_outlined;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c     = GColors.of(context);
    final async = ref.watch(_homeCategoriesProvider);
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 20, 0, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: Row(children: [
              Text('Browse Categories',
                style: GoogleFonts.inter(
                  fontSize: 16, fontWeight: FontWeight.w800,
                  color: c.text0)),
              const Spacer(),
              GestureDetector(
                onTap: () => context.go('/shop'),
                child: Text('See all', style: GoogleFonts.inter(
                  fontSize: 12, fontWeight: FontWeight.w600,
                  color: GColors.brand)),
              ),
            ]),
          ),
          SizedBox(
            // Bumped from 88 → 100 so two-line full labels never clip.
            height: 100,
            child: async.when(
              error: (_, __) => const SizedBox.shrink(),
              loading: () => _buildSkeleton(),
              data: (cats) {
                final items = <Map<String, dynamic>>[
                  {'_id': 'all', 'name': 'All', '_isAll': true},
                  ...cats,
                ];
                return ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                  scrollDirection: Axis.horizontal,
                  itemCount: items.length,
                  itemBuilder: (_, i) {
                    final cat   = items[i];
                    final name  = (cat['name'] ?? '').toString();
                    final isAll = cat['_isAll'] == true;
                    final icon  = _iconFor(name, isAll);
                    return Padding(
                      padding: const EdgeInsets.only(right: 16),
                      child: GestureDetector(
                        onTap: () {
                          HapticFeedback.selectionClick();
                          AudioService.instance.tap();
                          onCatTap(isAll ? 'all' : name);
                        },
                        child: SizedBox(
                          width: 64,
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              // Circle icon
                              Container(
                                width: 52, height: 52,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: isAll
                                      ? GColors.brand.withValues(alpha: 0.12)
                                      : c.bg2,
                                  border: Border.all(
                                    color: isAll
                                        ? GColors.brand.withValues(alpha: 0.35)
                                        : c.border,
                                    width: 1.0,
                                  ),
                                ),
                                child: Icon(icon,
                                  size: 22,
                                  color: isAll ? GColors.brand : c.text1),
                              ),
                              const Gap(6),
                              // Full label, two lines if needed.
                              Text(
                                name,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                textAlign: TextAlign.center,
                                style: GoogleFonts.inter(
                                  fontSize: 10,
                                  height: 1.15,
                                  fontWeight: isAll
                                      ? FontWeight.w700
                                      : FontWeight.w500,
                                  color: isAll ? GColors.brand : c.text1,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSkeleton() {
    return Builder(builder: (context) {
      final c = GColors.of(context);
      return ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
        scrollDirection: Axis.horizontal,
        itemCount: 6,
        itemBuilder: (_, __) => Padding(
          padding: const EdgeInsets.only(right: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Shimmer.fromColors(
                baseColor: c.bg2, highlightColor: c.border,
                child: Container(
                  width: 52, height: 52,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle, color: c.bg2),
                ),
              ),
              const Gap(6),
              Shimmer.fromColors(
                baseColor: c.bg2, highlightColor: c.border,
                child: Container(
                  width: 36, height: 9,
                  decoration: BoxDecoration(
                    color: c.bg2, borderRadius: BorderRadius.circular(4)),
                ),
              ),
            ],
          ),
        ),
      );
    });
  }
}

class _ProductStripShimmer extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return SizedBox(
      height: 210,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
        scrollDirection: Axis.horizontal,
        itemCount: 4,
        itemBuilder: (_, __) => Padding(
          padding: const EdgeInsets.only(right: 12),
          child: Shimmer.fromColors(
            baseColor: c.bg2, highlightColor: c.border,
            child: Container(
              width: 148,
              decoration: BoxDecoration(
                color: c.bg2,
                borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ),
      ),
    );
  }
}

