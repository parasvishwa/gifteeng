import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/widgets/gift_image.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/analytics/analytics_service.dart';
import '../../../../core/state/app_state.dart';
import '../../../../core/services/audio_service.dart';
import '../../../../core/theme/app_theme.dart';
import '../widgets/product_badges.dart';
import '../widgets/video_stories_section.dart';

// ─── Design tokens — mapped to design system ──────────────────────────────────
// NOTE: _k* are now set per-build via GColors.of(context) so the app
// responds to Light / Dark theme changes. See each build() method.
const _kGold      = GColors.gold;

// ─── Mock fallback data ────────────────────────────────────────────────────────

final _kMockCats = [
  {'id': 'personal', 'name': 'Personalized'},
  {'id': 'keys',     'name': 'Key Holders'},
  {'id': 'drink',    'name': 'Drinkware'},
  {'id': 'gifts',    'name': 'Gift Sets'},
  {'id': 'desk',     'name': 'Desk & Daily'},
];

final _kMockProducts = [
  {'id': '1', 'title': 'Hyderabad Magnet',  'categoryName': 'Collectibles', 'basePrice': '179', 'originalPrice': '229', 'rating': '4.9', 'ratingCount': 128, 'tag': 'NEW',     'inStock': true},
  {'id': '2', 'title': 'Owl Key Keeper',    'categoryName': 'Key Holders',  'basePrice': '239', 'originalPrice': '299', 'rating': '4.8', 'ratingCount': 214, 'tag': 'POPULAR', 'inStock': true},
  {'id': '3', 'title': 'Starlit Mug',       'categoryName': 'Drinkware',    'basePrice': '299', 'originalPrice': '349', 'rating': '5.0', 'ratingCount': 96,  'tag': 'TOP',     'inStock': true},
  {'id': '4', 'title': 'Gifteeng Box',      'categoryName': 'Gift Sets',    'basePrice': '499', 'originalPrice': '599', 'rating': '4.6', 'ratingCount': 54,                    'inStock': true},
  {'id': '5', 'title': 'Konkan Memory',     'categoryName': 'Collectibles', 'basePrice': '179', 'originalPrice': '229', 'rating': '4.7', 'ratingCount': 89,                    'inStock': true},
  {'id': '6', 'title': 'Car Key Holder',    'categoryName': 'Key Holders',  'basePrice': '349', 'originalPrice': '399', 'rating': '4.5', 'ratingCount': 143, 'tag': 'HOT',     'inStock': true},
];

// ─── Providers ────────────────────────────────────────────────────────────────

final _categoriesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/categories');
    final data = res.data;
    if (data is List) {
      // Top-level only — sub-categories belong inside the Filters sheet,
      // not in the horizontal pill strip. The previous version showed
      // every category (parents + children) which made the strip
      // dominate the screen and overlap the Collections row beneath.
      final all = List<Map<String, dynamic>>.from(
          data.map((e) => Map<String, dynamic>.from(e as Map)));
      final tops = all.where((c) {
        final pid = c['parentId'] ?? c['parent_id'] ?? c['parent'];
        return pid == null || pid.toString().isEmpty;
      }).toList();
      return tops.isNotEmpty ? tops : all;
    }
    return _kMockCats;
  } catch (_) {
    return _kMockCats;
  }
});

/// Family key: '<catId>|<occasionSlug>|<customisable>|<minPrice>|<maxPrice>|<search>|<sort>'
final _productsProvider = FutureProvider.autoDispose
    .family<List<Map<String, dynamic>>, String>((ref, key) async {
  final parts      = key.split('|');
  final catId      = parts.isNotEmpty ? parts[0] : 'all';
  final occ        = parts.length > 1 ? parts[1] : 'all';
  final customisable = parts.length > 2 ? parts[2] : '';
  final minPrice   = parts.length > 3 ? parts[3] : '';
  final maxPrice   = parts.length > 4 ? parts[4] : '';
  final search     = parts.length > 5 ? parts[5] : '';
  final sort       = parts.length > 6 ? parts[6] : '';
  // Default backend pageSize is 24. The Shop screen is intended to be a
  // browse-everything view, so we explicitly request 100 (the upper bound
  // enforced by the schema) to avoid silent truncation when the catalog
  // grows past 24 products under a given filter — the previous behaviour
  // was the root cause of "I can see this on web but not in the app".
  final qp = <String, String>{'pageSize': '100'};
  if (catId != 'all')          qp['category']       = catId;
  if (occ   != 'all')          qp['tag']            = 'occasion:$occ';
  if (customisable == 'true')  qp['isCustomizable'] = 'true';
  if (minPrice.isNotEmpty)     qp['minPrice']       = minPrice;
  if (maxPrice.isNotEmpty)     qp['maxPrice']       = maxPrice;
  if (search.isNotEmpty)       qp['search']         = search;
  if (sort.isNotEmpty)         qp['sort']           = sort;
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/products', queryParameters: qp);
    final data = res.data;
    List<Map<String, dynamic>> out;
    if (data is List) {
      out = List<Map<String, dynamic>>.from(
          data.map((e) => Map<String, dynamic>.from(e as Map)));
    } else if (data is Map) {
      final items =
          data['items'] ?? data['data'] ?? data['products'] ?? [];
      out = (items is List)
          ? List<Map<String, dynamic>>.from(
              items.map((e) => Map<String, dynamic>.from(e as Map)))
          : _kMockProducts;
    } else {
      out = _kMockProducts;
    }

    // Fallback: if occasion filter returns empty (admin hasn't tagged yet),
    // retry without the occasion tag so users still see products.
    if (out.isEmpty && occ != 'all') {
      final retry = await dio.get('/products',
          queryParameters: {if (catId != 'all') 'category': catId});
      final rData = retry.data;
      if (rData is List) {
        out = List<Map<String, dynamic>>.from(
            rData.map((e) => Map<String, dynamic>.from(e as Map)));
      } else if (rData is Map) {
        final items = rData['items'] ?? rData['data'] ?? rData['products'] ?? [];
        if (items is List) {
          out = List<Map<String, dynamic>>.from(
              items.map((e) => Map<String, dynamic>.from(e as Map)));
        }
      }
    }
    return out;
  } catch (_) {
    return _kMockProducts;
  }
});

/// Fetches the set of product IDs currently in the user's wishlist.
/// Used to initialise ❤️ heart state on product cards without an extra API
/// call per card — one shared request for all cards on the screen.
final _wishlistIdsProvider =
    FutureProvider.autoDispose<Set<String>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/wishlist/ids');
    final data = res.data;
    if (data is List) {
      return Set<String>.from(data.map((e) => e.toString()));
    }
  } catch (_) {}
  return {};
});

/// Lightweight suggestions: returns matching products for a live query string.
/// Separate from _productsProvider so suggestions fire immediately on every
/// character while the main grid is debounced.
final _suggestionsProvider = FutureProvider.autoDispose
    .family<List<Map<String, dynamic>>, String>((ref, query) async {
  final q = query.trim();
  if (q.length < 2) return [];
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/products',
        queryParameters: {'search': q, 'pageSize': '8'});
    final data = res.data;
    List<Map<String, dynamic>> out;
    if (data is List) {
      out = List<Map<String, dynamic>>.from(
          data.map((e) => Map<String, dynamic>.from(e as Map)));
    } else if (data is Map) {
      final raw = data['items'] ?? data['data'] ?? data['products'] ?? [];
      out = (raw is List)
          ? List<Map<String, dynamic>>.from(
              raw.map((e) => Map<String, dynamic>.from(e as Map)))
          : [];
    } else {
      out = [];
    }
    // Client-side safety filter — keep only items whose title/name/tags
    // actually contain the query so we never show unrelated results.
    final ql = q.toLowerCase();
    return out.where((p) {
      final title = (p['title'] ?? p['name'] ?? '').toString().toLowerCase();
      final cat   = (p['categoryName'] ?? p['category'] ?? '').toString().toLowerCase();
      final tags  = (p['tags'] as List?)?.join(' ').toLowerCase() ?? '';
      return title.contains(ql) || cat.contains(ql) || tags.contains(ql);
    }).toList();
  } catch (_) { return []; }
});

// ─── Occasion slug → human label ──────────────────────────────────────────────

String _occasionLabel(String slug) {
  switch (slug) {
    case 'birthday':     return 'Birthday 🎂';
    case 'anniversary':  return 'Anniversary 💍';
    case 'corporate':    return 'Corporate 💼';
    case 'festival':     return 'Festival 🪔';
    case 'housewarming': return 'Housewarming 🏠';
    case 'just-because': return 'Just Because 💝';
  }
  return slug;
}

// ─── Quick-filter chip definitions (mirrors web QuickFilterBar) ───────────────

const _kPriceChips = [
  (label: 'Under ₹199', min: '0',   max: '199'),
  (label: '₹199–₹499',  min: '199', max: '499'),
  (label: '₹499+',      min: '499', max: ''),
];

const _kOccasionChips = [
  (label: 'Birthday',     slug: 'birthday'),
  (label: 'Anniversary',  slug: 'anniversary'),
  (label: 'Corporate',    slug: 'corporate'),
  (label: 'Just Because', slug: 'just-because'),
  (label: 'Wedding',      slug: 'wedding'),
  (label: 'Festive',      slug: 'festive'),
];

const _kSortChips = [
  (label: 'Popular',            value: 'popular'),
  (label: 'Newest',             value: 'newest'),
  (label: 'Price: Low to High', value: 'price_asc'),
  (label: 'Price: High to Low', value: 'price_desc'),
];

// ─── Emoji fallback by category ───────────────────────────────────────────────

String _emojiForCat(String cat) {
  final c = cat.toLowerCase();
  if (c.contains('key'))                        return '🗝️';
  if (c.contains('mug') || c.contains('drink')) return '☕';
  if (c.contains('desk'))                       return '✒️';
  if (c.contains('home') || c.contains('decor'))return '🏠';
  if (c.contains('fashion'))                    return '👜';
  if (c.contains('car'))                        return '🚗';
  if (c.contains('collect'))                    return '🏛️';
  return '🎁';
}

// ─── Badge config ─────────────────────────────────────────────────────────────

class _BadgeCfg {
  final Color fg;
  final Color bg;
  const _BadgeCfg(this.fg, this.bg);
}

_BadgeCfg? _badgeCfg(String? tag) {
  switch (tag?.toUpperCase()) {
    case 'NEW':     return const _BadgeCfg(Color(0xFFEF4781), Color(0xFF4C0519));
    case 'POPULAR': return const _BadgeCfg(Color(0xFFFCBF17), Color(0xFF3D2A00));
    case 'TOP':     return const _BadgeCfg(Color(0xFF34D399), Color(0xFF0A2E26));
    case 'HOT':     return const _BadgeCfg(Color(0xFFFF6B4A), Color(0xFF3D1500));
    case 'SALE':    return const _BadgeCfg(Color(0xFF818CF8), Color(0xFF1E1B4B));
    default:        return null;
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class ShopScreen extends ConsumerStatefulWidget {
  final String? initialCategoryId;
  final String? initialOccasion;
  const ShopScreen({
    super.key,
    this.initialCategoryId,
    this.initialOccasion,
  });

  @override
  ConsumerState<ShopScreen> createState() => _ShopScreenState();
}

class _ShopScreenState extends ConsumerState<ShopScreen> {
  String _activeCatId    = 'all';
  String _activeOccasion = 'all';
  bool   _customisable   = false;
  String _priceMin       = '';
  String _priceMax       = '';
  String _sort           = '';
  final TextEditingController _searchCtrl = TextEditingController();
  String _search     = ''; // debounced — drives product grid API call
  String _liveQuery  = ''; // immediate — drives inline suggestions
  Timer? _debounce;

  String get _key =>
      '$_activeCatId|$_activeOccasion|${_customisable ? 'true' : ''}|$_priceMin|$_priceMax|$_search|$_sort';

  @override
  void initState() {
    super.initState();
    if (widget.initialCategoryId != null) {
      _activeCatId = widget.initialCategoryId!;
    }
    if (widget.initialOccasion != null && widget.initialOccasion!.isNotEmpty) {
      _activeOccasion = widget.initialOccasion!;
    }
    Analytics.screen('/shop', props: {
      if (widget.initialCategoryId != null) 'category': widget.initialCategoryId!,
      if (widget.initialOccasion != null) 'occasion': widget.initialOccasion!,
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final fromCat = ref.read(shopCategoryFilterProvider);
    final fromOcc = ref.read(shopOccasionFilterProvider);
    bool changed = false;
    if (fromCat != 'all' && fromCat != _activeCatId) {
      _activeCatId = fromCat;
      changed = true;
      Future.microtask(
          () => ref.read(shopCategoryFilterProvider.notifier).state = 'all');
    }
    if (fromOcc != 'all' && fromOcc != _activeOccasion) {
      _activeOccasion = fromOcc;
      changed = true;
      Future.microtask(
          () => ref.read(shopOccasionFilterProvider.notifier).state = 'all');
    }
    if (changed) setState(() {});
  }

  int get _activeFilterCount =>
      (_customisable ? 1 : 0) +
      ((_priceMin.isNotEmpty || _priceMax.isNotEmpty) ? 1 : 0) +
      (_activeOccasion != 'all' ? 1 : 0) +
      (_sort.isNotEmpty ? 1 : 0) +
      // Category filter from the strip OR the sheet — was missing entirely
      // so the badge stayed at 0 even after picking a category.
      (_activeCatId != 'all' ? 1 : 0);

  void _showFilters() {
    HapticFeedback.selectionClick();
    final categories = ref.read(_categoriesProvider).valueOrNull ?? const [];
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _FilterSheet(
        customisable:    _customisable,
        priceMin:        _priceMin,
        priceMax:        _priceMax,
        activeOccasion:  _activeOccasion,
        activeCategory:  _activeCatId,
        activeSort:      _sort,
        categories:      categories,
        onApply: (c, pMin, pMax, occ, cat, sort) => setState(() {
          _customisable   = c;
          _priceMin       = pMin;
          _priceMax       = pMax;
          _activeOccasion = occ;
          _activeCatId    = cat;
          _sort           = sort;
        }),
      ),
    );
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  // Client-side safety filter — if the server returns unrelated results
  // (e.g. ignores the search param), we still only show matching items.
  List<Map<String, dynamic>> _applySearch(List<Map<String, dynamic>> items) {
    final q = _search.trim().toLowerCase();
    if (q.isEmpty) return items;
    return items.where((p) {
      final title = (p['title'] ?? p['name'] ?? '').toString().toLowerCase();
      final cat   = (p['categoryName'] ?? p['category'] ?? '').toString().toLowerCase();
      final tags  = (p['tags'] is List)
          ? (p['tags'] as List).join(' ').toLowerCase()
          : p['tags']?.toString().toLowerCase() ?? '';
      final desc  = (p['description'] ?? '').toString().toLowerCase();
      return title.contains(q) || cat.contains(q) ||
             tags.contains(q)  || desc.contains(q);
    }).toList();
  }

  void _selectCat(String id) {
    if (_activeCatId == id) return;
    HapticFeedback.selectionClick();
    AudioService.instance.tap();
    setState(() => _activeCatId = id);
  }

  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kCardBg = _c.bg1;
    final _kImgBg  = _c.bg2;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;
    final topPad = MediaQuery.of(context).padding.top;
    final catsAsync     = ref.watch(_categoriesProvider);
    final productsAsync = ref.watch(_productsProvider(_key));
    final hintNames = catsAsync.valueOrNull
            ?.map((c) => c['name']?.toString() ?? '')
            .where((s) => s.isNotEmpty)
            .toList() ??
        const <String>[];

    return Scaffold(
      backgroundColor: _kBg,
      body: RefreshIndicator(
        color: GColors.brand,
        onRefresh: () async {
          ref.invalidate(_categoriesProvider);
          ref.invalidate(_productsProvider(_key));
          ref.invalidate(_wishlistIdsProvider);
          await ref.read(_productsProvider(_key).future);
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
          slivers: [
          // ── Sticky header + search + pills ────────────────────────────────
          SliverPersistentHeader(
            pinned: true,
            delegate: _StickyHeaderDelegate(
              topPad:            topPad,
              searchCtrl:        _searchCtrl,
              search:            _search,
              hintNames:         hintNames,
              onSearchChanged: (v) {
                setState(() => _liveQuery = v); // instant → suggestions
                _debounce?.cancel();
                _debounce = Timer(const Duration(milliseconds: 380), () {
                  if (mounted) setState(() => _search = v); // debounced → grid
                });
              },
              onSearchClear: () {
                _debounce?.cancel();
                _searchCtrl.clear();
                setState(() { _search = ''; _liveQuery = ''; });
              },
              catsAsync:         catsAsync,
              activeCatId:       _activeCatId,
              onCatSelected:     _selectCat,
              activeFilterCount: _activeFilterCount,
              onFilterTap:       _showFilters,
            ),
          ),

          // ── Inline search suggestions ─────────────────────────────────────
          if (_liveQuery.trim().length >= 2)
            _SearchSuggestionsSliver(
              query:        _liveQuery,
              suggestAsync: ref.watch(_suggestionsProvider(_liveQuery)),
              onTap: (product) {
                final title = (product['title'] ?? product['name'] ?? '').toString();
                _debounce?.cancel();
                _searchCtrl.text = title;
                setState(() { _liveQuery = title; _search = title; });
              },
            ),

          // ── Quick-browse row (moved from Home): Collections + All Categories
          // Sits directly under the search + category strip per the spec.
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Row(children: [
                Expanded(child: _ShopBrowseCard(
                  emoji: '📂',
                  label: 'Collections',
                  sub: 'Curated gift sets',
                  onTap: () => context.push('/collections'),
                )),
                const Gap(12),
                Expanded(child: _ShopBrowseCard(
                  emoji: '🛍️',
                  label: 'All Categories',
                  sub: 'Browse every type',
                  onTap: () => context.push('/categories'),
                )),
              ]),
            ),
          ),

          // ── Video stories carousel (admin-curated, tagged with products) ──
          const SliverToBoxAdapter(child: VideoStoriesSection()),

          // ── Product grid ──────────────────────────────────────────────────
          productsAsync.when(
            loading: () => _buildShimmer(),
            error: (e, _) {
              debugPrint('ShopScreen products error: $e');
              return SliverFillRemaining(
                child: _ErrorBody(
                  onRetry: () =>
                      ref.invalidate(_productsProvider(_key)),
                ),
              );
            },
            data: (products) {
              final filtered = _applySearch(products);
              if (filtered.isEmpty) {
                return SliverFillRemaining(
                  child: _EmptyState(
                    hasFilters: _activeCatId != 'all' ||
                        _activeFilterCount > 0       ||
                        _search.isNotEmpty,
                    onClear: () {
                      _searchCtrl.clear();
                      setState(() {
                        _activeCatId    = 'all';
                        _activeOccasion = 'all';
                        _search         = '';
                        _sort           = '';
                      });
                    },
                  ),
                );
              }
              return SliverPadding(
                padding:
                    const EdgeInsets.fromLTRB(16, 16, 16, 0),
                sliver: SliverGrid(
                  delegate: SliverChildBuilderDelegate(
                    (ctx, i) => _ProductCard(
                        product: filtered[i], index: i),
                    childCount: filtered.length,
                  ),
                  gridDelegate:
                      const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount:   2,
                    mainAxisSpacing:  12,
                    crossAxisSpacing: 12,
                    childAspectRatio: 0.60,
                  ),
                ),
              );
            },
          ),

          const SliverToBoxAdapter(child: SizedBox(height: 100)),
        ],
      ),
      ),
    );
  }

  SliverToBoxAdapter _buildShimmer() {
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
        child: GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate:
              const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount:   2,
            mainAxisSpacing:  12,
            crossAxisSpacing: 12,
            childAspectRatio: 0.60,
          ),
          itemCount: 6,
          itemBuilder: (_, __) => Container(
            decoration: BoxDecoration(
              color:        GColors.bg1,
              borderRadius: const BorderRadius.all(Radius.circular(16)),
            ),
          )
              .animate(onPlay: (c) => c.repeat(reverse: true))
              .shimmer(duration: 1200.ms, color: GColors.bg2),
        ),
      ),
    );
  }
}

// ─── Inline search suggestions sliver ────────────────────────────────────────

class _SearchSuggestionsSliver extends StatelessWidget {
  final String query;
  final AsyncValue<List<Map<String, dynamic>>> suggestAsync;
  final ValueChanged<Map<String, dynamic>> onTap;

  const _SearchSuggestionsSliver({
    required this.query,
    required this.suggestAsync,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final _c     = GColors.of(context);
    const brand  = Color(0xFFEF3752);

    return suggestAsync.when(
      loading: () => SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
          child: Row(children: [
            const SizedBox(width: 14, height: 14,
              child: CircularProgressIndicator(strokeWidth: 2, color: brand)),
            const SizedBox(width: 10),
            Text('Searching…', style: GoogleFonts.inter(
              fontSize: 12, color: _c.text2)),
          ]),
        ),
      ),
      error: (_, __) => const SliverToBoxAdapter(child: SizedBox.shrink()),
      data: (results) {
        if (results.isEmpty) {
          return SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: Text(
                'No products found for "$query"',
                style: GoogleFonts.inter(fontSize: 12, color: _c.text2),
              ),
            ),
          );
        }
        return SliverToBoxAdapter(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
                child: Text(
                  '${results.length} result${results.length == 1 ? '' : 's'} for "$query"',
                  style: GoogleFonts.inter(
                    fontSize: 11, fontWeight: FontWeight.w600,
                    color: _c.text2),
                ),
              ),
              Container(
                margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                decoration: BoxDecoration(
                  color: _c.bg1,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: _c.border),
                ),
                child: Column(
                  children: List.generate(results.length, (i) {
                    final p     = results[i];
                    final title = (p['title'] ?? p['name'] ?? '').toString();
                    final cat   = (p['categoryName'] ?? p['category'] ?? '').toString();
                    final price = (p['basePrice'] ?? p['price'] ?? '').toString();
                    final img   = (p['images'] is List && (p['images'] as List).isNotEmpty)
                        ? (p['images'] as List).first.toString()
                        : (p['imageUrl'] ?? p['image'] ?? '').toString();
                    final isLast = i == results.length - 1;

                    return GestureDetector(
                      onTap: () => onTap(p),
                      behavior: HitTestBehavior.opaque,
                      child: Column(children: [
                        Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 10),
                          child: Row(children: [
                            // Thumbnail
                            ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: img.isNotEmpty
                                  ? Image.network(img,
                                      width: 40, height: 40,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) =>
                                          _SuggestionImgFallback(color: _c.bg2))
                                  : _SuggestionImgFallback(color: _c.bg2),
                            ),
                            const SizedBox(width: 12),
                            // Text
                            Expanded(child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(title,
                                  style: GoogleFonts.inter(
                                    fontSize: 13, fontWeight: FontWeight.w600,
                                    color: _c.text0),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis),
                                if (cat.isNotEmpty)
                                  Text(cat,
                                    style: GoogleFonts.inter(
                                      fontSize: 11, color: _c.text2),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis),
                              ],
                            )),
                            // Price
                            if (price.isNotEmpty)
                              Text('₹$price',
                                style: GoogleFonts.inter(
                                  fontSize: 13, fontWeight: FontWeight.w700,
                                  color: brand)),
                            const SizedBox(width: 4),
                            Icon(Icons.north_west_rounded,
                                size: 14, color: _c.text2),
                          ]),
                        ),
                        if (!isLast)
                          Divider(height: 1, color: _c.border,
                              indent: 64, endIndent: 0),
                      ]),
                    );
                  }),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _SuggestionImgFallback extends StatelessWidget {
  final Color color;
  const _SuggestionImgFallback({required this.color});
  @override
  Widget build(BuildContext context) => Container(
    width: 40, height: 40,
    color: color,
    child: const Icon(Icons.card_giftcard_outlined, size: 20,
        color: Colors.white54),
  );
}

// ─── Sticky header delegate ───────────────────────────────────────────────────

class _StickyHeaderDelegate extends SliverPersistentHeaderDelegate {
  final double topPad;
  final TextEditingController searchCtrl;
  final String search;
  final List<String> hintNames;
  final ValueChanged<String> onSearchChanged;
  final VoidCallback onSearchClear;
  final AsyncValue<List<Map<String, dynamic>>> catsAsync;
  final String activeCatId;
  final ValueChanged<String> onCatSelected;
  // Filter sheet trigger
  final int activeFilterCount;
  final VoidCallback onFilterTap;

  _StickyHeaderDelegate({
    required this.topPad,
    required this.searchCtrl,
    required this.search,
    this.hintNames = const [],
    required this.onSearchChanged,
    required this.onSearchClear,
    required this.catsAsync,
    required this.activeCatId,
    required this.onCatSelected,
    required this.activeFilterCount,
    required this.onFilterTap,
  });

  // Two-line layout: line-icon on top, full label below — replaces the old
  // pill row that crammed an emoji + truncated name on a single 36-px row.
  // Always reserve the strip's height, even before categories load — that
  // way the sticky header doesn't grow / shrink on first render which used
  // to make it briefly overlap the Collections cards beneath it.
  static const double _kPillsHeight = 78;
  double get _pillsH => _kPillsHeight;

  // Tightened from 172 → 110: matches the actual title-row (44) + search-bar
  // (52) + slack now that pills moved to a fixed 78-px block. The old value
  // was leaving an unused 60-px band below the search field.
  @override
  double get minExtent => topPad + 110;

  @override
  double get maxExtent => topPad + 110 + _pillsH;

  @override
  bool shouldRebuild(_StickyHeaderDelegate old) =>
      old.search            != search            ||
      old.activeCatId       != activeCatId       ||
      old.catsAsync         != catsAsync         ||
      old.activeFilterCount != activeFilterCount;

  @override
  Widget build(
      BuildContext context, double shrinkOffset, bool overlapsContent) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kCardBg = _c.bg1;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;
    const brandRed = Color(0xFFEF3752);
    return Container(
      color: _kBg,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(height: topPad),

          // ── Title row ─────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 6, 16, 4),
            child: Row(
              children: [
                Text(
                  'Shop',
                  style: GoogleFonts.inter(
                    fontSize:      28,
                    fontWeight:    FontWeight.w900,
                    color:         _kText0,
                    letterSpacing: -0.5,
                  ),
                ),
                const Spacer(),
                // Filters button
                GestureDetector(
                  onTap: onFilterTap,
                  child: AnimatedContainer(
                    duration: 150.ms,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 7),
                    decoration: BoxDecoration(
                      color: activeFilterCount > 0
                          ? brandRed.withValues(alpha: 0.08)
                          : _kCardBg,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: activeFilterCount > 0
                            ? brandRed
                            : _kBorder,
                        width: 1.5,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.tune_rounded,
                            size: 15,
                            color: activeFilterCount > 0
                                ? brandRed
                                : _kText1),
                        const Gap(5),
                        Text('Filters',
                            style: GoogleFonts.inter(
                              fontSize:   12,
                              fontWeight: FontWeight.w600,
                              color: activeFilterCount > 0
                                  ? brandRed
                                  : _kText1,
                            )),
                        if (activeFilterCount > 0) ...[
                          const Gap(5),
                          Container(
                            width: 16, height: 16,
                            decoration: const BoxDecoration(
                              color: brandRed,
                              shape: BoxShape.circle,
                            ),
                            child: Center(
                              child: Text(
                                '$activeFilterCount',
                                style: const TextStyle(
                                  fontSize:   9,
                                  fontWeight: FontWeight.w800,
                                  color:      Colors.white,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                const Gap(8),
                Builder(builder: (ctx) {
                  return IconButton(
                    onPressed: () => ctx.push('/cart'),
                    icon: Icon(Icons.shopping_bag_outlined,
                        color: _kText0, size: 22),
                    style: IconButton.styleFrom(
                      backgroundColor: _kCardBg,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(color: _kBorder),
                      ),
                      padding: const EdgeInsets.all(10),
                    ),
                  );
                }),
              ],
            ),
          ),

          // ── Search bar ────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Container(
              height: 44,
              decoration: BoxDecoration(
                color:        _kCardBg,
                borderRadius: BorderRadius.circular(12),
                border:       Border.all(color: _kBorder),
              ),
              child: Stack(
                children: [
                  // Real text field (always present)
                  TextField(
                    controller: searchCtrl,
                    onChanged:  onSearchChanged,
                    style: GoogleFonts.inter(fontSize: 14, color: _kText0),
                    decoration: InputDecoration(
                      hintText:  '',
                      prefixIcon: Icon(Icons.search_rounded,
                          color: _kText2, size: 18),
                      suffixIcon: search.isNotEmpty
                          ? IconButton(
                              icon: Icon(Icons.clear_rounded,
                                  size: 16, color: _kText2),
                              onPressed: onSearchClear,
                            )
                          : null,
                      border:         InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                  // Animated cycling hint — visible only when idle & empty
                  if (search.isEmpty)
                    Positioned(
                      left: 44, // after the prefix icon
                      top: 0, bottom: 0,
                      right: 8,
                      child: IgnorePointer(
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: hintNames.isNotEmpty
                              ? _AnimatedSearchHint(hints: hintNames)
                              : Text(
                                  'Search gifts…',
                                  style: GoogleFonts.inter(
                                      fontSize: 14, color: _kText2),
                                  overflow: TextOverflow.ellipsis,
                                ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),

          // ── Category pills ────────────────────────────────────────────
          if (_pillsH > 0)
            SizedBox(
              height: _pillsH,
              child: catsAsync.when(
                loading: () => const SizedBox.shrink(),
                error:   (_, __) => const SizedBox.shrink(),
                data: (cats) {
                  final allItems = <Map<String, dynamic>>[
                    {'id': 'all', 'name': 'All'},
                    ...cats,
                  ];
                  return ListView.separated(
                    padding:         const EdgeInsets.fromLTRB(16, 4, 16, 8),
                    scrollDirection: Axis.horizontal,
                    itemCount:       allItems.length,
                    separatorBuilder: (_, __) => const Gap(14),
                    itemBuilder: (_, i) {
                      final cat   = allItems[i];
                      final id    = (cat['id']  ?? cat['_id']  ?? '').toString();
                      final name  = (cat['name'] ?? id).toString();
                      // Use name as the filter key (matches web ?category=<name>)
                      final filterKey = id == 'all' ? 'all' : name;
                      final emoji = id == 'all' ? '🛍️' : _emojiForCat(name);
                      final sel   = activeCatId == filterKey;
                      return GestureDetector(
                        onTap: () => onCatSelected(filterKey),
                        child: SizedBox(
                          width: 64,
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.start,
                            children: [
                              AnimatedContainer(
                                duration: 200.ms,
                                width: 44,
                                height: 44,
                                decoration: BoxDecoration(
                                  color: sel ? brandRed : _kCardBg,
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: sel ? brandRed : _kBorder,
                                    width: 1.5,
                                  ),
                                  boxShadow: sel
                                      ? [BoxShadow(
                                          color: brandRed.withValues(alpha: 0.3),
                                          blurRadius: 8,
                                          offset: const Offset(0, 2),
                                        )]
                                      : null,
                                ),
                                alignment: Alignment.center,
                                child: Text(emoji,
                                    style: const TextStyle(fontSize: 20)),
                              ),
                              const Gap(6),
                              // Full label with two lines so longer names
                              // (e.g. "Home & Decor") don't get truncated.
                              Text(
                                name,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                textAlign: TextAlign.center,
                                style: GoogleFonts.inter(
                                  fontSize:   10,
                                  height: 1.15,
                                  fontWeight: sel
                                      ? FontWeight.w700
                                      : FontWeight.w500,
                                  color: sel ? brandRed : _kText1,
                                ),
                              ),
                            ],
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
}

// ─── 2-panel filter sheet ─────────────────────────────────────────────────────

class _FilterSheet extends StatefulWidget {
  final bool   customisable;
  final String priceMin;
  final String priceMax;
  final String activeOccasion;
  final String activeCategory;
  final String activeSort;
  final List<Map<String, dynamic>> categories;
  final void Function(
      bool c, String pMin, String pMax, String occ, String cat, String sort)
      onApply;

  const _FilterSheet({
    required this.customisable,
    required this.priceMin,
    required this.priceMax,
    required this.activeOccasion,
    required this.activeCategory,
    required this.activeSort,
    required this.categories,
    required this.onApply,
  });

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late bool   _customisable;
  late String _priceMin;
  late String _priceMax;
  late String _activeOccasion;
  late String _activeCategory;
  late String _activeSort;
  int _sel = 0; // 0=Price 1=Occasion 2=Customisable 3=Sort 4=Category

  @override
  void initState() {
    super.initState();
    _customisable   = widget.customisable;
    _priceMin       = widget.priceMin;
    _priceMax       = widget.priceMax;
    _activeOccasion = widget.activeOccasion;
    _activeCategory = widget.activeCategory;
    _activeSort     = widget.activeSort;
  }

  void _clearAll() => setState(() {
    _customisable   = false;
    _priceMin       = '';
    _priceMax       = '';
    _activeOccasion = 'all';
    _activeCategory = 'all';
    _activeSort     = '';
  });

  @override
  Widget build(BuildContext context) {
    final _c      = GColors.of(context);
    const brand   = Color(0xFFEF3752);
    final bot     = MediaQuery.of(context).padding.bottom;

    final leftItems = [
      ('Price',        _priceMin.isNotEmpty),
      ('Occasion',     _activeOccasion != 'all'),
      ('Customisable', _customisable),
      ('Sort',         _activeSort.isNotEmpty),
      ('Category',     _activeCategory != 'all'),
    ];

    return Container(
      height: MediaQuery.of(context).size.height * 0.72,
      decoration: BoxDecoration(
        color: _c.bg0,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          // ── Handle + title ───────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 12),
            child: Column(
              children: [
                Center(
                  child: Container(
                    width: 36, height: 4,
                    decoration: BoxDecoration(
                      color: _c.border,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const Gap(12),
                Row(
                  children: [
                    Text('Filters',
                        style: GoogleFonts.inter(
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            color: _c.text0)),
                    const Spacer(),
                    GestureDetector(
                      onTap: () => Navigator.pop(context),
                      child: Icon(Icons.close_rounded,
                          size: 20, color: _c.text2),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Divider(height: 1, color: _c.border),

          // ── 2-panel body ──────────────────────────────────────────────
          Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Left rail: filter categories
                SizedBox(
                  width: 130,
                  child: ListView(
                    padding: EdgeInsets.zero,
                    children: leftItems.indexed.map((entry) {
                      final i             = entry.$1;
                      final (label, hasV) = entry.$2;
                      final sel           = _sel == i;
                      return GestureDetector(
                        onTap: () => setState(() => _sel = i),
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 16, vertical: 14),
                          decoration: BoxDecoration(
                            color: sel ? _c.bg1 : Colors.transparent,
                            border: Border(
                              left: BorderSide(
                                color: sel ? brand : Colors.transparent,
                                width: 3,
                              ),
                            ),
                          ),
                          child: Row(
                            mainAxisAlignment:
                                MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(label,
                                    style: GoogleFonts.inter(
                                      fontSize:   13,
                                      fontWeight: sel
                                          ? FontWeight.w700
                                          : FontWeight.w500,
                                      color: sel
                                          ? _c.text0
                                          : _c.text1,
                                    )),
                              ),
                              if (hasV)
                                Container(
                                  width: 7, height: 7,
                                  decoration: const BoxDecoration(
                                    color: brand,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                            ],
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
                VerticalDivider(width: 1, color: _c.border),

                // Right panel: options
                Expanded(
                  child: _buildRightPanel(_c, brand),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: _c.border),

          // ── Footer ────────────────────────────────────────────────────
          Padding(
            padding: EdgeInsets.fromLTRB(20, 10, 20, bot + 12),
            child: Row(
              children: [
                GestureDetector(
                  onTap: _clearAll,
                  child: Text('Clear all',
                      style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: _c.text2)),
                ),
                const Spacer(),
                SizedBox(
                  height: 40,
                  child: ElevatedButton(
                    onPressed: () {
                      widget.onApply(_customisable, _priceMin, _priceMax,
                          _activeOccasion, _activeCategory, _activeSort);
                      Navigator.pop(context);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor:    brand,
                      foregroundColor:    Colors.white,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      elevation: 0,
                    ),
                    child: Text('Show Results',
                        style: GoogleFonts.inter(
                            fontSize: 14, fontWeight: FontWeight.w700)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRightPanel(GColorsPalette palette, Color brand) {
    switch (_sel) {
      case 0: // Price
        return ListView(
          padding: const EdgeInsets.symmetric(vertical: 4),
          children: [
            _optRow('Any price',
                active: _priceMin.isEmpty && _priceMax.isEmpty,
                onTap:  () => setState(() { _priceMin = ''; _priceMax = ''; }),
                palette: palette, brand: brand),
            ..._kPriceChips.map((p) => _optRow(p.label,
                active: _priceMin == p.min && _priceMax == p.max,
                onTap: () => setState(() {
                  final same = _priceMin == p.min && _priceMax == p.max;
                  _priceMin = same ? '' : p.min;
                  _priceMax = same ? '' : p.max;
                }),
                palette: palette, brand: brand)),
          ],
        );
      case 1: // Occasion
        return ListView(
          padding: const EdgeInsets.symmetric(vertical: 4),
          children: [
            _optRow('Any occasion',
                active: _activeOccasion == 'all',
                onTap:  () => setState(() => _activeOccasion = 'all'),
                palette: palette, brand: brand),
            ..._kOccasionChips.map((o) => _optRow(o.label,
                active: _activeOccasion == o.slug,
                onTap: () => setState(() {
                  _activeOccasion =
                      _activeOccasion == o.slug ? 'all' : o.slug;
                }),
                palette: palette, brand: brand)),
          ],
        );
      case 2: // Customisable
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: _optRow('Customisable only',
              active: _customisable,
              onTap:  () => setState(() => _customisable = !_customisable),
              palette: palette, brand: brand),
        );
      case 3: // Sort
        return ListView(
          padding: const EdgeInsets.symmetric(vertical: 4),
          children: [
            _optRow('Default',
                active: _activeSort.isEmpty,
                onTap:  () => setState(() => _activeSort = ''),
                palette: palette, brand: brand),
            ..._kSortChips.map((s) => _optRow(s.label,
                active: _activeSort == s.value,
                onTap: () => setState(() {
                  _activeSort = _activeSort == s.value ? '' : s.value;
                }),
                palette: palette, brand: brand)),
          ],
        );
      case 4: // Category
        final cats = widget.categories;
        return ListView(
          padding: const EdgeInsets.symmetric(vertical: 4),
          children: [
            _optRow('All Categories',
                active: _activeCategory == 'all',
                onTap:  () => setState(() => _activeCategory = 'all'),
                palette: palette, brand: brand),
            ...cats.map((cat) {
              final id   = (cat['id'] ?? cat['_id'] ?? '').toString();
              final name = (cat['name'] ?? '').toString();
              return _optRow(name,
                  active: _activeCategory == id || _activeCategory == name,
                  onTap: () => setState(() {
                    final cur = _activeCategory == id || _activeCategory == name;
                    _activeCategory = cur ? 'all' : (id.isNotEmpty ? id : name);
                  }),
                  palette: palette, brand: brand);
            }),
          ],
        );
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _optRow(
    String label, {
    required bool active,
    required VoidCallback onTap,
    required GColorsPalette palette,
    required Color brand,
  }) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Expanded(
              child: Text(label,
                  style: GoogleFonts.inter(
                    fontSize:   13,
                    fontWeight: active
                        ? FontWeight.w600
                        : FontWeight.w400,
                    color: active ? palette.text0 : palette.text1,
                  )),
            ),
            AnimatedContainer(
              duration: 150.ms,
              width: 20, height: 20,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: active ? brand : Colors.transparent,
                border: Border.all(
                  color: active ? brand : palette.border,
                  width: active ? 0 : 1.5,
                ),
              ),
              child: active
                  ? const Icon(Icons.check_rounded,
                      size: 12, color: Colors.white)
                  : null,
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Product card ─────────────────────────────────────────────────────────────

class _ProductCard extends ConsumerStatefulWidget {
  final Map<String, dynamic> product;
  final int index;
  const _ProductCard({required this.product, required this.index});

  @override
  ConsumerState<_ProductCard> createState() => _ProductCardState();
}

class _ProductCardState extends ConsumerState<_ProductCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _scaleCtrl;
  late final Animation<double> _scaleAnim;

  @override
  void initState() {
    super.initState();
    _scaleCtrl = AnimationController(
      vsync:      this,
      lowerBound: 0.94,
      upperBound: 1.0,
      value:      1.0,
      duration:   120.ms,
    );
    _scaleAnim = _scaleCtrl;
  }

  /// After the user first taps the heart we own the state locally.
  /// Before that, [_wishlistIdsProvider] drives the display value.
  bool _initialized = false;
  bool _wishlisted  = false;

  Future<void> _toggleWishlistApi(String productId, bool add) async {
    try {
      final dio = ref.read(dioProvider);
      if (add) {
        await dio.post('/wishlist/items', data: {'productId': productId});
      } else {
        await dio.delete('/wishlist/items/$productId');
      }
    } catch (_) {
      // Revert the optimistic toggle on failure and notify user.
      if (mounted) {
        setState(() => _wishlisted = !_wishlisted); // revert
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Could not update wishlist. Please try again.',
            style: GoogleFonts.inter(fontWeight: FontWeight.w500)),
          behavior: SnackBarBehavior.floating,
          duration: const Duration(milliseconds: 2000),
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 80),
          backgroundColor: const Color(0xFFDC2626),
          shape: const RoundedRectangleBorder(
              borderRadius: BorderRadius.all(Radius.circular(12))),
        ));
      }
    }
  }

  @override
  void dispose() {
    _scaleCtrl.dispose();
    super.dispose();
  }

  void _onTapDown(TapDownDetails _) => _scaleCtrl.reverse();
  void _onTapUp(TapUpDetails _) {
    _scaleCtrl.forward();
    HapticFeedback.selectionClick();
    AudioService.instance.tap();
    final p    = widget.product;
    final slug = (p['slug'] ?? p['id'] ?? '').toString();
    if (slug.isNotEmpty && mounted) {
      context.push('/shop/$slug');
    }
  }
  void _onTapCancel() => _scaleCtrl.forward();

  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kCardBg = _c.bg1;
    final _kImgBg  = _c.bg2;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;
    final p             = widget.product;

    // ── Wishlist state: server-sourced until user first taps ─────────────
    final _productId = (p['id'] ?? p['_id'] ?? p['productId'] ?? '').toString();
    final _wishAsync = ref.watch(_wishlistIdsProvider);
    final isWishlisted = _initialized
        ? _wishlisted
        : (_wishAsync.valueOrNull?.contains(_productId) ?? false);

    final title         = (p['title']        ?? p['name']  ?? '') as String;
    final catName       = (p['categoryName'] ?? p['category'] ?? '') as String;
    final basePrice     = (p['basePrice']    ?? p['price'] ?? '0').toString();
    final originalPrice = (p['originalPrice']?? p['comparePrice'] ?? '').toString();
    final ratingRaw     = (p['rating']       ?? '').toString();
    final ratingCount   = (p['ratingCount']  as num?)?.toInt() ?? 0;
    final tag           = (p['tag']          as String?);
    final images        = p['images'] as List?;
    final firstImage    = (images != null && images.isNotEmpty)
        ? images.first
        : null;

    final price    = double.tryParse(basePrice)    ?? 0;
    final origP    = double.tryParse(originalPrice) ?? 0;
    final hasOrig  = origP > price && origP > 0;
    final ratingD  = double.tryParse(ratingRaw);
    final badge          = _badgeCfg(tag);
    final emoji          = _emojiForCat(catName);
    final isCustomizable = p['isCustomizable'] == true ||
        p['customizable'] == true;

    return GestureDetector(
      onTapDown:   _onTapDown,
      onTapUp:     _onTapUp,
      onTapCancel: _onTapCancel,
      child: AnimatedBuilder(
        animation: _scaleAnim,
        builder: (ctx, child) =>
            Transform.scale(scale: _scaleAnim.value, child: child),
        child: Container(
          decoration: BoxDecoration(
            color:        _kCardBg,
            borderRadius: const BorderRadius.all(Radius.circular(16)),
            border: Border.all(color: _kBorder, width: 1),
            boxShadow: [
              BoxShadow(
                color:      Colors.black.withValues(alpha: 0.07),
                blurRadius: 10,
                offset:     const Offset(0, 3),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── 1:1 square image ────────────────────────────────────
              AspectRatio(
                aspectRatio: 1,
                child: ClipRRect(
                  borderRadius: const BorderRadius.only(
                    topLeft:  Radius.circular(16),
                    topRight: Radius.circular(16),
                  ),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      // Background
                      Container(color: _kImgBg),

                      // Image or emoji fallback
                      if (firstImage != null)
                        GiftImage(src: firstImage, fit: BoxFit.cover)
                      else
                        Center(
                          child: Text(emoji,
                              style: const TextStyle(fontSize: 44)),
                        ),

                      // Dynamic badge stack top-left — NEW / TRENDING / LOW STOCK etc.
                      Positioned(
                        top: 6, left: 6, right: 42,
                        child: ProductBadgeRow(
                          product: widget.product,
                          maxBadges: 2,
                          compact: true,
                        ),
                      ),

                      // Heart top-right (wishlist toggle)
                      Positioned(
                        top: 6, right: 6,
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () {
                            HapticFeedback.lightImpact();
                            AudioService.instance.tap();
                            final newVal = !isWishlisted;
                            setState(() {
                              _initialized = true;
                              _wishlisted  = newVal;
                            });
                            // Fire-and-forget API call (reverts on error)
                            if (_productId.isNotEmpty) {
                              _toggleWishlistApi(_productId, newVal);
                            }
                            ScaffoldMessenger.of(context)
                              ..clearSnackBars()
                              ..showSnackBar(SnackBar(
                              content: Text(
                                newVal ? '❤️  Added to wishlist' : 'Removed from wishlist',
                                style: GoogleFonts.inter(fontWeight: FontWeight.w500),
                              ),
                              behavior: SnackBarBehavior.floating,
                              duration: const Duration(milliseconds: 1200),
                              margin: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                              backgroundColor: _kCardBg,
                              shape: const RoundedRectangleBorder(
                                borderRadius: BorderRadius.all(
                                    Radius.circular(12)),
                              ),
                            ));
                          },
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 180),
                            width: 28, height: 28,
                            decoration: BoxDecoration(
                              color: isWishlisted
                                  ? const Color(0xFFEF4444).withOpacity(0.95)
                                  : Colors.black.withOpacity(0.45),
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(
                                color: isWishlisted
                                    ? const Color(0xFFEF4444)
                                    : Colors.white.withOpacity(0.25)),
                            ),
                            child: Center(
                              child: Icon(
                                isWishlisted ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                                size: 14,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // ── Info area ───────────────────────────────────────────
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Product name — at top
                      Text(
                        title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.inter(
                          fontSize:   13,
                          fontWeight: FontWeight.w700,
                          color:      _kText0,
                          height:     1.3,
                        ),
                      ),

                      const Gap(4),

                      // Rating + order count row
                      Row(
                        children: [
                          if (ratingD != null) ...[
                            const Icon(Icons.star_rounded,
                                size: 11, color: Color(0xFFFCBF17)),
                            const Gap(2),
                            Text(ratingD.toStringAsFixed(1),
                                style: GoogleFonts.inter(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: _kText1)),
                            const Gap(4),
                          ],
                          if (ratingCount > 0)
                            Text(
                              '(${ratingCount}+ orders)',
                              style: GoogleFonts.inter(
                                  fontSize: 10,
                                  color: _kText2),
                              overflow: TextOverflow.ellipsis,
                            ),
                          if (ratingD == null && ratingCount == 0)
                            Text(
                              'Free delivery',
                              style: GoogleFonts.inter(
                                  fontSize: 10,
                                  color: const Color(0xFF10B981),
                                  fontWeight: FontWeight.w600),
                            ),
                        ],
                      ),

                      const Spacer(),

                      // Price row
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          Text(
                            '₹${price.toInt()}',
                            style: GoogleFonts.inter(
                              fontSize:   15,
                              fontWeight: FontWeight.w900,
                              color:      _kText0,
                            ),
                          ),
                          if (hasOrig) ...[
                            const Gap(5),
                            Text(
                              '₹${origP.toInt()}',
                              style: GoogleFonts.inter(
                                fontSize: 10, color: _kText2,
                                decoration: TextDecoration.lineThrough,
                                decorationColor: _kText2,
                              ),
                            ),
                          ],
                        ],
                      ),

                      const Gap(8),

                      // ADD / CUSTOMISE — full width, always visible
                      GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () {
                          HapticFeedback.lightImpact();
                          AudioService.instance.tap();
                          final slug =
                              (p['slug'] ?? p['id'] ?? '').toString();
                          if (slug.isNotEmpty && mounted) {
                            context.push('/shop/$slug');
                          }
                        },
                        child: Container(
                          height: 30,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                                color: GColors.brand, width: 1.5),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black
                                    .withValues(alpha: 0.08),
                                blurRadius: 4,
                                offset: const Offset(0, 1),
                              ),
                            ],
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                isCustomizable
                                    ? Icons.auto_fix_high_rounded
                                    : Icons.shopping_bag_outlined,
                                size: 13, color: GColors.brand,
                              ),
                              const Gap(4),
                              Text(
                                isCustomizable ? 'CUSTOMISE' : 'ADD',
                                style: GoogleFonts.inter(
                                  fontSize:   11,
                                  fontWeight: FontWeight.w900,
                                  color:      GColors.brand,
                                  letterSpacing: 0.3,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    )
        .animate(delay: (widget.index * 40).ms)
        .fadeIn(duration: 350.ms)
        .slideY(begin: 0.06, end: 0);
  }
}

// ─── Empty state ──────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  final bool hasFilters;
  final VoidCallback onClear;
  const _EmptyState({required this.hasFilters, required this.onClear});

  @override
  Widget build(BuildContext context) {
    final _kText0 = GColors.of(context).text0;
    final _kText2 = GColors.of(context).text2;
    return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('🔍', style: TextStyle(fontSize: 52)),
            const Gap(16),
            Text(
              'No gifts found',
              style: GoogleFonts.inter(
                fontSize:   18,
                fontWeight: FontWeight.w700,
                color:      _kText0,
              ),
            ),
            const Gap(6),
            Text(
              'Try a different search or category',
              style: GoogleFonts.inter(fontSize: 14, color: _kText2),
            ),
            if (hasFilters) ...[
              const Gap(20),
              GestureDetector(
                onTap: onClear,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 10),
                  decoration: BoxDecoration(
                    color:        _kGold,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    'Clear Filters',
                    style: GoogleFonts.inter(
                      fontSize:   13,
                      fontWeight: FontWeight.w700,
                      color:      Colors.black,
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      );
  }
}

// ─── Error body ───────────────────────────────────────────────────────────────

class _ErrorBody extends StatelessWidget {
  final VoidCallback onRetry;
  const _ErrorBody({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final _kText0 = GColors.of(context).text0;
    return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('😕', style: TextStyle(fontSize: 48)),
            const Gap(12),
            Text(
              'Could not load products',
              style: GoogleFonts.inter(
                fontSize:   16,
                fontWeight: FontWeight.w600,
                color:      _kText0,
              ),
            ),
            const Gap(12),
            GestureDetector(
              onTap: onRetry,
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color:        _kGold,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  'Retry',
                  style: GoogleFonts.inter(
                    fontSize:   13,
                    fontWeight: FontWeight.w700,
                    color:      Colors.black,
                  ),
                ),
              ),
            ),
          ],
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
    final _c = GColors.of(context);
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 200),
      opacity: _visible ? 1.0 : 0.0,
      child: RichText(
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        text: TextSpan(
          style: GoogleFonts.inter(fontSize: 14, color: _c.text2),
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


// ─── Shop browse card (Collections + All Categories) ──────────────────────────
// Mirrors the previous _BrowseCard from Home — moved here so the navigation
// shortcuts live alongside the search/filter UI instead of cluttering the
// home discovery feed.

class _ShopBrowseCard extends StatelessWidget {
  final String emoji, label, sub;
  final VoidCallback onTap;
  const _ShopBrowseCard({
    required this.emoji, required this.label, required this.sub,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: c.bg1,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: c.border),
        ),
        child: Row(children: [
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
        ]),
      ),
    );
  }
}

