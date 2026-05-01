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
import '../../../../core/widgets/g_button.dart';
import '../widgets/home_sections.dart';
import '../widgets/event_reminder_banner.dart';
import '../widgets/testimonials_section.dart';
import '../widgets/occasion_chips.dart';
import '../widgets/category_bento.dart';
import '../widgets/marketplace_stores_section.dart';
import '../../../../core/widgets/coin_fly.dart';
import '../../../../core/widgets/birthday_city_popup.dart';
import '../../../../core/widgets/milestone_popup.dart';
import 'package:animated_digit/animated_digit.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/services/audio_service.dart';
import '../../../../core/state/app_state.dart';
import '../../../../core/analytics/analytics_service.dart';

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

final _homeTrendingProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final dio = ref.watch(dioProvider);
  try {
    final res = await dio.get('/products',
        queryParameters: {'pageSize': 8, 'sort': 'popular', 'status': 'active'});
    final data = res.data;
    if (data is Map) return List<Map<String, dynamic>>.from(data['items'] ?? []);
    if (data is List) return List<Map<String, dynamic>>.from(data);
  } catch (_) {}
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

    final _c = GColors.of(context);
    return Scaffold(
      backgroundColor: _c.bg0,
      body: RefreshIndicator(
        color: GColors.brand,
        onRefresh: () async {
          // Invalidate every home-screen provider so a pull yields fresh data
          // for hero banners, categories, featured products, trending, coins.
          ref.invalidate(_heroBannersProvider);
          ref.invalidate(_homeCategoriesProvider);
          ref.invalidate(_homeFeaturedProvider);
          ref.invalidate(_homeTrendingProvider);
          ref.invalidate(coinBalanceProvider);
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

          // ── Search bar ──────────────────────────────────────────────────
          SliverToBoxAdapter(child: _SearchBar()),

          // ── Hero carousel ───────────────────────────────────────────────
          SliverToBoxAdapter(
            child: _HeroCarousel(
              ctrl: _heroPageCtrl,
              page: _heroPage,
              onPageChanged: (p) => setState(() => _heroPage = p),
            ),
          ),

          // ── Trust bar ───────────────────────────────────────────────────
          const SliverToBoxAdapter(child: _TrustBar()),

          // ── Category Tab Bar — horizontal icon chips ──────────────────────
          SliverToBoxAdapter(
            child: _CategoryTabBar(onCatTap: _goToShopWithCategory),
          ),

          // ── Event reminder banner (dynamic from /announcements) ──────────
          const SliverToBoxAdapter(child: EventReminderBanner()),

          // ── AI Gift Finder ──────────────────────────────────────────────
          const SliverToBoxAdapter(child: _AiFinderCard()),

          // ── Shop by Occasion (intent-first discovery) ───────────────────
          const SliverToBoxAdapter(child: OccasionChips()),

          // ── Shop by Category (product-preview bento) ────────────────────
          SliverToBoxAdapter(
            child: CategoryBento(onCatTap: _goToShopWithCategory),
          ),

          // ── Quick-browse row removed from Home — now lives on Shop screen
          // (immediately below the search + category strip) so the home feed
          // stays focused on hero / discovery, not navigation.

          // ── New Arrivals ────────────────────────────────────────────────
          SliverToBoxAdapter(
            child: _ProductStrip(
              title:    'New Arrivals',
              provider: _homeFeaturedProvider,
            ),
          ),

          // ── Best Sellers (ranked top products) ──────────────────────────
          const SliverToBoxAdapter(child: BestSellersSection()),

          // ── Trending Gifts ──────────────────────────────────────────────
          SliverToBoxAdapter(
            child: _ProductStrip(
              title:    'Trending',
              provider: _homeTrendingProvider,
            ),
          ),

          // ── Earn Goins card ─────────────────────────────────────────────
          const SliverToBoxAdapter(child: _GoinsCard()),

          // ── Corporate Gifts (B2B banner) ────────────────────────────────
          const SliverToBoxAdapter(child: CorporateGiftsSection()),

          // ── Gift Casino promo ───────────────────────────────────────────
          const SliverToBoxAdapter(child: _CasinoBanner()),

          // ── Marketplace stores (Amazon, Flipkart, Meesho…) ──────────────
          const SliverToBoxAdapter(child: MarketplaceStoresSection()),

          // ── Testimonials ────────────────────────────────────────────────
          const SliverToBoxAdapter(child: TestimonialsSection()),

          // ── AI Smart Reminders ──────────────────────────────────────────
          const SliverToBoxAdapter(child: _SmartRemindersCard()),

          const SliverToBoxAdapter(child: SizedBox(height: 120)),
        ],
      ),
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
                    AnimatedDigitWidget(
                      value: balance,
                      duration: const Duration(milliseconds: 900),
                      curve: Curves.easeOutCubic,
                      enableSeparator: true,
                      textStyle: GoogleFonts.inter(
                        fontSize: 12, fontWeight: FontWeight.w800,
                        color: GColors.gold,
                      ),
                    ).animate(key: ValueKey('home-bal-$balance'))
                        .scaleXY(begin: 0.88, end: 1.0, duration: 350.ms,
                            curve: Curves.elasticOut),
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

// ─── Trust bar ────────────────────────────────────────────────────────────────

class _TrustBar extends StatelessWidget {
  const _TrustBar();

  static const _items = [
    (Icons.local_shipping_outlined,  'Fast Delivery'),
    (Icons.refresh_outlined,         'Easy Returns'),
    (Icons.verified_outlined,        'Quality Check'),
    (Icons.card_giftcard_outlined,   'Gift Wrapping'),
  ];

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Row(
        children: _items.map((item) => Expanded(
          child: Column(children: [
            Icon(item.$1, size: 18, color: GColors.brand.withValues(alpha: 0.7)),
            const Gap(4),
            Text(item.$2, textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize: 9, color: c.text2,
                fontWeight: FontWeight.w500, height: 1.3)),
          ]),
        )).toList(),
      ),
    );
  }
}


// ─── Hero carousel ─────────────────────────────────────────────────────────────

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
  @override
  Widget build(BuildContext context) {
    final bannersAsync = ref.watch(_heroBannersProvider);
    final c = GColors.of(context);

    return bannersAsync.when(
      // Skeleton during load — keeps page height stable.
      loading: () => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
        child: AspectRatio(
          aspectRatio: 3 / 1,
          child: Container(
            decoration: BoxDecoration(
              color: c.bg2,
              borderRadius: BorderRadius.circular(20),
            ),
          ),
        ),
      ),
      // Empty / error → render nothing. Better than fake fallback content.
      error: (_, __) => const SizedBox.shrink(),
      data: (banners) {
        if (banners.isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.fromLTRB(0, 16, 0, 0),
          child: Column(
            children: [
              AspectRatio(
                aspectRatio: 3 / 1,
                child: PageView.builder(
                  controller: widget.ctrl,
                  onPageChanged: widget.onPageChanged,
                  itemCount: banners.length,
                  itemBuilder: (_, i) => _ImageBanner(banner: banners[i]),
                ),
              ),
              const Gap(12),
              if (banners.length > 1) _buildDots(banners.length),
            ],
          ),
        );
      },
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
                : GColors.brand.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(3),
          ),
        );
      }),
    );
  }
}

// ─── Image-only banner card ────────────────────────────────────────────────
// Single 3:1 image as the entire banner. All copy/CTA lives inside the
// image — no app-rendered title/subtitle/buttons. Tap navigates to linkUrl.

class _ImageBanner extends StatelessWidget {
  final Map<String, dynamic> banner;
  const _ImageBanner({required this.banner});

  @override
  Widget build(BuildContext context) {
    final image = (banner['imageUrl'] as String?) ?? '';
    final link  = (banner['linkUrl']  as String?) ?? '/shop';
    final c = GColors.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          AudioService.instance.tap();
          if (link.startsWith('/')) {
            context.push(link);
          } else if (link.startsWith('http')) {
            // External absolute URL — open in browser; ignored on launch fail.
            launchUrl(Uri.parse(link), mode: LaunchMode.externalApplication);
          }
        },
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: Container(
            color: c.bg2,
            child: Image.network(
              image,
              fit: BoxFit.cover,
              width: double.infinity,
              errorBuilder: (_, __, ___) => Container(color: c.bg2),
              loadingBuilder: (ctx, child, loading) {
                if (loading == null) return child;
                return Container(color: c.bg2);
              },
            ),
          ),
        ),
      ),
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
      padding: const EdgeInsets.fromLTRB(0, 28, 0, 0),
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
              return SizedBox(
                height: 210,
                child: ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                  scrollDirection: Axis.horizontal,
                  itemCount: products.length,
                  itemBuilder: (ctx, i) => Padding(
                    padding: const EdgeInsets.only(right: 12),
                    child: _MiniProductCard(product: products[i])
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
              // Square card — radius 16, outlined
              Container(
                height: 152, width: 152,
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: c.border, width: 1),
                ),
                child: GiftImage(src: first, fit: BoxFit.cover),
              ),
              const Gap(9),
              Text(title,
                maxLines: 1, overflow: TextOverflow.ellipsis,
                style: GoogleFonts.inter(
                  fontSize: 12, fontWeight: FontWeight.w600,
                  color: c.text0,
                )),
              const Gap(3),
              Row(
                children: [
                  Text('₹${price.toInt()}',
                    style: GoogleFonts.inter(
                      fontSize: 13, fontWeight: FontWeight.w800,
                      color: c.text0,
                    )),
                  const Gap(6),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(
                      color: const Color(0xFF10B981).withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text('Free delivery',
                      style: GoogleFonts.inter(
                        fontSize: 8.5, fontWeight: FontWeight.w600,
                        color: const Color(0xFF10B981),
                      )),
                  ),
                ],
              ),
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
  const _GoinsCard();

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 28, 16, 0),
      child: GestureDetector(
        onTap: () {
          HapticFeedback.mediumImpact();
          AudioService.instance.coinCollect();
          context.go('/goins');
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
                      child: Text('EARN REWARDS', style: GoogleFonts.inter(
                        fontSize: 9, fontWeight: FontWeight.w800,
                        color: GColors.gold, letterSpacing: 0.8,
                      )),
                    ),
                    const Gap(10),
                    Text('Collect Goins,\nUnlock Surprises',
                      style: GoogleFonts.inter(
                        fontSize: 18, fontWeight: FontWeight.w800,
                        color: c.text0, height: 1.3,
                      )),
                    const Gap(6),
                    Text('Every purchase earns Goins. Redeem for discounts.',
                      style: GoogleFonts.inter(
                        fontSize: 12, color: c.text1, height: 1.4,
                      )),
                    const Gap(14),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.toll_outlined,
                            size: 14, color: GColors.gold),
                        const Gap(5),
                        Text('View My Goins',
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
              Container(
                width: 64, height: 64,
                decoration: BoxDecoration(
                  color: GColors.gold.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                      color: GColors.gold.withValues(alpha: 0.22)),
                ),
                child: Icon(Icons.toll_outlined,
                    size: 30, color: GColors.gold),
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
      padding: const EdgeInsets.fromLTRB(16, 28, 16, 0),
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
              colors: [Color(0xFF1A0800), Color(0xFF0D0D18)],
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

class _SmartRemindersCard extends StatefulWidget {
  const _SmartRemindersCard();

  @override
  State<_SmartRemindersCard> createState() => _SmartRemindersCardState();
}

class _SmartRemindersCardState extends State<_SmartRemindersCard> {
  // Local reminders list (default set + user-added)
  final List<(IconData icon, String name, String when, Color color)> _reminders = [
    (Icons.cake_outlined,          'Birthday',    '2 days away', Color(0xFFEC4899)),
    (Icons.favorite_outline,       'Anniversary', 'Next week',   Color(0xFF6366F1)),
    (Icons.star_outline_rounded,   'Christmas',   'Dec 25',      Color(0xFF10B981)),
  ];

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
                  final days = selectedDate!.difference(DateTime.now()).inDays;
                  final when = days == 0 ? 'Today'
                      : days == 1 ? 'Tomorrow'
                      : days < 7 ? '$days days away'
                      : days < 30 ? '${(days / 7).round()} weeks away'
                      : '${selectedDate!.day}/${selectedDate!.month}';
                  final colors = [
                    const Color(0xFFEC4899), const Color(0xFF6366F1),
                    const Color(0xFF10B981), const Color(0xFFF59E0B),
                    const Color(0xFF8B5CF6),
                  ];
                  setState(() {
                    _reminders.add((
                      selectedIcon,
                      nameCtrl.text.trim(),
                      when,
                      colors[_reminders.length % colors.length],
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
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 28, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.notifications_none_rounded, size: 20, color: c.text0),
              const Gap(8),
              Text('Smart Reminders', style: GoogleFonts.inter(
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
                  child: Text('+ Add', style: GoogleFonts.inter(
                    fontSize: 12, fontWeight: FontWeight.w700, color: GColors.brand,
                  )),
                ),
              ),
            ],
          ),
          const Gap(6),
          Text('We\'ll remind you to order before occasions.',
            style: GoogleFonts.inter(fontSize: 13, color: c.text2, height: 1.4)),
          const Gap(12),
          ..._reminders.map((o) => Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: c.bg1,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: c.border, width: 0.5),
            ),
            child: Row(
              children: [
                Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    color: o.$4.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: o.$4.withValues(alpha: 0.22)),
                  ),
                  child: Icon(o.$1, size: 18, color: o.$4),
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
                    color: o.$4.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: o.$4.withValues(alpha: 0.25)),
                  ),
                  child: Text(o.$3, style: GoogleFonts.inter(
                    fontSize: 10, fontWeight: FontWeight.w600, color: o.$4,
                  )),
                ),
              ],
            ),
          ).animate().fadeIn(delay: 100.ms)),
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

