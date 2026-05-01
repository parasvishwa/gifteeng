import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shimmer/shimmer.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/services/audio_service.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/gift_image.dart';
import 'product_badges.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Related-products provider — same data source web uses.
// ─────────────────────────────────────────────────────────────────────────────

class _RelatedArgs {
  final String category;
  final String excludeId;
  const _RelatedArgs(this.category, this.excludeId);
  @override bool operator ==(Object other) =>
      other is _RelatedArgs && other.category == category && other.excludeId == excludeId;
  @override int get hashCode => Object.hash(category, excludeId);
}

final _relatedProductsProvider = FutureProvider.autoDispose
    .family<List<Map<String, dynamic>>, _RelatedArgs>((ref, args) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/products', queryParameters: {
      'category': args.category,
      'pageSize': 10,
      'status':   'active',
    });
    final data = res.data;
    List<Map<String, dynamic>> items;
    if (data is List) {
      items = List<Map<String, dynamic>>.from(data);
    } else if (data is Map) {
      items = List<Map<String, dynamic>>.from(data['items'] ?? data['data'] ?? []);
    } else {
      return [];
    }
    // Exclude current product + cap at 8
    items = items.where((p) =>
        (p['id'] ?? p['_id']) != args.excludeId).take(8).toList();
    return items;
  } catch (_) {
    return [];
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Public widget — fully theme-aware via GColors.of(context)
// ─────────────────────────────────────────────────────────────────────────────

class YouMayAlsoLikeSection extends ConsumerWidget {
  final String currentProductId;
  final String category;

  const YouMayAlsoLikeSection({
    super.key,
    required this.currentProductId,
    required this.category,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = GColors.of(context);
    if (category.isEmpty) return const SizedBox.shrink();
    final async = ref.watch(_relatedProductsProvider(
        _RelatedArgs(category, currentProductId)));

    return async.when(
      loading: () => _buildSkeleton(c),
      error: (_, __) => const SizedBox.shrink(),
      data: (products) {
        if (products.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Row(children: [
                const Text('💫', style: TextStyle(fontSize: 16)),
                const Gap(8),
                Text('You may also like', style: GoogleFonts.inter(
                  fontSize: 15, fontWeight: FontWeight.w800,
                  color: c.text0)),
                const Spacer(),
                Text('${products.length} gifts', style: GoogleFonts.inter(
                  fontSize: 11, color: c.text2)),
              ]),
            ),
            SizedBox(
              height: 240,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(vertical: 2),
                itemCount: products.length,
                separatorBuilder: (_, __) => const Gap(12),
                itemBuilder: (_, i) => _RelatedProductCard(
                  product: products[i],
                ).animate()
                    .fadeIn(delay: (i * 40).ms, duration: 300.ms)
                    .slideX(begin: 0.05, end: 0),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildSkeleton(GColorsPalette c) {
    return SizedBox(
      height: 238,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: 4,
        separatorBuilder: (_, __) => const Gap(10),
        itemBuilder: (_, __) => Shimmer.fromColors(
          baseColor: c.bg1, highlightColor: c.bg2,
          child: Container(
            width: 160,
            decoration: BoxDecoration(
              color: c.bg1,
              borderRadius: BorderRadius.circular(16),
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Compact product card for the related row ────────────────────────────────

class _RelatedProductCard extends StatefulWidget {
  final Map<String, dynamic> product;
  const _RelatedProductCard({required this.product});

  @override
  State<_RelatedProductCard> createState() => _RelatedProductCardState();
}

class _RelatedProductCardState extends State<_RelatedProductCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final c    = GColors.of(context);
    const brand = Color(0xFFEF3752);

    final p = widget.product;
    final title = (p['title'] ?? p['name'] ?? '') as String;
    final priceRaw = p['basePrice'] ?? p['price'] ?? '0';
    final price = double.tryParse(priceRaw.toString()) ?? 0;
    final meta = (p['metadata'] as Map?) ?? {};
    final cmpRaw = meta['compareAtPrice'] ?? meta['mrp']
        ?? p['compareAtPrice'] ?? p['mrp'];
    final cmp = cmpRaw is num ? cmpRaw.toDouble()
        : (cmpRaw != null ? double.tryParse(cmpRaw.toString()) : null);
    final discountPct = (cmp != null && cmp > price)
        ? ((cmp - price) / cmp * 100).round()
        : 0;
    final images = p['images'] as List? ?? [];
    final firstImage = images.isNotEmpty ? images.first : null;
    final slug = (p['slug'] ?? p['id'] ?? '').toString();

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
        scale: _pressed ? 0.96 : 1.0,
        duration: 110.ms,
        child: Container(
          width: 160,
          decoration: BoxDecoration(
            color: c.bg1,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: c.border),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Image area
              Stack(children: [
                SizedBox(
                  height: 150, width: 160,
                  child: GiftImage(src: firstImage, fit: BoxFit.cover),
                ),
                // Discount badge top-left
                if (discountPct > 0)
                  Positioned(
                    top: 6, left: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0xFFCC0C39),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text('$discountPct% off',
                        style: GoogleFonts.inter(
                          fontSize: 9, fontWeight: FontWeight.w800,
                          color: Colors.white)),
                    ),
                  ),
                // Dynamic product badge top-right (NEW / TRENDING / etc.)
                Positioned(
                  top: 6, right: 6,
                  child: ProductBadgeRow(
                    product: p, maxBadges: 1, compact: true),
                ),
              ]),
              // Info area
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                      maxLines: 2, overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.inter(
                        fontSize: 12, fontWeight: FontWeight.w600,
                        color: c.text0, height: 1.3)),
                    const Gap(6),
                    Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Text('₹${price.toInt()}',
                        style: GoogleFonts.inter(
                          fontSize: 14, fontWeight: FontWeight.w900,
                          color: c.text0)),
                      if (cmp != null && cmp > price) ...[
                        const Gap(4),
                        Text('₹${cmp.toInt()}',
                          style: GoogleFonts.inter(
                            fontSize: 10, color: c.text2,
                            decoration: TextDecoration.lineThrough,
                            decorationColor: c.text2)),
                      ],
                    ]),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
