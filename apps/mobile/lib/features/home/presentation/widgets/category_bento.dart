// ─── Shop by Category — 3×2 paged grid, auto-slides between pages ─────────────
//
// Layout: PageView where each page is a 3-column × 2-row grid.
// Max 12 categories = 2 full pages of 6. Auto-scrolls every 4 seconds.
// Card = portrait 4:5 image area + name label below.
//
// Image source priority:
//   1. Inlined preview from /categories?withPreviews=true
//   2. Category's own image/imageUrl/thumbnail field
//   3. Per-category fallback via categoryPreviewProvider (first active product)
//   4. Emoji placeholder
//
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shimmer/shimmer.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/analytics/analytics_service.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/gift_image.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

final bentoCategoriesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final dio = ref.watch(dioProvider);
  try {
    final res = await dio.get('/categories', queryParameters: {
      'withPreviews': 'true',
      'previewsPerCategory': '3',
    });
    final data = res.data;
    List<Map<String, dynamic>> all;
    if (data is List) {
      all = List<Map<String, dynamic>>.from(data);
    } else if (data is Map) {
      all = List<Map<String, dynamic>>.from(
          data['items'] ?? data['data'] ?? []);
    } else {
      return [];
    }
    final topLevel = all.where((c) {
      final pid = c['parentId'];
      final isTopLevel = pid == null
          || pid.toString().trim().isEmpty
          || pid.toString().trim() == 'null'
          || pid == 0 || pid == false;
      return isTopLevel && (c['isActive'] == true || c['active'] == true);
    }).toList();

    final flagged = topLevel.where((c) =>
        c['showOnHome']    == true ||
        c['featured']      == true ||
        c['showInApp']     == true ||
        c['visibleOnHome'] == true).toList();

    final filtered = flagged.isNotEmpty ? flagged : topLevel;
    filtered.sort((a, b) {
      final aOrd = (a['homeOrder'] ?? a['sortOrder'] ?? 99) as num;
      final bOrd = (b['homeOrder'] ?? b['sortOrder'] ?? 99) as num;
      return aOrd.compareTo(bOrd);
    });
    return filtered.take(12).toList(); // 2 pages × 3 cols × 2 rows = 12 max
  } catch (_) {
    return [];
  }
});

// Legacy per-card fetch — fallback for backends that don't honor withPreviews
final categoryPreviewProvider = FutureProvider.autoDispose
    .family<List<dynamic>, String>((ref, catId) async {
  final dio = ref.watch(dioProvider);
  try {
    // Try both id and slug as the category filter
    for (final param in ['category', 'categoryId', 'categorySlug']) {
      final res = await dio.get('/products', queryParameters: {
        param:      catId,
        'pageSize': 1,
        'status':   'active',
      });
      final data = res.data;
      List<Map<String, dynamic>> items;
      if (data is Map) {
        items = List<Map<String, dynamic>>.from(data['items'] ?? data['data'] ?? []);
      } else if (data is List) {
        items = List<Map<String, dynamic>>.from(data);
      } else {
        continue;
      }
      final imgs = <dynamic>[];
      for (final p in items) {
        final raw = p['images'] ?? p['image'];
        if (raw is List && raw.isNotEmpty) {
          imgs.add(raw.first);
        } else if (raw is String && raw.isNotEmpty) {
          imgs.add(raw);
        } else if (raw is Map && (raw['url'] != null || raw['data'] != null)) {
          imgs.add(raw);
        }
        if (imgs.isNotEmpty) break;
      }
      if (imgs.isNotEmpty) return imgs;
    }
    return [];
  } catch (_) {
    return [];
  }
});

// ─── Main section ─────────────────────────────────────────────────────────────

class CategoryBento extends ConsumerStatefulWidget {
  final void Function(String catId) onCatTap;
  const CategoryBento({super.key, required this.onCatTap});

  @override
  ConsumerState<CategoryBento> createState() => _CategoryBentoState();
}

class _CategoryBentoState extends ConsumerState<CategoryBento> {
  late final PageController _pageCtrl;
  int    _page = 0;
  Timer? _timer;

  // Card layout constants ─────────────────────────────────────────────────────
  // Image: 4:5 portrait. Text area = Gap(8) + label line + 2-line wrap room.
  // 48px gives: 8 gap + 2×(11px font × 1.25 lineH = 13.75px) = ~36px, with
  // 12px to spare — enough so the last row's labels never clip on any device
  // including the wide Fold 7 display where cellW is larger than usual.
  static const double _textAreaH = 48.0;

  static double _cellH(double cellW) => cellW * 5 / 4 + _textAreaH;
  static double _cellAspect(double cellW) => cellW / _cellH(cellW);
  // Extra 28px safety (was 24) covers SizedBox rounding on wide screens.
  static double _gridH(double cellW) => 2 * _cellH(cellW) + 12 + 28;

  @override
  void initState() {
    super.initState();
    _pageCtrl = PageController();
    _timer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted || !_pageCtrl.hasClients) return;
      final cats      = ref.read(bentoCategoriesProvider).valueOrNull ?? [];
      final pageCount = ((cats.length - 1) ~/ 6) + 1;
      if (pageCount < 2) return;
      final next = (_page + 1) % pageCount;
      _pageCtrl.animateToPage(
        next,
        duration: const Duration(milliseconds: 450),
        curve: Curves.easeInOut,
      );
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pageCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c         = GColors.of(context);
    final catsAsync = ref.watch(bentoCategoriesProvider);

    return Padding(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Section header ────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
            child: Row(
              children: [
                const Text('🛍️', style: TextStyle(fontSize: 20)),
                const Gap(8),
                Text('Shop by Category', style: GoogleFonts.inter(
                  fontSize: 18, fontWeight: FontWeight.w800,
                  color: c.text0,
                )),
                const Spacer(),
                GestureDetector(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    widget.onCatTap('all');
                  },
                  child: Text('View all', style: GoogleFonts.inter(
                    fontSize: 12, fontWeight: FontWeight.w600,
                    color: GColors.brand,
                  )),
                ),
              ],
            ),
          ),

          // ── Paged 3×2 grid ────────────────────────────────────────────────
          catsAsync.when(
            loading: () => const _BentoSkeleton(),
            error:   (_, __) => const SizedBox.shrink(),
            data: (cats) {
              if (cats.isEmpty) return const SizedBox.shrink();
              final pageCount = ((cats.length - 1) ~/ 6) + 1;
              return LayoutBuilder(
                builder: (ctx, constraints) {
                  // 3 cols, 10px crossAxisSpacing × 2 gaps, 16px side padding × 2
                  final cellW    = (constraints.maxWidth - 32 - 20) / 3;
                  final cellH    = _cellH(cellW);
                  final gridH    = _gridH(cellW);

                  return Column(
                    children: [
                      SizedBox(
                        height: gridH,
                        child: PageView.builder(
                          controller: _pageCtrl,
                          clipBehavior: Clip.none, // prevent edge-clipping of second row
                          onPageChanged: (p) => setState(() => _page = p),
                          itemCount: pageCount,
                          itemBuilder: (_, pageIdx) {
                            final start    = pageIdx * 6;
                            final end      = (start + 6).clamp(0, cats.length);
                            final pageCats = cats.sublist(start, end);
                            return _CategoryPage(
                              cats:        pageCats,
                              onTap:       widget.onCatTap,
                              cellHeight:  cellH,
                              cellWidth:   cellW,
                            );
                          },
                        ),
                      ),
                      if (pageCount > 1) ...[
                        const Gap(10),
                        _buildDots(pageCount),
                      ],
                    ],
                  );
                },
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildDots(int count) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(count, (i) {
        return AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          width:  _page == i ? 18 : 5,
          height: 5,
          margin: const EdgeInsets.symmetric(horizontal: 3),
          decoration: BoxDecoration(
            color: _page == i
                ? GColors.brand
                : GColors.brand.withValues(alpha: 0.25),
            borderRadius: BorderRadius.circular(3),
          ),
        );
      }),
    );
  }
}

// ─── One page of the carousel (3×2 grid) ─────────────────────────────────────

class _CategoryPage extends StatelessWidget {
  final List<Map<String, dynamic>> cats;
  final void Function(String) onTap;
  final double cellHeight;
  final double cellWidth;

  const _CategoryPage({
    required this.cats,
    required this.onTap,
    required this.cellHeight,
    required this.cellWidth,
  });

  @override
  Widget build(BuildContext context) {
    // Use mainAxisExtent (explicit height in logical px) instead of
    // childAspectRatio to avoid pixel-rounding crops on the second row's
    // text labels. With aspectRatio Flutter computes height = width /
    // ratio and the rounded result was 1-2px shorter than what the card
    // actually needs to render its label.
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount:   3,
          crossAxisSpacing: 10,
          mainAxisSpacing:  12,
          mainAxisExtent:   cellHeight,
        ),
        itemCount: cats.length,
        itemBuilder: (_, i) => _CategoryCard(cat: cats[i], onTap: onTap)
            .animate()
            .fadeIn(delay: (i * 40).ms, duration: 240.ms)
            .slideY(begin: 0.06, end: 0, duration: 240.ms),
      ),
    );
  }
}

// ─── Single card: 4:5 portrait image + name label below ───────────────────────

class _CategoryCard extends ConsumerStatefulWidget {
  final Map<String, dynamic> cat;
  final void Function(String) onTap;
  const _CategoryCard({required this.cat, required this.onTap});

  @override
  ConsumerState<_CategoryCard> createState() => _CategoryCardState();
}

class _CategoryCardState extends ConsumerState<_CategoryCard> {
  bool _pressed = false;

  String? _pickEmoji(Map<String, dynamic> cat) {
    final e = (cat['emoji'] ?? cat['icon'] ?? '').toString().trim();
    return e.isEmpty ? null : e;
  }

  @override
  Widget build(BuildContext context) {
    final c     = GColors.of(context);
    final cat   = widget.cat;
    final catId = (cat['id'] ?? cat['_id'] ?? cat['slug'] ?? 'all').toString();
    final name  = (cat['name'] ?? 'Category').toString();
    final emoji = _pickEmoji(cat) ?? _emojiFor(name);

    // ── Resolve image ─────────────────────────────────────────────────────────
    // Priority: inlined preview → category own image → product fallback
    dynamic firstImage;

    // 1. Inlined preview array from /categories?withPreviews=true
    final inlined = cat['previews'];
    if (inlined is List && inlined.isNotEmpty) {
      final p = inlined.first;
      if (p is Map && p['url'] is String)  firstImage = p['url'];
      else if (p is String && p.isNotEmpty) firstImage = p;
    }

    // 2. Category's own image field
    if (firstImage == null) {
      final catImg = cat['image'] ?? cat['imageUrl'] ?? cat['thumbnail'];
      if (catImg is String && catImg.isNotEmpty) {
        firstImage = catImg;
      } else if (catImg is Map) {
        final url = catImg['url'] ?? catImg['src'];
        if (url is String && url.isNotEmpty) firstImage = url;
      }
    }

    // 3. First active product image for this category (async fallback)
    final preview = ref.watch(categoryPreviewProvider(catId));
    if (firstImage == null && preview.hasValue) {
      final list = preview.asData?.value ?? [];
      if (list.isNotEmpty) firstImage = list.first;
    }

    return GestureDetector(
      onTapDown:   (_) => setState(() => _pressed = true),
      onTapUp:     (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      onTap: () {
        HapticFeedback.selectionClick();
        Analytics.track('category_tap', {'id': catId, 'name': name});
        widget.onTap(name);
      },
      child: AnimatedScale(
        scale:    _pressed ? 0.94 : 1.0,
        duration: const Duration(milliseconds: 110),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            // ── 4:5 portrait image area ───────────────────────────────────
            AspectRatio(
              aspectRatio: 4 / 5,
              child: Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  color:        c.bg1,
                  borderRadius: BorderRadius.circular(14),
                  border:       Border.all(color: c.border, width: 1),
                ),
                child: firstImage != null
                    ? ClipRRect(
                        borderRadius: BorderRadius.circular(13),
                        child: GiftImage(src: firstImage, fit: BoxFit.cover),
                      )
                    : Center(
                        child: Text(emoji,
                            style: const TextStyle(fontSize: 28)),
                      ),
              ),
            ),

            const Gap(8),

            // ── Name label (allow 2 lines for longer category names) ──────
            Flexible(
              child: Text(
                name,
                maxLines:  2,
                overflow:  TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                  fontSize:   11,
                  fontWeight: FontWeight.w600,
                  color:      c.text0,
                  height:     1.2,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Skeleton (3-column, portrait cards) ─────────────────────────────────────

class _BentoSkeleton extends StatelessWidget {
  const _BentoSkeleton();

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    // Use a fixed approximation for skeleton — real height computed in LayoutBuilder
    return LayoutBuilder(builder: (ctx, constraints) {
      final cellW  = (constraints.maxWidth - 32 - 20) / 3;
      final imageH = cellW * 5 / 4;
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Shimmer.fromColors(
          baseColor:      c.bg1,
          highlightColor: c.bg2,
          child: GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount:   3,
              crossAxisSpacing: 10,
              mainAxisSpacing:  12,
              childAspectRatio: 0.70, // close to 4:5 + label
            ),
            itemCount: 6,
            itemBuilder: (_, __) => Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AspectRatio(
                  aspectRatio: 4 / 5,
                  child: Container(
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color:        c.bg1,
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
                const Gap(6),
                Container(
                  width: 48, height: 9,
                  decoration: BoxDecoration(
                    color:        c.bg1,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    });
  }
}

// ─── Emoji fallback from category name ────────────────────────────────────────

String _emojiFor(String name) {
  final n = name.toLowerCase();
  if (n.contains('flower') || n.contains('bouquet')) return '💐';
  if (n.contains('cake') || n.contains('bakery'))    return '🎂';
  if (n.contains('choc'))                             return '🍫';
  if (n.contains('jewel') || n.contains('ring'))     return '💍';
  if (n.contains('watch'))                            return '⌚';
  if (n.contains('plant'))                            return '🪴';
  if (n.contains('book'))                             return '📚';
  if (n.contains('perfume') || n.contains('scent'))  return '🌸';
  if (n.contains('toy') || n.contains('kid'))        return '🧸';
  if (n.contains('photo') || n.contains('frame'))    return '🖼️';
  if (n.contains('mug') || n.contains('cup'))        return '☕';
  if (n.contains('candle'))                           return '🕯️';
  if (n.contains('corpor') || n.contains('b2b'))     return '💼';
  if (n.contains('tech') || n.contains('gadget'))    return '🎧';
  if (n.contains('home') || n.contains('decor'))     return '🏠';
  if (n.contains('pers') || n.contains('custom'))    return '✨';
  if (n.contains('key'))                              return '🗝️';
  if (n.contains('car'))                              return '🚗';
  if (n.contains('desk') || n.contains('office'))    return '✒️';
  return '🎁';
}
