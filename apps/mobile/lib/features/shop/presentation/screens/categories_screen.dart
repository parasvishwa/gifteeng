import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shimmer/shimmer.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/state/app_state.dart';
import '../../../../core/theme/app_theme.dart';

// ─── Provider ─────────────────────────────────────────────────────────────────

final _categoriesScreenProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final dio = ref.watch(dioProvider);
  try {
    final res = await dio.get('/categories', queryParameters: {
      'pageSize':             '200',
      'withPreviews':        'true',
      'previewsPerCategory': '1',
      'withProductCounts':   'true',
    });
    final data = res.data;
    if (data is List) return List<Map<String, dynamic>>.from(data);
    if (data is Map) {
      return List<Map<String, dynamic>>.from(
          data['items'] ?? data['data'] ?? []);
    }
    return [];
  } catch (_) {
    return [];
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

String _emojiFor(String name) {
  final n = name.toLowerCase();
  if (n.contains('birthday') || n.contains('cake'))               return '🎂';
  if (n.contains('anniversary') || n.contains('couple'))          return '💍';
  if (n.contains('flower') || n.contains('bouquet'))              return '💐';
  if (n.contains('acrylic') && n.contains('frame'))               return '🖼️';
  if (n.contains('acrylic') && n.contains('cutout'))              return '✂️';
  if (n.contains('acrylic') && n.contains('magnet'))              return '🧲';
  if (n.contains('acrylic') && n.contains('stand'))               return '🗿';
  if (n.contains('acrylic'))                                       return '🖼️';
  if (n.contains('personaliz') || n.contains('photo'))            return '🎁';
  if (n.contains('custom'))                                        return '✏️';
  if (n.contains('home') || n.contains('decor'))                  return '🏡';
  if (n.contains('key chain') || n.contains('keychain'))          return '🔑';
  if (n.contains('key holder') || n.contains('keyholder'))        return '🗝️';
  if (n.contains('mug') || n.contains('drink') || n.contains('drinkware')) return '☕';
  if (n.contains('stationery') || n.contains('journal'))          return '📝';
  if (n.contains('kid') || n.contains('child') || n.contains('toy')) return '🧸';
  if (n.contains('corporate') || n.contains('business') || n.contains('office')) return '💼';
  if (n.contains('shirt') || n.contains('tee'))                   return '👕';
  if (n.contains('fashion') || n.contains('cloth') || n.contains('wear')) return '👗';
  if (n.contains('return') || n.contains('wedding') || n.contains('hamper')) return '🎀';
  if (n.contains('plant') || n.contains('garden'))                return '🌿';
  if (n.contains('candle') || n.contains('spa') || n.contains('wellness')) return '🕯️';
  if (n.contains('tech') || n.contains('gadget'))                 return '📱';
  if (n.contains('book') || n.contains('reading'))                return '📚';
  if (n.contains('food') || n.contains('chocolate') || n.contains('sweet')) return '🍫';
  if (n.contains('festival') || n.contains('diwali') || n.contains('holi')) return '🪔';
  if (n.contains('car') || n.contains('auto'))                    return '🚗';
  if (n.contains('bulk') || n.contains('pack') || n.contains('set')) return '📦';
  if (n.contains('desk') || n.contains('daily'))                  return '✒️';
  return '🎁';
}

// Per-category gradient accent colours — used when no banner image is available.
LinearGradient _gradientFor(String name) {
  final n = name.toLowerCase();
  if (n.contains('acrylic'))                   return const LinearGradient(colors: [Color(0xFF7C3AED), Color(0xFF4F46E5)], begin: Alignment.topLeft, end: Alignment.bottomRight);
  if (n.contains('key'))                       return const LinearGradient(colors: [Color(0xFF1D4ED8), Color(0xFF0F766E)], begin: Alignment.topLeft, end: Alignment.bottomRight);
  if (n.contains('mug') || n.contains('drink'))return const LinearGradient(colors: [Color(0xFFB45309), Color(0xFF78350F)], begin: Alignment.topLeft, end: Alignment.bottomRight);
  if (n.contains('home') || n.contains('decor'))return const LinearGradient(colors: [Color(0xFF0F766E), Color(0xFF065F46)], begin: Alignment.topLeft, end: Alignment.bottomRight);
  if (n.contains('car'))                       return const LinearGradient(colors: [Color(0xFF1E40AF), Color(0xFF1E3A5F)], begin: Alignment.topLeft, end: Alignment.bottomRight);
  if (n.contains('corp') || n.contains('biz') || n.contains('business')) return const LinearGradient(colors: [Color(0xFF374151), Color(0xFF111827)], begin: Alignment.topLeft, end: Alignment.bottomRight);
  if (n.contains('kid') || n.contains('child'))return const LinearGradient(colors: [Color(0xFFEC4899), Color(0xFFD97706)], begin: Alignment.topLeft, end: Alignment.bottomRight);
  if (n.contains('fashion') || n.contains('cloth')) return const LinearGradient(colors: [Color(0xFFBE185D), Color(0xFF9D174D)], begin: Alignment.topLeft, end: Alignment.bottomRight);
  if (n.contains('desk') || n.contains('office')) return const LinearGradient(colors: [Color(0xFF0369A1), Color(0xFF164E63)], begin: Alignment.topLeft, end: Alignment.bottomRight);
  if (n.contains('bulk') || n.contains('pack')) return const LinearGradient(colors: [Color(0xFF15803D), Color(0xFF14532D)], begin: Alignment.topLeft, end: Alignment.bottomRight);
  // Default brand
  return const LinearGradient(colors: [Color(0xFFEF3752), Color(0xFFB91C1C)], begin: Alignment.topLeft, end: Alignment.bottomRight);
}

// Returns the best image URL for a category map.
String? _imageFor(Map<String, dynamic> cat) {
  for (final key in ['image', 'banner', 'imageUrl', 'bannerUrl']) {
    final v = cat[key];
    if (v is String && v.isNotEmpty) return v;
  }
  final previews = cat['previews'];
  if (previews is List && previews.isNotEmpty) {
    final first = previews.first;
    if (first is Map) {
      for (final k in ['url', 'image', 'src']) {
        final v = first[k];
        if (v is String && v.isNotEmpty) return v;
      }
    }
  }
  return null;
}

// Returns true when a category is known to have at least one product.
// If the backend does not return a product_count field we default to visible.
bool _hasProducts(Map<String, dynamic> cat) {
  final raw = cat['product_count'] ?? cat['productCount'] ?? cat['products_count'];
  if (raw == null) return true; // unknown → show
  return (raw as num).toInt() > 0;
}

int _productCount(Map<String, dynamic> cat) {
  final raw = cat['product_count'] ?? cat['productCount'] ?? cat['products_count'];
  if (raw == null) return 0;
  return (raw as num).toInt();
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class CategoriesScreen extends ConsumerWidget {
  const CategoriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_categoriesScreenProvider);
    final c = GColors.of(context);

    return Scaffold(
      backgroundColor: c.bg0,
      body: CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [

          // ── App bar ──────────────────────────────────────────────────────────
          SliverAppBar(
            pinned: true,
            floating: true,
            backgroundColor: c.bg0,
            surfaceTintColor: Colors.transparent,
            leading: IconButton(
              icon: Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: c.text0),
              onPressed: () => context.pop(),
            ),
            titleSpacing: 4,
            title: Text(
              'Shop by Category',
              style: GoogleFonts.inter(
                fontSize: 22,
                fontWeight: FontWeight.w900,
                color: c.text0,
              ),
            ),
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(1),
              child: Container(height: 1, color: c.border),
            ),
          ),

          // ── Body ─────────────────────────────────────────────────────────────
          ...async.when(
            loading: () => _buildShimmer(c),
            error:   (_, __) => _buildError(context, c, ref),
            data:    (items) => items.isEmpty
                ? _buildEmpty(context, c)
                : _buildContent(context, c, items),
          ),

          const SliverToBoxAdapter(child: SizedBox(height: 100)),
        ],
      ),
    );
  }

  // ── Shimmer ──────────────────────────────────────────────────────────────────

  List<Widget> _buildShimmer(GColorsPalette c) => [
    SliverToBoxAdapter(
      child: Shimmer.fromColors(
        baseColor: c.bg2,
        highlightColor: c.bg1,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                height: 112, width: double.infinity,
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
              ),
              const SizedBox(height: 12),
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 3, crossAxisSpacing: 10,
                  mainAxisSpacing: 10, childAspectRatio: 0.65,
                ),
                itemCount: 6,
                itemBuilder: (_, __) => Container(
                  decoration: BoxDecoration(
                    color: Colors.white, borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  ];

  // ── Error / empty ─────────────────────────────────────────────────────────────

  List<Widget> _buildError(BuildContext context, GColorsPalette c, WidgetRef ref) => [
    SliverFillRemaining(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('😕', style: TextStyle(fontSize: 48)),
            const Gap(16),
            Text('Could not load categories',
              style: GoogleFonts.inter(fontSize: 15, color: c.text1, fontWeight: FontWeight.w500)),
            const Gap(16),
            TextButton(
              onPressed: () => ref.invalidate(_categoriesScreenProvider),
              child: Text('Retry', style: GoogleFonts.inter(color: c.brand)),
            ),
          ]),
        ),
      ),
    ),
  ];

  List<Widget> _buildEmpty(BuildContext context, GColorsPalette c) => [
    SliverFillRemaining(
      child: Center(
        child: Text('No categories yet',
          style: GoogleFonts.inter(fontSize: 15, color: c.text2, fontWeight: FontWeight.w500)),
      ),
    ),
  ];

  // ── Main content builder ──────────────────────────────────────────────────────

  List<Widget> _buildContent(
      BuildContext context,
      GColorsPalette c,
      List<Map<String, dynamic>> items,
  ) {
    // ── Compute childAspectRatio so image area is exactly 4:5 ───────────────
    final screenW = MediaQuery.sizeOf(context).width;
    const int   cols          = 3;
    const double hPad         = 16 * 2;   // left + right screen padding
    const double hSpacing     = 10 * 2;   // 2 gaps for 3 cols
    final double cardW        = (screenW - hPad - hSpacing) / cols;
    final double imageH       = cardW * 5 / 4;   // true 4:5 portrait
    const double nameAreaH    = 34.0;             // fixed label row
    final double childAR      = cardW / (imageH + nameAreaH);

    // ── Separate parents from sub-categories ────────────────────────────────
    final parents = items.where((x) {
      final pid = x['parent_id'] ?? x['parentId'] ?? x['parent'];
      return pid == null || pid.toString().isEmpty;
    }).toList()
      ..sort((a, b) {
        final sa = ((a['sort_order'] ?? a['sortOrder'] ?? 0) as num).toInt();
        final sb = ((b['sort_order'] ?? b['sortOrder'] ?? 0) as num).toInt();
        return sa.compareTo(sb);
      });

    final allChildren = items.where((x) {
      final pid = x['parent_id'] ?? x['parentId'] ?? x['parent'];
      return pid != null && pid.toString().isNotEmpty;
    }).toList();

    final hasHierarchy = allChildren.isNotEmpty;

    // ── Flat list (no parent/child structure) ────────────────────────────────
    if (!hasHierarchy) {
      final visible = items.where(_hasProducts).toList();
      if (visible.isEmpty) return _buildEmpty(context, c);
      return [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
          sliver: SliverGrid(
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount:   cols,
              crossAxisSpacing: 10,
              mainAxisSpacing:  10,
              childAspectRatio: childAR,
            ),
            delegate: SliverChildBuilderDelegate(
              (ctx, i) => _SubCategoryCard(cat: visible[i], animDelay: (i * 40).ms),
              childCount: visible.length,
            ),
          ),
        ),
      ];
    }

    // ── Hierarchical layout ──────────────────────────────────────────────────
    final slivers   = <Widget>[];
    bool  isFirst   = true;

    for (final parent in parents) {
      final parentId = (parent['id'] ?? parent['_id'] ?? '').toString();

      // Gather visible sub-categories under this parent
      final subs = allChildren.where((x) {
        final pid = (x['parent_id'] ?? x['parentId'] ?? x['parent'] ?? '').toString();
        return pid == parentId;
      }).where(_hasProducts).toList()
        ..sort((a, b) {
          final sa = ((a['sort_order'] ?? a['sortOrder'] ?? 0) as num).toInt();
          final sb = ((b['sort_order'] ?? b['sortOrder'] ?? 0) as num).toInt();
          return sa.compareTo(sb);
        });

      // Decide whether to show this section at all
      final hasSubs       = subs.isNotEmpty;
      final parentVisible = hasSubs || _hasProducts(parent);
      if (!parentVisible) continue;

      // ── Separator between sections ─────────────────────────────────────
      if (!isFirst) {
        slivers.add(SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
            child: Container(height: 1, color: c.border),
          ),
        ));
      }

      // ── Section header (parent name as title, no horizontal banner) ────
      // The wide banner was visually heavy and duplicated the info already
      // shown in the child card below. A simple typographic header reads
      // cleaner and lets the 4:5 product/category cards do the talking.
      final parentName = (parent['name'] ?? '').toString();
      final totalProducts = hasSubs
          ? subs.fold<int>(0, (s, sub) => s + _productCount(sub))
          : _productCount(parent);

      slivers.add(SliverToBoxAdapter(
        child: Padding(
          padding: EdgeInsets.fromLTRB(16, isFirst ? 20 : 0, 16, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Text(
                  parentName,
                  style: GoogleFonts.inter(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: c.text0,
                    letterSpacing: -0.3,
                  ),
                ),
              ),
              if (totalProducts > 0)
                Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Text(
                    '$totalProducts ${totalProducts == 1 ? 'product' : 'products'}',
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: c.text2,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ));

      // ── Sub-category 3-col portrait grid ──────────────────────────────
      final gridItems = hasSubs ? subs : [parent];
      slivers.add(SliverPadding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        sliver: SliverGrid(
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount:   cols,
            crossAxisSpacing: 10,
            mainAxisSpacing:  10,
            childAspectRatio: childAR,
          ),
          delegate: SliverChildBuilderDelegate(
            (ctx, i) => _SubCategoryCard(
              cat:       gridItems[i],
              animDelay: (i * 40).ms,
            ),
            childCount: gridItems.length,
          ),
        ),
      ));

      isFirst = false;
    }

    // ── Orphans: children whose parent is not in the list ─────────────────
    final knownIds = parents.map((p) => (p['id'] ?? p['_id'] ?? '').toString()).toSet();
    final orphans  = allChildren.where((x) {
      final pid = (x['parent_id'] ?? x['parentId'] ?? x['parent'] ?? '').toString();
      return !knownIds.contains(pid) && _hasProducts(x);
    }).toList();

    if (orphans.isNotEmpty) {
      if (!isFirst) {
        slivers.add(SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
            child: Container(height: 1, color: c.border),
          ),
        ));
      }
      slivers.add(SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: Text('More',
            style: GoogleFonts.inter(fontSize: 17, fontWeight: FontWeight.w800, color: c.text0)),
        ),
      ));
      slivers.add(SliverPadding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        sliver: SliverGrid(
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: cols, crossAxisSpacing: 10,
            mainAxisSpacing: 10,  childAspectRatio: childAR,
          ),
          delegate: SliverChildBuilderDelegate(
            (ctx, i) => _SubCategoryCard(cat: orphans[i], animDelay: (i * 40).ms),
            childCount: orphans.length,
          ),
        ),
      ));
    }

    return slivers;
  }
}

// ─── Sub-category card — 4:5 portrait ─────────────────────────────────────────
// Emil: AnimatedScale(0.96) press feedback — ClipRRect lives inside
// AnimatedScale so the clip doesn't cut the scale transform.

class _SubCategoryCard extends ConsumerStatefulWidget {
  final Map<String, dynamic> cat;
  final Duration animDelay;

  const _SubCategoryCard({required this.cat, required this.animDelay});

  @override
  ConsumerState<_SubCategoryCard> createState() => _SubCategoryCardState();
}

class _SubCategoryCardState extends ConsumerState<_SubCategoryCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final c     = GColors.of(context);
    final cat   = widget.cat;
    final name  = (cat['name'] ?? '').toString();
    final img   = _imageFor(cat);
    final emoji = _emojiFor(name);

    return GestureDetector(
      onTapDown:   (_) => setState(() => _pressed = true),
      onTapUp:     (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      onTap: () {
        HapticFeedback.selectionClick();
        ref.read(shopCategoryFilterProvider.notifier).state = name;
        context.pop();
      },
      child: AnimatedScale(
        scale:    _pressed ? 0.96 : 1.0,
        duration: const Duration(milliseconds: 110),
        curve:    Curves.easeOut,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Container(
            decoration: BoxDecoration(
              color:        c.bg1,
              borderRadius: BorderRadius.circular(12),
              border:       Border.all(color: c.border, width: 1),
            ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [

              // ── 4:5 image area (fills remaining space) ─────────────────
              Expanded(
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Container(color: c.bg2),
                    if (img != null && img.isNotEmpty)
                      CachedNetworkImage(
                        imageUrl: img,
                        fit:      BoxFit.cover,
                        placeholder: (_, __) =>
                            _EmojiPlaceholder(emoji: emoji, bg: c.bg2),
                        errorWidget: (_, __, ___) =>
                            _EmojiPlaceholder(emoji: emoji, bg: c.bg2),
                      )
                    else
                      _EmojiPlaceholder(emoji: emoji, bg: c.bg2),
                  ],
                ),
              ),

              // ── Name label (fixed 34 px) ────────────────────────────────
              Container(
                height: 34,
                color: c.bg1,
                alignment: Alignment.center,
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Text(
                  name,
                  textAlign: TextAlign.center,
                  maxLines:  2,
                  overflow:  TextOverflow.ellipsis,
                  style: GoogleFonts.inter(
                    fontSize:   10.5,
                    fontWeight: FontWeight.w700,
                    color:      c.text0,
                    height:     1.2,
                  ),
                ),
              ),
            ],
          ),
        ),      // Container
      ),        // ClipRRect
    ),          // AnimatedScale
    )           // GestureDetector
        .animate(delay: widget.animDelay)
        .fadeIn(duration: 280.ms)
        .slideY(begin: 0.07, end: 0, duration: 280.ms, curve: Curves.easeOut);
  }
}

// ─── Emoji placeholder for image area ────────────────────────────────────────

class _EmojiPlaceholder extends StatelessWidget {
  final String emoji;
  final Color  bg;

  const _EmojiPlaceholder({required this.emoji, required this.bg});

  @override
  Widget build(BuildContext context) => Container(
    color: bg,
    child: Center(
      child: Text(emoji, style: const TextStyle(fontSize: 32)),
    ),
  );
}
