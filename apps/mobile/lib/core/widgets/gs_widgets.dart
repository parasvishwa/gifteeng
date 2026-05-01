// ─── Gifteeng Shared Widget Library (gs_widgets) ──────────────────────────────
//
// A small set of pre-styled primitives that enforce the design system at the
// widget level. Use these instead of raw Container/Text/GestureDetector in
// every feature screen.
//
// Exports:
//   GsCard            — bg1 surface, 16px corner, no border
//   GsPrimaryButton   — brand-red CTA, 12px corner, white text
//   GsSecondaryButton — muted outline variant
//   GsSectionHeader   — emoji + 18px title + optional "View all" link
//   GsBadge           — pill chip for labels / tags
//   GsProductCard     — 1:1 square image + category + title + price
//   GsListTile        — icon + title + subtitle + chevron, card-group ready
//   GsListGroup       — wraps multiple GsListTile rows in a bg1 card container
//
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/app_theme.dart';
import '../theme/ds.dart';
import 'gift_image.dart';

// ─── GsCard ───────────────────────────────────────────────────────────────────

/// Standard surface card. Wraps [child] in the project card style:
/// `GColors.bg1` background, `DS.rCard` (16px) corner radius, no border,
/// optional subtle shadow.
class GsCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final bool hasShadow;
  final VoidCallback? onTap;

  const GsCard({
    super.key,
    required this.child,
    this.padding,
    this.hasShadow = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    Widget card = Container(
      decoration: BoxDecoration(
        color: c.bg1,
        borderRadius: DS.rrCard,
        boxShadow: hasShadow ? DS.shadowCard : null,
      ),
      padding: padding,
      child: child,
    );

    if (onTap != null) {
      card = GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap!();
        },
        child: card,
      );
    }

    return card;
  }
}

// ─── GsPrimaryButton ──────────────────────────────────────────────────────────

/// Brand-red CTA button. Full-width by default. Disable by passing
/// `onPressed: null`.
class GsPrimaryButton extends StatefulWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final double height;
  final Widget? leadingIcon;

  const GsPrimaryButton({
    super.key,
    required this.label,
    this.onPressed,
    this.loading = false,
    this.height = 52,
    this.leadingIcon,
  });

  @override
  State<GsPrimaryButton> createState() => _GsPrimaryButtonState();
}

class _GsPrimaryButtonState extends State<GsPrimaryButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onPressed != null && !widget.loading;
    final bg = enabled ? GColors.brand : GColors.brand.withValues(alpha: 0.45);

    return GestureDetector(
      onTapDown:   enabled ? (_) => setState(() => _pressed = true)  : null,
      onTapUp:     enabled ? (_) { setState(() => _pressed = false); widget.onPressed!(); } : null,
      onTapCancel: enabled ? ()  => setState(() => _pressed = false) : null,
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1.0,
        duration: const Duration(milliseconds: 110),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          height: widget.height,
          decoration: BoxDecoration(
            color: bg,
            borderRadius: DS.rrButton,
          ),
          child: Center(
            child: widget.loading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.white,
                    ),
                  )
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (widget.leadingIcon != null) ...[
                        widget.leadingIcon!,
                        const Gap(DS.spInline),
                      ],
                      Text(
                        widget.label,
                        style: GoogleFonts.inter(
                          fontSize: DS.fsH3,
                          fontWeight: DS.wBold,
                          color: Colors.white,
                          letterSpacing: 0.1,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

// ─── GsSecondaryButton ────────────────────────────────────────────────────────

/// Muted secondary CTA. Uses `GColors.bg2` fill + `GColors.text0` label so
/// it reads as a clear but lower-priority action.
class GsSecondaryButton extends StatefulWidget {
  final String label;
  final VoidCallback? onPressed;
  final double height;

  const GsSecondaryButton({
    super.key,
    required this.label,
    this.onPressed,
    this.height = 48,
  });

  @override
  State<GsSecondaryButton> createState() => _GsSecondaryButtonState();
}

class _GsSecondaryButtonState extends State<GsSecondaryButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown:   (_) => setState(() => _pressed = true),
      onTapUp:     (_) { setState(() => _pressed = false); widget.onPressed?.call(); },
      onTapCancel: ()  => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1.0,
        duration: const Duration(milliseconds: 110),
        child: Container(
          height: widget.height,
          decoration: BoxDecoration(
            color: GColors.of(context).bg2,
            borderRadius: DS.rrButton,
          ),
          child: Center(
            child: Text(
              widget.label,
              style: GoogleFonts.inter(
                fontSize: DS.fsH3,
                fontWeight: DS.wSemi,
                color: GColors.of(context).text0,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ─── GsSectionHeader ──────────────────────────────────────────────────────────

/// Standardised section header used across every home screen section.
///
/// Pattern:  [emoji]  [title]  ···  [View all →]
///
/// Pass `viewAllLabel: null` to hide the "View all" link.
class GsSectionHeader extends StatelessWidget {
  final String emoji;
  final String title;
  final String? viewAllLabel;
  final VoidCallback? onViewAll;

  const GsSectionHeader({
    super.key,
    required this.emoji,
    required this.title,
    this.viewAllLabel = 'View all',
    this.onViewAll,
  });

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Row(
      children: [
        Text(emoji, style: const TextStyle(fontSize: 20)),
        const Gap(DS.spInline),
        Text(
          title,
          style: GoogleFonts.inter(
            fontSize: DS.fsH2,
            fontWeight: DS.wBold,
            color: c.text0,
            letterSpacing: -0.2,
          ),
        ),
        if (viewAllLabel != null && onViewAll != null) ...[
          const Spacer(),
          GestureDetector(
            onTap: onViewAll,
            child: Text(
              viewAllLabel!,
              style: GoogleFonts.inter(
                fontSize: DS.fsBodySm,
                fontWeight: DS.wMedium,
                color: GColors.brand,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

// ─── GsBadge ─────────────────────────────────────────────────────────────────

/// Small pill badge — NEW, SALE, HOT, etc.
class GsBadge extends StatelessWidget {
  final String label;
  final Color? color;

  const GsBadge({super.key, required this.label, this.color});

  @override
  Widget build(BuildContext context) {
    final bg = color ?? GColors.brand;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: DS.rrPill,
      ),
      child: Text(
        label.toUpperCase(),
        style: GoogleFonts.inter(
          fontSize: DS.fsLabel,
          fontWeight: DS.wBold,
          color: Colors.white,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

// ─── GsProductCard ───────────────────────────────────────────────────────────

/// Standard product card used in grids across the app.
///
/// • 1:1 square image (AspectRatio) at the top
/// • Category eyebrow, product name, price in the lower section
/// • Brand-red "+" add-to-cart button
/// • Press-to-scale micro-animation
///
/// The card itself handles tap navigation to [onTap].
class GsProductCard extends StatefulWidget {
  final Map<String, dynamic> product;
  final VoidCallback? onTap;
  final VoidCallback? onAdd;
  final int animIndex;

  const GsProductCard({
    super.key,
    required this.product,
    this.onTap,
    this.onAdd,
    this.animIndex = 0,
  });

  @override
  State<GsProductCard> createState() => _GsProductCardState();
}

class _GsProductCardState extends State<GsProductCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final p          = widget.product;
    final title      = (p['title']        ?? p['name']   ?? '') as String;
    final catName    = (p['categoryName'] ?? p['category'] ?? '') as String;
    final basePrice  = (p['basePrice']    ?? p['price']  ?? '0').toString();
    final origPrice  = (p['originalPrice']?? p['comparePrice'] ?? '').toString();
    final ratingRaw  = (p['rating']       ?? '').toString();
    final images     = p['images'] as List?;
    final firstImage = (images != null && images.isNotEmpty) ? images.first : null;

    final price   = double.tryParse(basePrice)  ?? 0;
    final origP   = double.tryParse(origPrice)  ?? 0;
    final hasOrig = origP > price && origP > 0;
    final ratingD = double.tryParse(ratingRaw);

    return GestureDetector(
      onTapDown:   (_) => setState(() => _pressed = true),
      onTapUp:     (_) { setState(() => _pressed = false); widget.onTap?.call(); },
      onTapCancel: ()  => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1.0,
        duration: const Duration(milliseconds: 110),
        child: Container(
          decoration: BoxDecoration(
            color: GColors.of(context).bg1,
            borderRadius: DS.rrCard,
            border: Border.all(color: GColors.of(context).border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── 1:1 square image ──────────────────────────────────────────
              AspectRatio(
                aspectRatio: 1,
                child: ClipRRect(
                  borderRadius: const BorderRadius.only(
                    topLeft:  Radius.circular(DS.rCard),
                    topRight: Radius.circular(DS.rCard),
                  ),
                  child: firstImage != null
                      ? GiftImage(src: firstImage, fit: BoxFit.cover)
                      : Container(
                          color: GColors.of(context).bg2,
                          child: const Center(
                            child: Text('🎁', style: TextStyle(fontSize: 36)),
                          ),
                        ),
                ),
              ),

              // ── Info area ─────────────────────────────────────────────────
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (catName.isNotEmpty) ...[
                        Text(
                          catName.toUpperCase(),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(
                            fontSize: DS.fsLabel,
                            fontWeight: DS.wBold,
                            color: GColors.of(context).text2,
                            letterSpacing: 0.8,
                          ),
                        ),
                        const Gap(DS.spMicro),
                      ],
                      Text(
                        title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.inter(
                          fontSize: DS.fsBody,
                          fontWeight: DS.wSemi,
                          color: GColors.of(context).text0,
                          height: 1.3,
                        ),
                      ),
                      const Spacer(),
                      if (ratingD != null)
                        Row(
                          children: [
                            const Icon(Icons.star_rounded,
                                size: 11, color: Color(0xFFFCBF17)),
                            const Gap(3),
                            Text(
                              ratingD.toStringAsFixed(1),
                              style: GoogleFonts.inter(
                                  fontSize: 11, color: GColors.of(context).text1),
                            ),
                          ],
                        ),
                      const Gap(DS.spMicro),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          Text(
                            '₹${price.toInt()}',
                            style: GoogleFonts.inter(
                              fontSize: 15,
                              fontWeight: DS.wBlack,
                              color: GColors.of(context).text0,
                            ),
                          ),
                          if (hasOrig) ...[
                            const Gap(DS.spInline),
                            Text(
                              '₹${origP.toInt()}',
                              style: GoogleFonts.inter(
                                fontSize: 10,
                                color: GColors.of(context).text2,
                                decoration: TextDecoration.lineThrough,
                                decorationColor: GColors.of(context).text2,
                              ),
                            ),
                          ],
                          const Spacer(),
                          // Brand-red add button
                          GestureDetector(
                            onTap: () {
                              HapticFeedback.lightImpact();
                              widget.onAdd?.call();
                            },
                            child: Container(
                              width: 32,
                              height: 32,
                              decoration: const BoxDecoration(
                                color: GColors.brand,
                                borderRadius: DS.rrChip,
                              ),
                              child: const Center(
                                child: Icon(Icons.add,
                                    color: Colors.white, size: 18),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── GsListTile ───────────────────────────────────────────────────────────────

/// Standard settings / profile list row.
///
/// Design: muted icon square (bg2) · title · subtitle · chevron
///
/// Rules from spec §16:
/// - Card-based (wrap in GsListGroup)
/// - Left icon square, single consistent style (no rainbow accents)
/// - Title 14px w700 text0, subtitle 11px w500 text2
/// - Right chevron text2
/// - Press = scale 0.98 + bg2 flash
/// - Subtle left dividers provided by GsListGroup
class GsListTile extends StatefulWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback? onTap;
  final Widget? trailing;
  final bool showChevron;
  final int animIndex;

  const GsListTile({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.onTap,
    this.trailing,
    this.showChevron = true,
    this.animIndex = 0,
  });

  @override
  State<GsListTile> createState() => _GsListTileState();
}

class _GsListTileState extends State<GsListTile> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown:   (_) => setState(() => _pressed = true),
      onTapUp:     (_) {
        setState(() => _pressed = false);
        HapticFeedback.selectionClick();
        widget.onTap?.call();
      },
      onTapCancel: ()  => setState(() => _pressed = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 110),
        color: _pressed ? GColors.of(context).bg2 : Colors.transparent,
        padding: const EdgeInsets.symmetric(horizontal: DS.sp16, vertical: 14),
        child: Row(
          children: [
            // Icon badge — single muted style, no rainbow accents
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: GColors.of(context).bg2,
                borderRadius: DS.rrChip,
              ),
              child: Icon(widget.icon, color: GColors.of(context).text1, size: 19),
            ),
            const Gap(DS.sp12),
            // Text content
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    widget.title,
                    style: GoogleFonts.inter(
                      fontSize: DS.fsBody,
                      fontWeight: DS.wSemi,
                      color: GColors.of(context).text0,
                    ),
                  ),
                  if (widget.subtitle != null) ...[
                    const Gap(2),
                    Text(
                      widget.subtitle!,
                      style: GoogleFonts.inter(
                        fontSize: 11,
                        fontWeight: DS.wNormal,
                        color: GColors.of(context).text2,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            // Trailing widget or chevron
            widget.trailing ??
              (widget.showChevron
                ? Icon(
                    Icons.chevron_right_rounded,
                    color: GColors.of(context).text2,
                    size: 18,
                  )
                : const SizedBox.shrink()),
          ],
        ),
      ),
    );
  }
}

// ─── GsListGroup ─────────────────────────────────────────────────────────────

/// Wraps a list of [GsListTile] rows in a clean bg1 card.
/// Adds hair-line dividers between rows automatically.
///
/// Usage:
///   GsListGroup(
///     children: [
///       GsListTile(icon: Icons.shopping_bag_rounded, title: 'Orders', ...),
///       GsListTile(icon: Icons.toll_rounded,         title: 'Goins',  ...),
///     ],
///   )
class GsListGroup extends StatelessWidget {
  final List<Widget> children;
  const GsListGroup({super.key, required this.children});

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Container(
      decoration: BoxDecoration(
        color: c.bg1,
        borderRadius: DS.rrCard,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: List.generate(children.length, (i) {
          final isLast = i == children.length - 1;
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              children[i],
              if (!isLast)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: DS.sp16),
                  child: Divider(height: 1, color: c.border),
                ),
            ],
          );
        }),
      ),
    );
  }
}
