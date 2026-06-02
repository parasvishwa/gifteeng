// ─── Global search screen ────────────────────────────────────────────────────
//
// Idle state (no query typed yet) shows three personalised product strips:
//   1. Recently Viewed  — products the user has tapped recently (local prefs)
//   2. Curated for You  — backend personalised/recommended picks
//   3. Recently Bought  — products from the last few delivered orders
//
// Below those strips the classic text-chip area (recent searches + trending +
// popular) is preserved so there's always something to tap.
//
// Active state (query ≥ 2 chars) shows live search results exactly as before.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../../core/analytics/analytics_service.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/gift_image.dart';

// ─── Storage keys ─────────────────────────────────────────────────────────────

const _kRecentKey  = 'search.recent.v1';   // recent TEXT searches
const _kViewedKey  = 'search.viewed.v2';   // recently viewed products (JSON)
const _kMaxRecent  = 10;
const _kMaxViewed  = 20;

// ─── Recently-viewed product store ───────────────────────────────────────────
// Each entry: {slug, title, price, image}
// Written every time the user navigates to a product detail page from search.

class SearchViewedStore {
  static Future<List<Map<String, dynamic>>> read() async {
    try {
      final sp  = await SharedPreferences.getInstance();
      final raw = sp.getString(_kViewedKey);
      if (raw == null) return [];
      final list = jsonDecode(raw) as List;
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<void> record(Map<String, dynamic> product) async {
    try {
      final slug  = (product['slug'] ?? '').toString();
      if (slug.isEmpty) return;
      final title = (product['title'] ?? product['name'] ?? '').toString();
      final price = product['basePrice'] ?? product['price'] ?? 0;
      final imgs  = product['images'];
      String? image;
      if (imgs is List && imgs.isNotEmpty) {
        final first = imgs.first;
        if (first is String) image = first;
        if (first is Map)    image = (first['url'] ?? first['src']) as String?;
      }

      final entry = <String, dynamic>{
        'slug':  slug,
        'title': title,
        'price': price,
        'image': image,
      };

      final existing = await read();
      final updated  = [entry, ...existing.where((e) => e['slug'] != slug)]
          .take(_kMaxViewed)
          .toList();
      final sp = await SharedPreferences.getInstance();
      await sp.setString(_kViewedKey, jsonEncode(updated));
    } catch (_) {}
  }
}

// ─── Providers ────────────────────────────────────────────────────────────────

/// Recently viewed products (local, from SharedPreferences).
final _viewedProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  return SearchViewedStore.read();
});

/// Personalised / curated picks from the backend.
final _curatedProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final dio = ref.watch(dioProvider);
  for (final params in [
    {'pageSize': 12, 'personalized': 'true', 'status': 'active'},
    {'pageSize': 12, 'sort': 'recommended',  'status': 'active'},
    {'pageSize': 12, 'sort': 'popular',      'status': 'active'},
  ]) {
    try {
      final res  = await dio.get('/products', queryParameters: params);
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

/// Products from recent orders — extracts the product objects from order items.
final _boughtProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final dio = ref.watch(dioProvider);
  try {
    final res  = await dio.get('/orders', queryParameters: {
      'pageSize': 10,
      'sort':     'recent',
    });
    final data  = res.data;
    final orders = data is Map
        ? List.from(data['items'] ?? data['orders'] ?? [])
        : data is List
            ? List.from(data)
            : [];
    final seen    = <String>{};
    final products = <Map<String, dynamic>>[];
    for (final order in orders) {
      if (order is! Map) continue;
      final items = (order['items'] ?? order['orderItems'] ?? []) as List;
      for (final item in items) {
        if (item is! Map) continue;
        // Backend may nest the product under item.product or item itself
        final p = (item['product'] as Map?)?.cast<String, dynamic>() ??
                  item.cast<String, dynamic>();
        final slug = (p['slug'] ?? p['productSlug'] ?? '').toString();
        if (slug.isEmpty || seen.contains(slug)) continue;
        seen.add(slug);
        products.add({
          'slug':  slug,
          'title': (p['title'] ?? p['name'] ?? item['name'] ?? '').toString(),
          'price': p['basePrice'] ?? p['price'] ?? item['price'] ?? 0,
          'image': _firstImage(p) ?? _firstImage(item),
        });
        if (products.length >= 12) break;
      }
      if (products.length >= 12) break;
    }
    return products;
  } catch (_) {
    return [];
  }
});

String? _firstImage(Map m) {
  final imgs = m['images'];
  if (imgs is List && imgs.isNotEmpty) {
    final first = imgs.first;
    if (first is String) return first;
    if (first is Map)    return (first['url'] ?? first['src']) as String?;
  }
  final img = m['imageUrl'] ?? m['image'] ?? m['thumbnail'];
  if (img is String && img.isNotEmpty) return img;
  return null;
}

/// Seed suggestions when the user has no history yet.
const _kPopular = [
  'Anniversary gift',
  'Birthday hamper',
  'Corporate combo',
  'Diwali hampers',
  'Personalized mug',
  'Photo frame',
  'Wedding gift',
  'Under ₹500',
];

// ─── Screen ───────────────────────────────────────────────────────────────────

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final TextEditingController _ctrl  = TextEditingController();
  final FocusNode             _focus = FocusNode();
  Timer? _debounce;

  String _query = '';
  List<Map<String, dynamic>> _results = [];
  bool _loading = false;
  List<String> _recent = [];
  bool _voiceChecked = false;

  @override
  void initState() {
    super.initState();
    _loadRecent();
    Analytics.screen('/search');
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_voiceChecked) {
      _voiceChecked = true;
      final extra = GoRouterState.of(context).extra;
      if (extra is Map && extra['voice'] == true) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('🎤 Voice search coming soon!'),
              duration: const Duration(seconds: 2),
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          );
        });
      }
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  // ── Recent search text ─────────────────────────────────────────────────────

  Future<void> _loadRecent() async {
    final sp  = await SharedPreferences.getInstance();
    final raw = sp.getString(_kRecentKey);
    if (raw == null) return;
    try {
      final list = jsonDecode(raw) as List;
      if (!mounted) return;
      setState(() => _recent = list.map((e) => e.toString()).toList());
    } catch (_) {}
  }

  Future<void> _saveRecent(String q) async {
    final cleaned = q.trim();
    if (cleaned.isEmpty) return;
    final updated = [cleaned, ..._recent.where((e) => e != cleaned)]
        .take(_kMaxRecent)
        .toList();
    _recent = updated;
    try {
      final sp = await SharedPreferences.getInstance();
      await sp.setString(_kRecentKey, jsonEncode(updated));
    } catch (_) {}
  }

  Future<void> _clearRecent() async {
    setState(() => _recent = []);
    final sp = await SharedPreferences.getInstance();
    await sp.remove(_kRecentKey);
  }

  // ── Query & search ─────────────────────────────────────────────────────────

  void _onChanged(String value) {
    setState(() => _query = value);
    _debounce?.cancel();
    if (value.trim().length < 2) {
      setState(() { _results = []; _loading = false; });
      return;
    }
    setState(() => _loading = true);
    _debounce = Timer(
        const Duration(milliseconds: 300), () => _runSearch(value.trim()));
  }

  Future<void> _runSearch(String q) async {
    Analytics.track('search_query', {'q': q, 'len': q.length});
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.get('/products', queryParameters: {
        'search':   q,
        'pageSize': 20,
        'status':   'active',
      });
      if (!mounted) return;
      final data = res.data;
      final items = data is Map
          ? List<Map<String, dynamic>>.from(data['items'] ?? [])
          : data is List
              ? List<Map<String, dynamic>>.from(data)
              : <Map<String, dynamic>>[];
      setState(() { _results = items; _loading = false; });
    } catch (_) {
      if (!mounted) return;
      setState(() { _results = []; _loading = false; });
    }
  }

  void _submit(String q) {
    final cleaned = q.trim();
    if (cleaned.isEmpty) return;
    _saveRecent(cleaned);
    _ctrl.text = cleaned;
    _onChanged(cleaned);
  }

  void _tapProduct(Map<String, dynamic> product, {String? overrideSlug}) {
    final slug = overrideSlug
        ?? (product['slug'] ?? '').toString();
    if (slug.isEmpty) return;
    Analytics.track('search_product_tap', {'slug': slug, 'query': _query});
    _saveRecent(_query);
    SearchViewedStore.record(product);   // persist for next visit
    context.push('/shop/$slug');
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Scaffold(
      backgroundColor: c.bg0,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(c),
            Expanded(
              child: _query.trim().length < 2
                  ? _buildIdleScreen(c)
                  : _loading
                      ? _buildLoading()
                      : _results.isEmpty
                          ? _buildEmpty(c)
                          : _buildResults(),
            ),
          ],
        ),
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Search bar header
  // ─────────────────────────────────────────────────────────────────────────────

  Widget _buildHeader(GColorsPalette c) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(6, 8, 14, 10),
      child: Row(
        children: [
          IconButton(
            icon: Icon(Icons.arrow_back_rounded, color: c.text0),
            onPressed: () => Navigator.of(context).maybePop(),
          ),
          Expanded(
            child: Container(
              height: 46,
              decoration: BoxDecoration(
                color: c.bg1,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: c.border),
              ),
              child: Row(
                children: [
                  const Gap(12),
                  Icon(Icons.search_rounded, size: 20, color: c.text2),
                  const Gap(8),
                  Expanded(
                    child: TextField(
                      controller:      _ctrl,
                      focusNode:       _focus,
                      textInputAction: TextInputAction.search,
                      onChanged:       _onChanged,
                      onSubmitted:     _submit,
                      style: GoogleFonts.inter(
                        fontSize: 14, color: c.text0,
                        fontWeight: FontWeight.w500,
                      ),
                      decoration: InputDecoration(
                        hintText: 'Search gifts, categories, occasions…',
                        hintStyle: GoogleFonts.inter(
                          fontSize: 13, color: c.text2,
                          fontWeight: FontWeight.w400,
                        ),
                        border:         InputBorder.none,
                        isCollapsed:    true,
                        contentPadding: EdgeInsets.zero,
                      ),
                    ),
                  ),
                  if (_query.isNotEmpty)
                    IconButton(
                      icon: Icon(Icons.close_rounded, size: 18, color: c.text2),
                      onPressed: () {
                        HapticFeedback.selectionClick();
                        Analytics.track('search_clear');
                        _ctrl.clear();
                        _onChanged('');
                      },
                    )
                  else
                    const Gap(12),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Idle screen: personalised product strips + chip suggestions
  // ─────────────────────────────────────────────────────────────────────────────

  Widget _buildIdleScreen(GColorsPalette c) {
    final viewedAsync  = ref.watch(_viewedProvider);
    final curatedAsync = ref.watch(_curatedProvider);
    final boughtAsync  = ref.watch(_boughtProvider);

    return ListView(
      padding: const EdgeInsets.only(bottom: 32),
      children: [
        // ── 1. Recently Viewed ──────────────────────────────────────────────
        viewedAsync.when(
          loading: () => const SizedBox.shrink(),
          error:   (_, __) => const SizedBox.shrink(),
          data: (items) => items.isEmpty
              ? const SizedBox.shrink()
              : _ProductStrip(
                  title:    'Recently Viewed',
                  icon:     Icons.history_rounded,
                  products: items,
                  onTap:    (p) => _tapProduct(p, overrideSlug: p['slug'] as String?),
                ).animate().fadeIn(duration: 300.ms),
        ),

        // ── 2. Curated for You ──────────────────────────────────────────────
        curatedAsync.when(
          loading: () => _ProductStripSkeleton(title: 'Curated for You ✨'),
          error:   (_, __) => const SizedBox.shrink(),
          data: (items) => items.isEmpty
              ? const SizedBox.shrink()
              : _ProductStrip(
                  title:    'Curated for You ✨',
                  products: items,
                  onTap:    _tapProduct,
                ).animate().fadeIn(duration: 300.ms, delay: 80.ms),
        ),

        // ── 3. Recently Bought ──────────────────────────────────────────────
        boughtAsync.when(
          loading: () => const SizedBox.shrink(),
          error:   (_, __) => const SizedBox.shrink(),
          data: (items) => items.isEmpty
              ? const SizedBox.shrink()
              : _ProductStrip(
                  title:    'Buy Again 🛍️',
                  products: items,
                  onTap:    (p) => _tapProduct(p, overrideSlug: p['slug'] as String?),
                ).animate().fadeIn(duration: 300.ms, delay: 160.ms),
        ),

        // ── Divider before text chips ───────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
          child: Container(
            height: 1,
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [
                Colors.transparent,
                c.border,
                Colors.transparent,
              ]),
            ),
          ),
        ),

        // ── Recent text searches ────────────────────────────────────────────
        if (_recent.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Row(children: [
              Text('Recent searches', style: GoogleFonts.inter(
                fontSize: 12, fontWeight: FontWeight.w700, color: c.text1)),
              const Spacer(),
              GestureDetector(
                onTap: _clearRecent,
                child: Text('Clear', style: GoogleFonts.inter(
                  fontSize: 12, fontWeight: FontWeight.w600,
                  color: GColors.brand)),
              ),
            ]),
          ),
          const Gap(10),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Wrap(
              spacing: 8, runSpacing: 8,
              children: _recent
                  .map((q) => _chip(q, c, icon: Icons.history_rounded,
                        onTap: () => _submit(q)))
                  .toList(),
            ),
          ),
          const Gap(20),
        ],

        // ── Trending occasions ──────────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
          child: Text('Trending occasions', style: GoogleFonts.inter(
            fontSize: 12, fontWeight: FontWeight.w700, color: c.text1)),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Wrap(
            spacing: 8, runSpacing: 8,
            children: [
              'Birthday', 'Anniversary', "Mother's Day",
              'Wedding', 'Diwali', 'Corporate',
            ].map((q) => _chip(q, c, icon: Icons.local_fire_department_outlined,
                  onTap: () => _submit(q))).toList(),
          ),
        ),
        const Gap(20),

        // ── Popular searches ────────────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
          child: Text('Popular searches', style: GoogleFonts.inter(
            fontSize: 12, fontWeight: FontWeight.w700, color: c.text1)),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Wrap(
            spacing: 8, runSpacing: 8,
            children: _kPopular
                .map((q) => _chip(q, c, icon: Icons.trending_up_rounded,
                      onTap: () => _submit(q)))
                .toList(),
          ),
        ),
      ],
    );
  }

  Widget _chip(String label, GColorsPalette c,
      {required VoidCallback onTap, required IconData icon}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: c.bg1,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: c.border),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 13, color: c.text2),
          const Gap(6),
          Text(label, style: GoogleFonts.inter(
            fontSize: 12, fontWeight: FontWeight.w600, color: c.text0)),
        ]),
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Loading / empty / results
  // ─────────────────────────────────────────────────────────────────────────────

  Widget _buildLoading() => const Center(
    child: SizedBox(
      height: 24, width: 24,
      child: CircularProgressIndicator(
          strokeWidth: 2.5,
          valueColor: AlwaysStoppedAnimation(GColors.brand)),
    ),
  );

  Widget _buildEmpty(GColorsPalette c) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text('🔍', style: TextStyle(fontSize: 42)),
        const Gap(10),
        Text('No matches for "$_query"', style: GoogleFonts.inter(
          fontSize: 14, fontWeight: FontWeight.w700, color: c.text0)),
        const Gap(4),
        Text('Try a different keyword or browse the shop',
          style: GoogleFonts.inter(fontSize: 12, color: c.text2)),
      ],
    ),
  );

  Widget _buildResults() {
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      itemCount: _results.length,
      separatorBuilder: (_, __) => const Gap(10),
      itemBuilder: (_, i) {
        final p = _results[i];
        return _ResultRow(
          product: p,
          onTap: () => _tapProduct(p),
        )
            .animate()
            .fadeIn(delay: (i * 25).ms, duration: 200.ms)
            .slideX(begin: 0.05, end: 0);
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Horizontal product strip
// ─────────────────────────────────────────────────────────────────────────────

class _ProductStrip extends StatelessWidget {
  final String title;
  final IconData? icon;
  final List<Map<String, dynamic>> products;
  final void Function(Map<String, dynamic>) onTap;

  const _ProductStrip({
    required this.title,
    required this.products,
    required this.onTap,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Section header
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
          child: Row(children: [
            if (icon != null) ...[
              Icon(icon, size: 16, color: c.text1),
              const Gap(6),
            ],
            Text(title, style: GoogleFonts.inter(
              fontSize: 14, fontWeight: FontWeight.w800, color: c.text0)),
          ]),
        ),

        // Horizontal scroll of product cards
        SizedBox(
          height: 200,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: products.length,
            itemBuilder: (_, i) => Padding(
              padding: const EdgeInsets.only(right: 12),
              child: _SearchProductCard(
                product: products[i],
                onTap: () => onTap(products[i]),
              ).animate()
                  .fadeIn(delay: (i * 30).ms, duration: 250.ms)
                  .slideX(begin: 0.08, end: 0),
            ),
          ),
        ),
      ],
    );
  }
}

// ─── Single product card in search strips ─────────────────────────────────────

class _SearchProductCard extends StatefulWidget {
  final Map<String, dynamic> product;
  final VoidCallback onTap;
  const _SearchProductCard({required this.product, required this.onTap});

  @override
  State<_SearchProductCard> createState() => _SearchProductCardState();
}

class _SearchProductCardState extends State<_SearchProductCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final c      = GColors.of(context);
    final p      = widget.product;
    final title  = (p['title'] ?? p['name'] ?? 'Gift').toString();
    final price  = p['basePrice'] ?? p['price'] ?? 0;
    final images = p['images'];
    dynamic firstImg;
    if (images is List && images.isNotEmpty) {
      firstImg = images.first;
    } else {
      firstImg = p['image'] ?? p['imageUrl'] ?? p['thumbnail'];
    }

    return GestureDetector(
      onTapDown:   (_) => setState(() => _pressed = true),
      onTapUp:     (_) { setState(() => _pressed = false); widget.onTap(); },
      onTapCancel: ()  => setState(() => _pressed = false),
      child: AnimatedScale(
        scale:    _pressed ? 0.95 : 1.0,
        duration: 110.ms,
        child: SizedBox(
          width: 130,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Square image
              Container(
                height: 130, width: 130,
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  color: c.bg1,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: c.border, width: 1),
                ),
                child: firstImg != null
                    ? GiftImage(src: firstImg, fit: BoxFit.cover)
                    : Center(child: Text('🎁',
                        style: const TextStyle(fontSize: 36))),
              ),
              const Gap(8),
              // Title
              Text(title,
                maxLines: 2, overflow: TextOverflow.ellipsis,
                style: GoogleFonts.inter(
                  fontSize: 11, fontWeight: FontWeight.w600,
                  color: c.text0, height: 1.3)),
              const Gap(3),
              // Price
              Text('₹${_fmt(price)}',
                style: GoogleFonts.inter(
                  fontSize: 12, fontWeight: FontWeight.w800,
                  color: c.text0)),
            ],
          ),
        ),
      ),
    );
  }

  String _fmt(dynamic v) {
    if (v is num) return v.toInt().toString();
    return v.toString();
  }
}

// ─── Skeleton strip while curated loads ───────────────────────────────────────

class _ProductStripSkeleton extends StatelessWidget {
  final String title;
  const _ProductStripSkeleton({required this.title});

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
          child: Container(
            width: 160, height: 14,
            decoration: BoxDecoration(
              color: c.bg1, borderRadius: BorderRadius.circular(6)),
          ),
        ),
        SizedBox(
          height: 200,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: 5,
            itemBuilder: (_, __) => Padding(
              padding: const EdgeInsets.only(right: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    height: 130, width: 130,
                    decoration: BoxDecoration(
                      color: c.bg1,
                      borderRadius: BorderRadius.circular(14)),
                  ),
                  const Gap(8),
                  Container(
                    width: 90, height: 10,
                    decoration: BoxDecoration(
                      color: c.bg1,
                      borderRadius: BorderRadius.circular(4)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Active search: list result row
// ─────────────────────────────────────────────────────────────────────────────

class _ResultRow extends StatelessWidget {
  final Map<String, dynamic> product;
  final VoidCallback onTap;
  const _ResultRow({required this.product, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final c     = GColors.of(context);
    final title = (product['title'] ?? product['name'] ?? 'Gift').toString();
    final price = product['basePrice'] ?? product['price'] ?? '';
    final imgs  = product['images'];
    dynamic firstImg;
    if (imgs is List && imgs.isNotEmpty) firstImg = imgs.first;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: c.bg1,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: firstImg != null
                  ? GiftImage(src: firstImg, width: 56, height: 56)
                  : Container(
                      width: 56, height: 56,
                      color: c.bg2,
                      child: Icon(Icons.image_not_supported_outlined,
                          color: c.text2, size: 20),
                    ),
            ),
            const Gap(12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                    maxLines: 2, overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(
                      fontSize: 13, fontWeight: FontWeight.w700,
                      color: c.text0, height: 1.25)),
                  const Gap(4),
                  if (price.toString().isNotEmpty)
                    Text('₹$price', style: GoogleFonts.inter(
                      fontSize: 13, fontWeight: FontWeight.w800,
                      color: c.text0)),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: c.text2),
          ],
        ),
      ),
    );
  }
}
