// ─── Shop by Category — 3-column square grid, name below ─────────────────────
//
// Layout: 3-column grid. Each cell = full-width square image on top +
// category name centred below. Theme-aware so it reads correctly in both
// dark and light palettes.
//
// Image source priority:
//   1. Inlined preview from /categories?withPreviews=true  (zero extra requests)
//   2. Per-category product fetch via categoryPreviewProvider (legacy fallback)
//   3. Emoji placeholder when neither resolves
//
// ─────────────────────────────────────────────────────────────────────────────

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
    final topLevel = all.where((c) =>
        c['parentId'] == null &&
        (c['isActive'] == true || c['active'] == true)).toList();

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
    return filtered.take(9).toList(); // 3 columns × 3 rows = 9 max
  } catch (_) {
    return [];
  }
});

// Legacy per-card fetch — fallback for backends that don't honor withPreviews
final categoryPreviewProvider = FutureProvider.autoDispose
    .family<List<dynamic>, String>((ref, catId) async {
  final dio = ref.watch(dioProvider);
  try {
    final res = await dio.get('/products', queryParameters: {
      'category': catId,
      'pageSize': 1,
      'status': 'active',
    });
    final data = res.data;
    List<Map<String, dynamic>> items;
    if (data is Map) {
      items = List<Map<String, dynamic>>.from(data['items'] ?? []);
    } else if (data is List) {
      items = List<Map<String, dynamic>>.from(data);
    } else {
      return [];
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
    return imgs;
  } catch (_) {
    return [];
  }
});

// ─── Main section ─────────────────────────────────────────────────────────────

class CategoryBento extends ConsumerWidget {
  final void Function(String catId) onCatTap;
  const CategoryBento({super.key, required this.onCatTap});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c         = GColors.of(context);
    final catsAsync = ref.watch(bentoCategoriesProvider);

    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 28, 0, 0),
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
                    onCatTap('all');
                  },
                  child: Text('View all', style: GoogleFonts.inter(
                    fontSize: 12, fontWeight: FontWeight.w600,
                    color: GColors.brand,
                  )),
                ),
              ],
            ),
          ),

          // ── Grid ─────────────────────────────────────────────────────────
          catsAsync.when(
            loading: () => const _BentoSkeleton(),
            error:   (_, __) => const SizedBox.shrink(),
            data: (cats) {
              if (cats.isEmpty) return const SizedBox.shrink();
              return _CategoryGrid(cats: cats, onTap: onCatTap);
            },
          ),
        ],
      ),
    );
  }
}

// ─── 3-column square grid ─────────────────────────────────────────────────────

class _CategoryGrid extends StatelessWidget {
  final List<Map<String, dynamic>> cats;
  final void Function(String) onTap;
  const _CategoryGrid({required this.cats, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount:    3,
          crossAxisSpacing:  10,
          mainAxisSpacing:   14,
          childAspectRatio:  0.82, // square image + ~26px name row
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

// ─── Single square card: image on top, name below ─────────────────────────────

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

    // ── Resolve image ───────────────────────────────────────────────────────
    final inlined = cat['previews'];
    dynamic firstImage;
    if (inlined is List && inlined.isNotEmpty) {
      final p = inlined.first;
      if (p is Map && p['url'] is String) firstImage = p['url'];
    }
    if (firstImage == null) {
      // category image directly on the category object
      final catImg = cat['image'] ?? cat['imageUrl'] ?? cat['thumbnail'];
      if (catImg is String && catImg.isNotEmpty) firstImage = catImg;
      if (catImg is Map) {
        final url = catImg['url'] ?? catImg['src'];
        if (url is String && url.isNotEmpty) firstImage = url;
      }
    }
    if (firstImage == null) {
      final preview = ref.watch(categoryPreviewProvider(catId));
      firstImage = preview.asData?.value.isNotEmpty == true
          ? preview.asData!.value.first
          : null;
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
          children: [
            // ── Square image / emoji ───────────────────────────────────────
            Expanded(
              child: Container(
                width: double.infinity,
                decoration: BoxDecoration(
                  color:         c.bg1,
                  borderRadius:  BorderRadius.circular(14),
                  border:        Border.all(color: c.border, width: 1),
                ),
                clipBehavior: Clip.antiAlias,
                child: firstImage != null
                    ? GiftImage(src: firstImage, fit: BoxFit.cover)
                    : Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(emoji, style: const TextStyle(fontSize: 30)),
                          ],
                        ),
                      ),
              ),
            ),

            const Gap(6),

            // ── Category name ──────────────────────────────────────────────
            Text(
              name,
              maxLines:  1,
              overflow:  TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize:   11,
                fontWeight: FontWeight.w600,
                color:      c.text0,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Skeleton (matches new 3-column layout) ───────────────────────────────────

class _BentoSkeleton extends StatelessWidget {
  const _BentoSkeleton();

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
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
            mainAxisSpacing:  14,
            childAspectRatio: 0.82,
          ),
          itemCount: 9,
          itemBuilder: (_, __) => Column(
            children: [
              Expanded(
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
                width:  50,
                height: 10,
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
