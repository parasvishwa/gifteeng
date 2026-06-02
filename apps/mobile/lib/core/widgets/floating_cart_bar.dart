// ─── FloatingCartBar — compact bottom-right cart shortcut ───────────────────
//
// A small floating pill anchored to the bottom-right (≈25% of screen width).
// Renders a thumbnail / count + "Cart" label + chevron + dismiss button.
// Auto-hides when the cart is empty or when the user manually dismisses it.
//
// The dismiss state is session-only (local to this widget instance) — the
// pill reappears on next app launch / navigation cycle so the user isn't
// permanently cut off from their cart.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../api/api_client.dart';
import '../theme/app_theme.dart';
import 'gift_image.dart';

// ─── Cart preview provider ───────────────────────────────────────────────────

class CartPreview {
  final int totalItems;
  final List<dynamic> thumbnails;
  const CartPreview({required this.totalItems, required this.thumbnails});
}

final cartItemsPreviewProvider =
    FutureProvider.autoDispose<CartPreview>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/cart');
    final items = (res.data as Map?)?['items'] as List? ?? [];
    int total = 0;
    final thumbs = <dynamic>[];
    for (final raw in items) {
      if (raw is! Map) continue;
      final qty = (raw['qty'] as num?)?.toInt() ??
          (raw['quantity'] as num?)?.toInt() ?? 1;
      total += qty;
      final product = raw['product'] ?? raw['item'] ?? raw;
      if (product is Map) {
        final imgs = product['images'] ?? product['image'];
        if (imgs is List && imgs.isNotEmpty) {
          thumbs.add(imgs.first);
        } else if (imgs is String && imgs.isNotEmpty) {
          thumbs.add(imgs);
        } else if (imgs is Map) {
          thumbs.add(imgs);
        }
      }
    }
    return CartPreview(totalItems: total, thumbnails: thumbs.take(1).toList());
  } catch (_) {
    return const CartPreview(totalItems: 0, thumbnails: []);
  }
});

// ─── The floating bar widget ─────────────────────────────────────────────────

class FloatingCartBar extends ConsumerStatefulWidget {
  final double bottomOffset;
  const FloatingCartBar({super.key, this.bottomOffset = 12});

  @override
  ConsumerState<FloatingCartBar> createState() => _FloatingCartBarState();
}

class _FloatingCartBarState extends ConsumerState<FloatingCartBar> {
  bool   _dismissed = false;
  double _dragX     = 0.0;

  /// Threshold: drag this many px to the right to dismiss.
  static const double _dismissThresholdPx = 60.0;

  void _onDragUpdate(DragUpdateDetails d) {
    setState(() {
      _dragX = (_dragX + d.delta.dx).clamp(0.0, 200.0);
    });
  }

  void _onDragEnd(DragEndDetails d) {
    if (_dragX > _dismissThresholdPx ||
        (d.primaryVelocity ?? 0) > 600) {
      HapticFeedback.lightImpact();
      setState(() => _dismissed = true);
    } else {
      // Snap back
      setState(() => _dragX = 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_dismissed) return const SizedBox.shrink();

    final async   = ref.watch(cartItemsPreviewProvider);
    final preview = async.valueOrNull;
    if (preview == null || preview.totalItems == 0) {
      return const SizedBox.shrink();
    }

    final n     = preview.totalItems;
    final thumb = preview.thumbnails.isNotEmpty ? preview.thumbnails.first : null;

    // Pill fades as it's dragged right so the user gets visual feedback.
    final dragOpacity = (1.0 - (_dragX / 200.0)).clamp(0.0, 1.0);

    return Positioned(
      right:  12,
      bottom: widget.bottomOffset,
      child: SafeArea(
        top: false,
        child: Transform.translate(
          offset: Offset(_dragX, 0),
          child: Opacity(
            opacity: dragOpacity,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                // Main pill — tap to open cart, horizontal drag to dismiss.
                GestureDetector(
              onTap: () {
                HapticFeedback.lightImpact();
                context.push('/cart');
              },
              onHorizontalDragUpdate: _onDragUpdate,
              onHorizontalDragEnd:    _onDragEnd,
              child: Container(
                height: 44,
                padding: const EdgeInsets.fromLTRB(6, 4, 14, 4),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.centerLeft,
                    end:   Alignment.centerRight,
                    colors: [Color(0xFF15803D), Color(0xFF16A34A)],
                  ),
                  borderRadius: BorderRadius.circular(22),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF15803D).withValues(alpha: 0.35),
                      blurRadius: 10,
                      offset: const Offset(0, 3),
                    ),
                  ],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Thumbnail or bag icon
                    Container(
                      width: 36, height: 36,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white.withValues(alpha: 0.15),
                        border: Border.all(color: Colors.white, width: 1.5),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: thumb != null
                          ? GiftImage(src: thumb, fit: BoxFit.cover)
                          : const Icon(Icons.shopping_bag_rounded,
                              color: Colors.white, size: 18),
                    ),
                    const Gap(8),
                    Text(
                      'Cart · $n',
                      style: GoogleFonts.inter(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        letterSpacing: 0.2,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Close button (top-left corner of the pill)
            Positioned(
              top: -6, left: -6,
              child: GestureDetector(
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _dismissed = true);
                },
                child: Container(
                  width: 22, height: 22,
                  decoration: BoxDecoration(
                    color: GColors.of(context).bg0,
                    shape: BoxShape.circle,
                    border: Border.all(
                        color: GColors.of(context).border, width: 1),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.15),
                        blurRadius: 4,
                        offset: const Offset(0, 1),
                      ),
                    ],
                  ),
                  child: Icon(Icons.close_rounded,
                      size: 14, color: GColors.of(context).text1),
                ),
              ),
            ),
              ],
            ),
          ),
        ),
      ).animate().slideX(
            begin: 1.5,
            end: 0,
            duration: 320.ms,
            curve: Curves.easeOutCubic,
          ).fadeIn(duration: 220.ms),
    );
  }
}
