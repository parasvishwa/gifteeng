// ─── HomeProductCard — unified product card for home-page strips ─────────────
//
// Used by Best Sellers, New Arrivals, Curated for You, and Trending sections.
// One canonical design across the entire home feed so the visual rhythm is
// consistent.
//
// Layout (matching the reference shopping-app design):
//   ┌─────────────────────────────┐
//   │  Image (square)             │
//   │  ┌ rank ribbon (optional) ┐ │
//   │  ┌ "Out of stock" badge   ┐ │
//   │  ┌ heart wishlist top-rt  ┐ │
//   │  ┌ "Only N left" + ADD   ┐ │  ← stock indicator + ADD/Notify
//   ├─────────────────────────────┤
//   │  ₹1,599  ₹3,499 (strike)    │  ← Price FIRST (prominent)
//   │  Product Title (max 2 ln)   │
//   │  ★ 4.5  (32+ orders)        │
//   │  · 9 9 9 · 3 options        │
//   └─────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/services/audio_service.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/gift_image.dart';
import '../../../../core/widgets/same_day_badge.dart';

class HomeProductCard extends StatefulWidget {
  final Map<String, dynamic> product;

  /// Fixed card width for horizontal-scroll strips.
  final double width;

  /// Optional 1-based rank — shows a gold/silver/bronze ribbon for #1-#3.
  final int? rank;

  const HomeProductCard({
    super.key,
    required this.product,
    this.width = 172,
    this.rank,
  });

  @override
  State<HomeProductCard> createState() => _HomeProductCardState();
}

class _HomeProductCardState extends State<HomeProductCard> {
  bool _pressed = false;
  int  _imgPage = 0;

  Color get _rankColor {
    switch (widget.rank) {
      case 1: return const Color(0xFFFFD700);
      case 2: return const Color(0xFFD1D5DB);
      case 3: return const Color(0xFFCD7F32);
      default: return GColors.bg2;
    }
  }

  @override
  Widget build(BuildContext context) {
    final c       = GColors.of(context);
    final p       = widget.product;
    final title   = (p['title'] ?? p['name'] ?? '').toString();
    final slug    = (p['slug'] ?? p['id'] ?? '').toString();
    final basePrice     = (p['basePrice'] ?? p['price'] ?? '0').toString();
    final originalPrice = (p['originalPrice'] ?? p['comparePrice'] ?? '').toString();
    final price   = double.tryParse(basePrice) ?? 0;
    final origP   = double.tryParse(originalPrice) ?? 0;
    final hasOrig = origP > price && origP > 0;

    // Compare-at price can also live under metadata
    final meta    = (p['metadata'] as Map?) ?? const {};
    final metaCmp = meta['compareAtPrice'] ?? meta['mrp'];
    final metaCmpD = metaCmp is num
        ? metaCmp.toDouble()
        : (metaCmp != null ? double.tryParse(metaCmp.toString()) : null);
    final showCmp = hasOrig
        ? origP
        : (metaCmpD != null && metaCmpD > price ? metaCmpD : null);

    // Rating
    final ratingRaw = (p['rating'] ?? p['ratingAvg'] ?? '').toString();
    final ratingD   = double.tryParse(ratingRaw);
    final ratingCnt = ((p['ratingCount'] ?? p['reviewCount']) as num?)?.toInt() ?? 0;

    // Images
    final images     = p['images'] as List?;
    final firstImage = (images != null && images.isNotEmpty) ? images.first : null;
    final imgCount   = images?.length ?? 0;

    // Variations — check multiple shapes the API returns:
    //   1. variants / options: array of variant objects
    //   2. variantOptions: array of variant objects
    //   3. _count.variantOptions: integer count (when admin only returned counts)
    final variantList = (p['variants']        as List?)
        ?? (p['options']         as List?)
        ?? (p['variantOptions']  as List?)
        ?? const [];
    final countFromMeta = (p['_count'] as Map?)?['variantOptions'];
    final variantCount = variantList.isNotEmpty
        ? variantList.length
        : (countFromMeta is num ? countFromMeta.toInt() : 0);
    final swatchColors = <Color>[];
    if (variantList.isNotEmpty && variantList.length <= 4) {
      for (final v in variantList) {
        if (v is Map) {
          final raw   = ((v['color'] ?? v['colorHex'] ?? v['hex'] ?? '')).toString().trim();
          final clean = raw.startsWith('#') ? raw.substring(1) : raw;
          if (clean.length == 6) {
            try {
              swatchColors.add(Color(int.parse('FF$clean', radix: 16)));
            } catch (_) {}
          }
        }
      }
    }

    // Stock — null = unknown (treat as in stock). 0 = sold out.
    final stockRaw = p['inventory'] ?? p['stockCount'] ?? p['stock'] ?? p['quantity'];
    final stock    = stockRaw is int ? stockRaw : int.tryParse(stockRaw?.toString() ?? '');
    final isSoldOut    = stock != null && stock <= 0;
    final isLowStock   = stock != null && stock > 0 && stock <= 5;

    // Cover all API field-name variants (American/British spelling +
    // metadata fallback) so the CUSTOMISE / CUSTOMIZABLE badge always
    // shows for products the backend marks as customisable.
    final isCustomizable = p['isCustomizable']  == true
        || p['customizable']  == true
        || p['customisable']  == true
        || p['isCustomisable'] == true
        || ((p['metadata'] as Map?)?['customizable'] == true)
        || ((p['metadata'] as Map?)?['customisable'] == true);

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
        // Outer card with subtle border + soft shadow so each tile reads
        // as a discrete unit (matches the reference shopping-app design).
        child: Container(
          width: widget.width,
          decoration: BoxDecoration(
            color:        c.bg1,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: c.border, width: 1),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.04),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // ── Image area (square; rounded top inherits from card clip) ──
              SizedBox(
                width: widget.width,
                height: widget.width,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Container(color: c.bg2),
                    // Multi-image swipe
                    if (images != null && imgCount > 1)
                      GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onHorizontalDragEnd: (details) {
                          final v = details.primaryVelocity ?? 0;
                          if (v < -100 && _imgPage < imgCount - 1) {
                            setState(() => _imgPage++);
                          } else if (v > 100 && _imgPage > 0) {
                            setState(() => _imgPage--);
                          }
                        },
                        child: AnimatedSwitcher(
                          duration: const Duration(milliseconds: 220),
                          child: GiftImage(
                            key: ValueKey('${slug}_$_imgPage'),
                            src: images[_imgPage],
                            fit: BoxFit.cover,
                          ),
                        ),
                      )
                    else if (firstImage != null)
                      GiftImage(src: firstImage, fit: BoxFit.cover)
                    else
                      const Center(child: Text('🎁',
                          style: TextStyle(fontSize: 36))),

                    // Out-of-stock dim overlay
                    if (isSoldOut)
                      Container(color: Colors.black.withValues(alpha: 0.35)),

                    // Dot indicators (multi-image)
                    if (imgCount > 1)
                      Positioned(
                        bottom: 44, left: 0, right: 0,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: List.generate(
                            imgCount.clamp(0, 5),
                            (i) => AnimatedContainer(
                              duration: 200.ms,
                              width:  _imgPage == i ? 14 : 5,
                              height: 4,
                              margin: const EdgeInsets.symmetric(horizontal: 2),
                              decoration: BoxDecoration(
                                color: _imgPage == i
                                    ? Colors.white
                                    : Colors.white.withValues(alpha: 0.45),
                                borderRadius: BorderRadius.circular(2),
                              ),
                            ),
                          ),
                        ),
                      ),

                    // Rank ribbon (top-left, #1-#3 only)
                    if (widget.rank != null && widget.rank! <= 3)
                      Positioned(
                        top: 0, left: 0,
                        child: Container(
                          padding: const EdgeInsets.fromLTRB(8, 5, 10, 5),
                          decoration: BoxDecoration(
                            color: _rankColor,
                            borderRadius: const BorderRadius.only(
                              topLeft:     Radius.circular(13),
                              bottomRight: Radius.circular(10),
                            ),
                          ),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            Text('#${widget.rank}',
                              style: GoogleFonts.inter(
                                fontSize: 12,
                                fontWeight: FontWeight.w900,
                                color: Colors.black,
                                letterSpacing: -0.3)),
                            if (widget.rank == 1) ...[
                              const Gap(3),
                              const Text('👑', style: TextStyle(fontSize: 11)),
                            ],
                          ]),
                        ),
                      ),

                    // "Out of stock" pill (top-right) — the CUSTOMISE
                    // button below the image already communicates
                    // customisability, no need for a separate badge.
                    if (isSoldOut)
                      Positioned(
                        top: 8, right: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.75),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text('Out of stock',
                            style: GoogleFonts.inter(
                              fontSize: 9, fontWeight: FontWeight.w700,
                              color: Colors.white, letterSpacing: 0.2)),
                        ),
                      ),

                    // Stock pill (bottom-left of image) — low-stock only
                    if (isLowStock)
                      Positioned(
                        left: 8, bottom: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 3),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.92),
                            borderRadius: BorderRadius.circular(5),
                          ),
                          child: Text('$stock left',
                            style: GoogleFonts.inter(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w700,
                              color: const Color(0xFFEF3752))),
                        ),
                      ),
                  ],
                ),
              ),

              // Info area — padded so text/badges aren't flush against
              // the card border. Order: price + button (side-by-side), then
              // title, then rating + variation below.
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // ── Price (left) + ADD/CUSTOMISE/NOTIFY button (right) ──
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Expanded(
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Flexible(
                                child: Text('₹${price.toInt()}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: GoogleFonts.inter(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w900,
                                    color: c.text0,
                                    height: 1.1)),
                              ),
                              if (showCmp != null) ...[
                                const Gap(4),
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 1),
                                  child: Text('₹${showCmp.toInt()}',
                                    style: GoogleFonts.inter(
                                      fontSize: 10, color: c.text2,
                                      decoration: TextDecoration.lineThrough,
                                      decorationColor: c.text2)),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const Gap(6),
                        _AddOrNotifyButton(
                          slug: slug,
                          isSoldOut: isSoldOut,
                          isCustomizable: isCustomizable,
                        ),
                      ],
                    ),

                    const Gap(6),

                    // ── Title ───────────────────────────────────────────
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: c.text0,
                        height: 1.3,
                      ),
                    ),

                    // ── Same-day delivery badge (Mumbai metro only) ──────
                    const Padding(
                      padding: EdgeInsets.only(top: 5),
                      child: SameDayBadge(),
                    ),

                    const Gap(5),

                    // ── Rating row ──────────────────────────────────────
                    if (ratingD != null || ratingCnt > 0)
                      Row(
                        children: [
                          if (ratingD != null) ...[
                            const Icon(Icons.star_rounded,
                                size: 11, color: Color(0xFFFCBF17)),
                            const Gap(2),
                            Text(ratingD.toStringAsFixed(1),
                                style: GoogleFonts.inter(
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w600,
                                    color: c.text1)),
                            const Gap(4),
                          ],
                          if (ratingCnt > 0)
                            Flexible(
                              child: Text(
                                '($ratingCnt+ orders)',
                                style: GoogleFonts.inter(
                                  fontSize: 10, color: c.text2),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                        ],
                      ),

                    // ── Variation row (pill so it actually reads) ───────
                    if (variantCount > 0) ...[
                      if (ratingD != null || ratingCnt > 0) const Gap(5),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 3),
                        decoration: BoxDecoration(
                          color: c.bg2,
                          borderRadius: BorderRadius.circular(5),
                          border: Border.all(color: c.border, width: 0.8),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (swatchColors.length >= 2) ...[
                              ...swatchColors.take(4).map((sc) => Container(
                                    width: 10, height: 10,
                                    margin: const EdgeInsets.only(right: 3),
                                    decoration: BoxDecoration(
                                      color: sc,
                                      shape: BoxShape.circle,
                                      border: Border.all(
                                          color: c.border, width: 0.8),
                                    ),
                                  )),
                              const Gap(4),
                            ] else ...[
                              const Text('🎨', style: TextStyle(fontSize: 10)),
                              const Gap(4),
                            ],
                            Text(
                              '$variantCount ${variantCount == 1 ? 'option' : 'options'}',
                              style: GoogleFonts.inter(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: c.text1),
                            ),
                          ],
                        ),
                      ),
                    ],
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

// ─── ADD / NOTIFY button (compact, overlaid on the image) ─────────────────────

class _AddOrNotifyButton extends StatelessWidget {
  final String slug;
  final bool   isSoldOut;
  final bool   isCustomizable;
  const _AddOrNotifyButton({
    required this.slug,
    required this.isSoldOut,
    required this.isCustomizable,
  });

  @override
  Widget build(BuildContext context) {
    final label = isSoldOut
        ? 'NOTIFY'
        : (isCustomizable ? 'CUSTOMISE' : 'ADD');
    final icon = isSoldOut
        ? Icons.notifications_active_outlined
        : (isCustomizable
            ? Icons.auto_fix_high_rounded
            : Icons.shopping_bag_outlined);

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        HapticFeedback.lightImpact();
        AudioService.instance.tap();
        if (isSoldOut) {
          ScaffoldMessenger.of(context)
            ..clearSnackBars()
            ..showSnackBar(SnackBar(
              behavior: SnackBarBehavior.floating,
              duration: const Duration(seconds: 2),
              backgroundColor: const Color(0xFF111827),
              margin: const EdgeInsets.fromLTRB(16, 0, 16, 80),
              shape: const RoundedRectangleBorder(
                borderRadius: BorderRadius.all(Radius.circular(12)),
              ),
              content: Text(
                "🔔 We'll notify you when this is back in stock!",
                style: GoogleFonts.inter(fontWeight: FontWeight.w500),
              ),
            ));
          return;
        }
        if (slug.isNotEmpty) context.push('/shop/$slug');
      },
      child: Container(
        height: 28,
        padding: const EdgeInsets.symmetric(horizontal: 9),
        decoration: BoxDecoration(
          color: GColors.brand,
          borderRadius: BorderRadius.circular(7),
          boxShadow: [
            BoxShadow(
              color: GColors.brand.withValues(alpha: 0.25),
              blurRadius: 4,
              offset: const Offset(0, 1),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 11, color: Colors.white),
            const Gap(3),
            Text(label,
                style: GoogleFonts.inter(
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                  letterSpacing: 0.3,
                )),
          ],
        ),
      ),
    );
  }
}
