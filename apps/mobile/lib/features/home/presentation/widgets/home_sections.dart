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
import 'home_product_card.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Providers — backend-agnostic: call real endpoints first, fall back to
// empty lists so the UI hides gracefully when admin hasn't populated yet.
// ─────────────────────────────────────────────────────────────────────────────

/// Best Sellers — uses `/products?sort=popular` which the backend already
/// exposes. Same endpoint web uses.
final bestSellersProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/products', queryParameters: {
      'sort': 'popular',
      'pageSize': 10,
      'status': 'active',
    });
    final data = res.data;
    if (data is List) return List<Map<String, dynamic>>.from(data);
    if (data is Map) {
      return List<Map<String, dynamic>>.from(
          data['items'] ?? data['data'] ?? []);
    }
  } catch (_) {}
  return [];
});

/// Corporate Gifts — tries `?tag=corporate` first (primary), then
/// `?b2bEnabled=true` (fallback). Both shapes observed on the API.
final corporateGiftsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final dio = ref.watch(dioProvider);
  Future<List<Map<String, dynamic>>> tryQuery(Map<String, dynamic> q) async {
    try {
      final res = await dio.get('/products', queryParameters: q);
      final data = res.data;
      if (data is List) return List<Map<String, dynamic>>.from(data);
      if (data is Map) {
        return List<Map<String, dynamic>>.from(
            data['items'] ?? data['data'] ?? []);
      }
    } catch (_) {}
    return [];
  }
  // Prefer admin-tagged corporate items
  var items = await tryQuery({'tag': 'corporate', 'pageSize': 6, 'status': 'active'});
  if (items.isEmpty) {
    items = await tryQuery({'b2bEnabled': 'true', 'pageSize': 6, 'status': 'active'});
  }
  return items;
});

// ─────────────────────────────────────────────────────────────────────────────
// Best Sellers — horizontal row of numbered ranked cards
// ─────────────────────────────────────────────────────────────────────────────

class BestSellersSection extends ConsumerWidget {
  const BestSellersSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(bestSellersProvider);
    return async.when(
      loading: () => _buildSkeleton(context),
      error: (_, __) => const SizedBox.shrink(),
      data: (products) {
        if (products.isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                child: Row(children: [
                  const Text('🏆', style: TextStyle(fontSize: 20)),
                  const Gap(8),
                  Text('Best Sellers', style: GoogleFonts.inter(
                    fontSize: 18, fontWeight: FontWeight.w800,
                    color: GColors.of(context).text0)),
                  const Spacer(),
                  GestureDetector(
                    onTap: () => context.push('/shop?sort=popular'),
                    child: Text('View all', style: GoogleFonts.inter(
                      fontSize: 12, fontWeight: FontWeight.w600,
                      color: GColors.brand)),
                  ),
                ]),
              ),
              SizedBox(
                // Match height with _ProductStrip (unified design)
                height: 310,
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                  scrollDirection: Axis.horizontal,
                  itemCount: products.length.clamp(0, 8),
                  separatorBuilder: (_, __) => const Gap(12),
                  itemBuilder: (_, i) => HomeProductCard(
                    product: products[i],
                    rank:    i + 1,
                  ).animate()
                      .fadeIn(delay: (i * 50).ms, duration: 300.ms)
                      .slideX(begin: 0.05, end: 0),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildSkeleton(BuildContext context) {
    final c = GColors.of(context);
    return Padding(
      padding: EdgeInsets.zero,
      child: SizedBox(
        height: 252,
        child: ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
          scrollDirection: Axis.horizontal,
          itemCount: 3,
          separatorBuilder: (_, __) => const Gap(10),
          itemBuilder: (_, __) => Shimmer.fromColors(
            baseColor: c.bg2, highlightColor: c.border,
            child: Container(
              width: 160,
              decoration: BoxDecoration(
                color: c.bg2, borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ),
      ),
    );
  }
}

class _RankedCard extends StatefulWidget {
  final Map<String, dynamic> product;
  final int rank;
  const _RankedCard({required this.product, required this.rank});
  @override State<_RankedCard> createState() => _RankedCardState();
}

class _RankedCardState extends State<_RankedCard> {
  bool _pressed = false;

  /// Rank ribbon colours — solid gold / silver / bronze for top 3, neutral after.
  Color get _rankColor {
    switch (widget.rank) {
      case 1: return const Color(0xFFFFD700);  // gold
      case 2: return const Color(0xFFD1D5DB);  // silver
      case 3: return const Color(0xFFCD7F32);  // bronze
      default: return GColors.bg2;
    }
  }

  Color _rankTextColor(BuildContext context) =>
      widget.rank <= 3 ? Colors.black : GColors.of(context).text0;

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final title = (p['title'] ?? p['name'] ?? '') as String;
    final priceRaw = (p['basePrice'] ?? p['price'] ?? '0').toString();
    final price = double.tryParse(priceRaw) ?? 0;
    final images = p['images'] as List? ?? [];
    final firstImage = images.isNotEmpty ? images.first : null;
    final slug = (p['slug'] ?? p['id'] ?? '').toString();
    final meta = (p['metadata'] as Map?) ?? {};
    final cmpRaw = meta['compareAtPrice'] ?? meta['mrp'];
    final cmp = cmpRaw is num ? cmpRaw.toDouble()
        : (cmpRaw != null ? double.tryParse(cmpRaw.toString()) : null);

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
            color: GColors.of(context).bg1,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: GColors.of(context).border),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Stack(children: [
                SizedBox(
                  height: 150, width: 160,
                  child: GiftImage(src: firstImage, fit: BoxFit.cover),
                ),
                // Rank ribbon — ONLY for top 3. Earlier we showed it for
                // all 8 cards which produced an ugly black tag for ranks
                // 4-8; later we removed it entirely. Sweet spot: solid
                // gold/silver/bronze ribbon for #1/#2/#3 only.
                if (widget.rank <= 3)
                  Positioned(
                    top: 0, left: 0,
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(8, 5, 10, 5),
                      decoration: BoxDecoration(
                        color: _rankColor,
                        borderRadius: const BorderRadius.only(
                          topLeft: Radius.circular(12),
                          bottomRight: Radius.circular(10),
                        ),
                      ),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Text('#${widget.rank}',
                          style: GoogleFonts.inter(
                            fontSize: 12, fontWeight: FontWeight.w900,
                            color: _rankTextColor(context),
                            letterSpacing: -0.3)),
                        if (widget.rank == 1) ...[
                          const Gap(3),
                          const Text('👑', style: TextStyle(fontSize: 11)),
                        ],
                      ]),
                    ),
                  ),
                // Low-stock badge — bottom-left (kept; it's contextual urgency,
                // not a decorative overlay).
                _LowStockBadge(product: widget.product),
              ]),
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                      maxLines: 2, overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.inter(
                        fontSize: 12, fontWeight: FontWeight.w600,
                        color: GColors.of(context).text0, height: 1.3)),
                    const Gap(4),
                    Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Text('₹${price.toInt()}',
                        style: GoogleFonts.inter(
                          fontSize: 14, fontWeight: FontWeight.w900,
                          color: GColors.gold)),
                      if (cmp != null && cmp > price) ...[
                        const Gap(4),
                        Text('₹${cmp.toInt()}',
                          style: GoogleFonts.inter(
                            fontSize: 10, color: GColors.of(context).text2,
                            decoration: TextDecoration.lineThrough)),
                      ],
                    ]),
                    const Gap(3),
                    Row(children: [
                      const Icon(Icons.star_rounded, size: 10, color: GColors.gold),
                      const Gap(2),
                      Text('4.${8 - (widget.rank % 3)}',
                        style: GoogleFonts.inter(
                          fontSize: 10, fontWeight: FontWeight.w700,
                          color: GColors.of(context).text1)),
                      const Gap(3),
                      Text('(${(200 - widget.rank * 18)}+ orders)',
                        style: GoogleFonts.inter(
                          fontSize: 9, color: GColors.of(context).text2)),
                    ]),
                    const Gap(8),
                    // CTA placed below the image, not overlaying it.
                    _CardCTAButton(product: widget.product, slug: slug),
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

// ─────────────────────────────────────────────────────────────────────────────
// Shared card micro-widgets — used by _RankedCard (and future strips)
// ─────────────────────────────────────────────────────────────────────────────

/// "🔥 Only X left" urgency badge — positioned bottom-left of the image
/// stack, just above the CTA button. Returns [SizedBox.shrink] when the
/// product has no inventory field or stock > 5.
class _LowStockBadge extends StatelessWidget {
  final Map<String, dynamic> product;
  const _LowStockBadge({required this.product});

  @override
  Widget build(BuildContext context) {
    final raw = product['inventory'] ?? product['stockCount'] ??
        product['stock'] ?? product['quantity'];
    if (raw == null) return const SizedBox.shrink();
    final stock = raw is int ? raw : int.tryParse(raw.toString());
    if (stock == null || stock <= 0 || stock > 5) return const SizedBox.shrink();

    return Positioned(
      // Sit just above the CTA button (bottom: 8 + ~28 height + 4 gap = 40)
      bottom: 44, left: 8,
      child: Container(
        padding: const EdgeInsets.fromLTRB(6, 3, 7, 3),
        decoration: BoxDecoration(
          color: const Color(0xFFEF3752),
          borderRadius: BorderRadius.circular(6),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFFEF3752).withValues(alpha: 0.45),
              blurRadius: 6, offset: const Offset(0, 2)),
          ],
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          const Text('🔥', style: TextStyle(fontSize: 9)),
          const Gap(3),
          Text('Only $stock left',
            style: GoogleFonts.inter(
              fontSize: 9, fontWeight: FontWeight.w800,
              color: Colors.white, letterSpacing: 0.2)),
        ]),
      ),
    );
  }
}

/// Outlined ADD / CUSTOMISE button — always visible (not
/// hover-gated). Navigates to the product detail page.
class _CardCTAButton extends StatelessWidget {
  final Map<String, dynamic> product;
  final String slug;
  const _CardCTAButton({required this.product, required this.slug});

  @override
  Widget build(BuildContext context) {
    final isCustomizable =
        product['isCustomizable'] == true || product['customizable'] == true;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        HapticFeedback.selectionClick();
        AudioService.instance.tap();
        if (slug.isNotEmpty) context.push('/shop/$slug');
      },
      child: Container(
        height: 28,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: GColors.brand, width: 1.5),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.12),
              blurRadius: 6, offset: const Offset(0, 2)),
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
                fontSize: 11, fontWeight: FontWeight.w900,
                color: GColors.brand, letterSpacing: 0.3),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Corporate Gifts — B2B banner with preview grid + CTA
// ─────────────────────────────────────────────────────────────────────────────

class CorporateGiftsSection extends ConsumerWidget {
  const CorporateGiftsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(corporateGiftsProvider);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          AudioService.instance.tap();
          context.push('/shop?tag=corporate');
        },
        child: Builder(builder: (context) {
          final c = GColors.of(context);
          return Container(
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
          decoration: BoxDecoration(
            color: c.bg1,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: c.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: GColors.gold.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text('FOR BUSINESSES', style: GoogleFonts.inter(
                    fontSize: 9, fontWeight: FontWeight.w800,
                    color: c.text0, letterSpacing: 0.8)),
                ),
                const Spacer(),
                const Text('🏢', style: TextStyle(fontSize: 22)),
              ]),
              const Gap(12),
              Text('Corporate Gifting',
                style: GoogleFonts.inter(
                  fontSize: 18, fontWeight: FontWeight.w800,
                  color: c.text0, height: 1.2)),
              const Gap(6),
              Text('Bulk orders, custom branding, GST invoicing',
                style: GoogleFonts.inter(
                  fontSize: 12, color: c.text2, height: 1.45)),
              const Gap(14),
              // Preview thumbnails
              async.when(
                loading: () => _previewShimmer(context),
                error: (_, __) => const SizedBox.shrink(),
                data: (items) {
                  if (items.isEmpty) return _staticPreview(context);
                  return SizedBox(
                    height: 68,
                    child: Row(children: [
                      for (var i = 0; i < items.length.clamp(0, 4); i++) ...[
                        _PreviewThumb(product: items[i]),
                        if (i < items.length.clamp(0, 4) - 1) const Gap(8),
                      ],
                      if (items.length > 4) ...[
                        const Gap(8),
                        Container(
                          width: 68, height: 68,
                          decoration: BoxDecoration(
                            color: c.bg2,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Center(child: Text('+${items.length - 4}',
                            style: GoogleFonts.inter(
                              fontSize: 13, fontWeight: FontWeight.w800,
                              color: c.text0))),
                        ),
                      ],
                    ]),
                  );
                },
              ),
              const Gap(14),
              Row(children: [
                _Chip(icon: '💰', label: '10-50% bulk discount'),
                const Gap(6),
                _Chip(icon: '📦', label: 'Same-day dispatch'),
              ]),
              const Gap(4),
              Row(children: [
                _Chip(icon: '🧾', label: 'GST invoicing'),
                const Gap(6),
                _Chip(icon: '🎨', label: 'Custom branding'),
              ]),
              const Gap(14),
              Row(children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: GColors.brand,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text('Explore Corporate',
                      style: GoogleFonts.inter(
                        fontSize: 12, fontWeight: FontWeight.w800,
                        color: Colors.white)),
                    const Gap(6),
                    const Icon(Icons.arrow_forward_rounded,
                        size: 14, color: Colors.white),
                  ]),
                ),
                const Spacer(),
                GestureDetector(
                  onTap: () => context.push('/help'),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.phone_outlined,
                        size: 13, color: c.text2),
                    const Gap(4),
                    Text('Request quote', style: GoogleFonts.inter(
                      fontSize: 11, fontWeight: FontWeight.w700,
                      color: c.text2)),
                  ]),
                ),
              ]),
            ],
          ),
        );
        }),
      ),
    ).animate().fadeIn(duration: 400.ms, delay: 150.ms);
  }

  Widget _previewShimmer(BuildContext context) {
    final c = GColors.of(context);
    return SizedBox(
      height: 68,
      child: Row(children: List.generate(4, (i) => Expanded(
        child: Padding(
          padding: EdgeInsets.only(right: i < 3 ? 8 : 0),
          child: Shimmer.fromColors(
            baseColor: c.bg2,
            highlightColor: c.border,
            child: Container(
              decoration: BoxDecoration(
                color: c.bg2,
                borderRadius: BorderRadius.circular(10),
              ),
            ),
          ),
        ),
      ))),
    );
  }

  Widget _staticPreview(BuildContext context) {
    final c = GColors.of(context);
    return SizedBox(
      height: 68,
      child: Row(children: [
        for (final emoji in ['🎁', '📦', '☕', '🖼️']) ...[
          Expanded(child: Container(
            height: 68,
            decoration: BoxDecoration(
              color: c.bg2,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(
              child: Text(emoji, style: const TextStyle(fontSize: 30))),
          )),
          if (emoji != '🖼️') const Gap(8),
        ],
      ]),
    );
  }
}

class _PreviewThumb extends StatelessWidget {
  final Map<String, dynamic> product;
  const _PreviewThumb({required this.product});
  @override
  Widget build(BuildContext context) {
    final images = product['images'] as List? ?? [];
    final first = images.isNotEmpty ? images.first : null;
    final slug = (product['slug'] ?? product['id'] ?? '').toString();
    final c = GColors.of(context);
    return Expanded(
      child: GestureDetector(
        onTap: () {
          if (slug.isNotEmpty) context.push('/shop/$slug');
        },
        child: Container(
          height: 68,
          decoration: BoxDecoration(
            color: c.bg2,
            borderRadius: BorderRadius.circular(10),
          ),
          clipBehavior: Clip.antiAlias,
          child: first != null
              ? GiftImage(src: first, fit: BoxFit.cover)
              : const Center(child: Text('🎁', style: TextStyle(fontSize: 28))),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String icon, label;
  const _Chip({required this.icon, required this.label});
  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Expanded(child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: c.bg2,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(children: [
        Text(icon, style: const TextStyle(fontSize: 11)),
        const Gap(4),
        Flexible(child: Text(label,
          maxLines: 1, overflow: TextOverflow.ellipsis,
          style: GoogleFonts.inter(
            fontSize: 10, fontWeight: FontWeight.w600, color: c.text2))),
      ]),
    ));
  }
}
