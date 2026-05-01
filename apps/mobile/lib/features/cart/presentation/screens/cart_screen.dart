import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:gap/gap.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/g_button.dart';
import '../../../../core/widgets/gift_image.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/services/audio_service.dart';
import '../../../../core/analytics/analytics_service.dart';
import '../widgets/cart_winnings.dart';

// ─── Fixed accent colour (same in dark & light) ───────────────────────────────
const _kBrand = GColors.brand; // coral #EF3752

// ─── Public settings (delivery threshold + charge) ───────────────────────────
final _cartSettingsProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/settings/public');
    final data = res.data;
    if (data is Map) return Map<String, dynamic>.from(data);
  } catch (_) {}
  return const {'delivery_charge': '59', 'free_delivery_above': '499'};
});

// ─── Free-gift banner types & provider ───────────────────────────────────────

class _FreeGiftInfo {
  final String productId, productSlug, productTitle, status;
  final double shippingInr, remainingInr, minCartInr;
  final String? imageUrl;
  const _FreeGiftInfo({
    required this.productId,
    required this.productSlug,
    required this.productTitle,
    required this.status,
    required this.shippingInr,
    required this.remainingInr,
    required this.minCartInr,
    this.imageUrl,
  });
}

// Family key = subtotal as int (avoids float noise; triggers re-fetch on change)
final _freeGiftProvider = FutureProvider.autoDispose
    .family<_FreeGiftInfo?, int>((ref, subtotalInt) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/cart/free-gift-state');
    final data = res.data;
    if (data is! Map) return null;
    final gifts = data['eligibleGifts'] as List?;
    if (gifts == null || gifts.isEmpty) return null;
    final g = gifts.first as Map;
    final p = g['product'] as Map? ?? const {};
    final imgs = p['images'];
    String? img;
    if (imgs is List && imgs.isNotEmpty) img = imgs.first?.toString();
    return _FreeGiftInfo(
      productId:    (p['id']    ?? p['_id'] ?? '').toString(),
      productSlug:  (p['slug']  ?? '').toString(),
      productTitle: (p['title'] ?? p['name'] ?? 'Free Gift').toString(),
      status:       (g['status']       ?? 'locked').toString(),
      shippingInr:  (g['shippingInr']  as num?)?.toDouble() ?? 0,
      remainingInr: (g['remainingInr'] as num?)?.toDouble() ?? 0,
      minCartInr:   (g['minCartInr']   as num?)?.toDouble() ?? 0,
      imageUrl:     img,
    );
  } catch (_) {
    return null;
  }
});

// ─── Recommended products (fills empty space at the bottom of the cart) ──────

final _cartRecommendedProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/products',
        queryParameters: {'pageSize': '8', 'sort': 'popular'});
    final data = res.data;
    if (data is List) {
      return List<Map<String, dynamic>>.from(
          data.map((e) => Map<String, dynamic>.from(e as Map)));
    }
    if (data is Map) {
      final raw = data['items'] ?? data['data'] ?? data['products'] ?? [];
      if (raw is List) {
        return List<Map<String, dynamic>>.from(
            raw.map((e) => Map<String, dynamic>.from(e as Map)));
      }
    }
  } catch (_) {}
  return [];
});

// ─── Reward-derived cart summary ─────────────────────────────────────────────
// POSTs /rewards/compute and returns the discount + total. Family-keyed
// by subtotal-as-int so a cart change re-fetches with the new subtotal.
// Returns null when the user is logged out or has no applied rewards.
class CartSummary {
  final double subtotal;
  final double discountInr;
  final double shippingInr;
  final double giftWrapInr;
  final double totalInr;
  final List<Map<String, dynamic>> breakdown;
  const CartSummary({
    required this.subtotal,
    required this.discountInr,
    required this.shippingInr,
    required this.giftWrapInr,
    required this.totalInr,
    required this.breakdown,
  });
}

final cartSummaryProvider =
    FutureProvider.autoDispose.family<CartSummary?, int>((ref, subtotalInt) async {
  if (subtotalInt <= 0) return null;
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.post('/rewards/compute', data: {
      'subtotal':  subtotalInt,
      'shipping':  0,
      'giftWrap':  0,
    });
    final m = res.data;
    if (m is Map) {
      final breakdownList = (m['breakdown'] is List)
          ? List<Map<String, dynamic>>.from(
              (m['breakdown'] as List).map((e) => Map<String, dynamic>.from(e as Map)))
          : <Map<String, dynamic>>[];
      return CartSummary(
        subtotal:    (m['subtotal']    as num?)?.toDouble() ?? subtotalInt.toDouble(),
        discountInr: (m['discountInr'] as num?)?.toDouble() ?? 0,
        shippingInr: (m['shippingInr'] as num?)?.toDouble() ?? 0,
        giftWrapInr: (m['giftWrapInr'] as num?)?.toDouble() ?? 0,
        totalInr:    (m['totalInr']    as num?)?.toDouble() ?? subtotalInt.toDouble(),
        breakdown:   breakdownList,
      );
    }
  } catch (_) { /* not authed or no rewards applied */ }
  return null;
});

// ─── Cart provider (with auto-enrichment) ────────────────────────────────────

final cartProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get('/cart');
  final cart = Map<String, dynamic>.from(res.data as Map);

  // Enrich items: if `product` is missing, fetch it by productId.
  final items = (cart['items'] as List?) ?? [];
  final needs = <int, String>{};
  for (var i = 0; i < items.length; i++) {
    final item = items[i];
    if (item is! Map) continue;
    final hasProduct = item['product'] is Map;
    if (!hasProduct) {
      final pid = (item['productId'] ?? item['product_id'])?.toString();
      if (pid != null && pid.isNotEmpty) needs[i] = pid;
    }
  }

  if (needs.isNotEmpty) {
    final fetches = needs.entries.map((e) async {
      try {
        final pres = await dio.get('/products/${e.value}');
        return MapEntry(e.key, Map<String, dynamic>.from(pres.data as Map));
      } catch (_) {
        return MapEntry(e.key, <String, dynamic>{});
      }
    }).toList();
    final results = await Future.wait(fetches);
    for (final r in results) {
      if (r.value.isNotEmpty) {
        (items[r.key] as Map)['product'] = r.value;
      }
    }
  }
  cart['items'] = items;
  return cart;
});

// ─── Screen ──────────────────────────────────────────────────────────────────

class CartScreen extends ConsumerStatefulWidget {
  const CartScreen({super.key});
  @override
  ConsumerState<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends ConsumerState<CartScreen> {
  final Set<String> _deletedIds = {}; // optimistic delete hide
  final Map<String, bool> _updating = {}; // per-item spinner

  @override
  void initState() {
    super.initState();
    Analytics.screen('/cart');
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  Future<void> _removeItem(String itemId) async {
    HapticFeedback.lightImpact();
    setState(() => _deletedIds.add(itemId));
    try {
      await ref.read(dioProvider).delete('/cart/items/$itemId');
      ref.invalidate(cartProvider);
    } catch (e) {
      if (mounted) {
        setState(() => _deletedIds.remove(itemId));
        _snack('Could not remove item');
      }
    }
  }

  Future<void> _updateQty(Map<String, dynamic> item, int newQty) async {
    final id = (item['id'] ?? item['_id'] ?? '').toString();
    if (id.isEmpty) return;
    HapticFeedback.selectionClick();
    AudioService.instance.tap();
    setState(() => _updating[id] = true);
    try {
      final dio = ref.read(dioProvider);
      await dio.delete('/cart/items/$id');
      if (newQty > 0) {
        final pid = (item['productId']
            ?? item['product']?['id']
            ?? item['product']?['_id'] ?? '').toString();
        final variantOptions = item['variantOptions'] as Map<String, dynamic>?;
        final customization = item['customization'];
        if (pid.isNotEmpty) {
          final body = <String, dynamic>{'productId': pid, 'qty': newQty};
          if (variantOptions != null && variantOptions.isNotEmpty) {
            body['variantOptions'] = variantOptions;
          }
          if (customization != null) body['customization'] = customization;
          await dio.post('/cart/items', data: body);
        }
      }
      ref.invalidate(cartProvider);
    } catch (e) {
      if (mounted) _snack('Could not update quantity');
      ref.invalidate(cartProvider);
    } finally {
      if (mounted) setState(() => _updating.remove(id));
    }
  }

  Future<void> _clearAll() async {
    final _c = GColors.of(context);
    final confirm = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        backgroundColor: _c.bg1,
        title: Text('Clear cart?', style: GoogleFonts.inter(
          fontSize: 18, fontWeight: FontWeight.w800, color: _c.text0)),
        content: Text('This will remove all items from your cart.',
          style: GoogleFonts.inter(fontSize: 13, color: _c.text1)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(d, false),
            child: Text('Cancel', style: GoogleFonts.inter(color: _c.text2)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(d, true),
            child: Text('Clear', style: GoogleFonts.inter(
              color: _c.brand, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    HapticFeedback.mediumImpact();
    try {
      await ref.read(dioProvider).delete('/cart');
      ref.invalidate(cartProvider);
    } catch (_) {
      _snack('Could not clear cart');
    }
  }

  Future<void> _editCustomization(Map<String, dynamic> item) async {
    HapticFeedback.selectionClick();
    final partialProduct = (item['product'] as Map?)?.cast<String, dynamic>();
    final customization  = item['customization'];

    // Prefer slug for readability, fall back to UUID productId.
    // `item.productId` is always present in cart items; `product.slug` may be absent.
    final slugOrId =
        (partialProduct?['slug']?.toString() ?? '').isNotEmpty
            ? partialProduct!['slug'].toString()
            : (partialProduct?['id']?.toString()
                ?? partialProduct?['_id']?.toString()
                ?? item['productId']?.toString()
                ?? item['product_id']?.toString()
                ?? '');

    if (slugOrId.isEmpty) {
      _snack('Cannot edit — product details missing');
      return;
    }

    // Always re-fetch the FULL product so metadata.customizer.canvas is present.
    // The cart API often returns a partial product summary without zone config,
    // which causes the customizer to fall back to the free-form canvas editor.
    Map<String, dynamic> fullProduct = partialProduct ?? {};
    try {
      final res = await ref.read(dioProvider).get('/products/$slugOrId');
      if (res.data is Map) {
        fullProduct = Map<String, dynamic>.from(res.data as Map);
      }
    } catch (_) {
      // Fetch failed — fall back to whatever partial data we have.
    }

    if (!mounted) return;
    context.push('/customize', extra: <String, dynamic>{
      ...fullProduct,
      '__existingCustomization': customization,
      '__cartItemId': item['id'] ?? item['_id'],
    });
  }

  void _snack(String msg) {
    final _c = GColors.of(context);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg, style: GoogleFonts.inter(fontWeight: FontWeight.w500)),
      behavior: SnackBarBehavior.floating,
      backgroundColor: _c.text0,
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 80),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ));
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final _c            = GColors.of(context);
    final cartAsync     = ref.watch(cartProvider);
    final topPad        = MediaQuery.of(context).padding.top;
    final cartSettings  = ref.watch(_cartSettingsProvider).valueOrNull
        ?? const {'delivery_charge': '59', 'free_delivery_above': '499'};
    final _sFreeAbove   = double.tryParse(
        cartSettings['free_delivery_above']?.toString() ?? '499') ?? 499;
    final _sDelivery    = double.tryParse(
        cartSettings['delivery_charge']?.toString() ?? '59') ?? 59;

    return Scaffold(
      backgroundColor: _c.bg0,
      body: Column(children: [
        // ── Header ─────────────────────────────────────────────────────────
        Container(
          color: _c.bg1,
          padding: EdgeInsets.fromLTRB(20, topPad + 12, 20, 16),
          child: Row(children: [
            if (context.canPop()) ...[
              GestureDetector(
                onTap: () { HapticFeedback.selectionClick(); context.pop(); },
                child: Container(
                  width: 38, height: 38,
                  decoration: BoxDecoration(
                    color: _c.bg0, borderRadius: BorderRadius.circular(12)),
                  child: Icon(Icons.arrow_back_ios_new_rounded,
                      size: 16, color: _c.text0),
                ),
              ),
              const Gap(14),
            ],
            Text('Your Cart', style: GoogleFonts.inter(
              fontSize: 22, fontWeight: FontWeight.w900, color: _c.text0,
              letterSpacing: -0.3,
            )),
            const Gap(10),
            cartAsync.maybeWhen(
              data: (cart) {
                final count = ((cart['items'] as List?) ?? [])
                    .where((i) {
                      final id = (i is Map) ? (i['id'] ?? i['_id'] ?? '').toString() : '';
                      return !_deletedIds.contains(id);
                    }).length;
                if (count == 0) return const SizedBox.shrink();
                return Container(
                  width: 26, height: 26,
                  decoration: const BoxDecoration(
                    color: _kBrand, shape: BoxShape.circle),
                  child: Center(child: Text('$count',
                    style: GoogleFonts.inter(
                      fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white))),
                );
              },
              orElse: () => const SizedBox.shrink(),
            ),
            const Spacer(),
            cartAsync.maybeWhen(
              data: (cart) {
                final count = ((cart['items'] as List?) ?? [])
                    .where((i) {
                      final id = (i is Map) ? (i['id'] ?? i['_id'] ?? '').toString() : '';
                      return !_deletedIds.contains(id);
                    }).length;
                if (count == 0) return const SizedBox.shrink();
                return GestureDetector(
                  onTap: _clearAll,
                  child: Text('Clear all', style: GoogleFonts.inter(
                    fontSize: 13, fontWeight: FontWeight.w600, color: _c.text2,
                    decoration: TextDecoration.underline,
                  )),
                );
              },
              orElse: () => const SizedBox.shrink(),
            ),
          ]),
        ),

        // ── Body ──────────────────────────────────────────────────────────
        Expanded(
          child: cartAsync.when(
            loading: () => Center(child: CircularProgressIndicator(
              color: _c.brand, strokeWidth: 2)),
            error: (_, __) => _ErrorState(onRetry: () => ref.invalidate(cartProvider)),
            data: (cart) {
              final rawItems = cart['items'] as List? ?? [];
              final items = rawItems.where((i) {
                final id = (i is Map) ? (i['id'] ?? i['_id'] ?? '').toString() : '';
                return !_deletedIds.contains(id);
              }).toList();
              if (items.isEmpty) return const _EmptyCart();

              final subtotal = items.fold<double>(0, (s, i) {
                final item = i as Map;
                final product = (item['product'] as Map?) ?? const {};
                final pRaw = item['price'] ?? product['basePrice']
                    ?? product['price'] ?? 0;
                final p = pRaw is num ? pRaw.toDouble()
                    : double.tryParse(pRaw.toString()) ?? 0;
                final q = (item['qty'] as num?)?.toInt()
                    ?? (item['quantity'] as num?)?.toInt() ?? 1;
                return s + p * q;
              });
              final delivery = subtotal >= _sFreeAbove ? 0.0 : _sDelivery;
              final total = subtotal + delivery;

              final bottomInset = MediaQuery.of(context).padding.bottom + 62;
              return RefreshIndicator(
                color: GColors.brand,
                onRefresh: () async {
                  ref.invalidate(cartProvider);
                  await ref.read(cartProvider.future);
                },
                child: ListView(
                physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + bottomInset),
                children: [
                  // Play & unlock discounts banner
                  _PlayBanner(onTap: () {
                    HapticFeedback.mediumImpact();
                    AudioService.instance.tap();
                    context.go('/play');
                  }),
                  const Gap(14),

                  // Free gift banner (admin-configured; hidden when no promo active)
                  _FreeGiftBanner(subtotal: subtotal),

                  // Earned rewards / coupons — applies discounts via
                  // /rewards/apply, mirrors web's CartWinnings panel.
                  // Hidden for guests (no token) and when there are no
                  // active rewards.
                  CartWinnings(
                    subtotalInr: subtotal,
                    onChange: () {
                      ref.invalidate(cartSummaryProvider(subtotal.toInt()));
                    },
                  ),

                  // Item cards
                  ...List.generate(items.length, (i) {
                    final item  = items[i] as Map<String, dynamic>;
                    final id    = (item['id'] ?? item['_id'] ?? '').toString();
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _CartItemCard(
                        item: item,
                        updating: _updating[id] == true,
                        onRemove:    () => _removeItem(id),
                        onEdit:      () => _editCustomization(item),
                        onQtyChange: (q) => _updateQty(item, q),
                      ).animate().fadeIn(delay: (i * 50).ms)
                          .slideX(begin: 0.03, end: 0),
                    );
                  }),
                  const Gap(14),

                  // Order summary card
                  _OrderSummary(
                    subtotal: subtotal,
                    delivery: delivery,
                    total: total,
                  ),
                  const Gap(12),

                  // Hint: gift wrap etc.
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: _c.gold.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: _c.gold.withValues(alpha: 0.2)),
                    ),
                    child: Row(children: [
                      const Text('✨', style: TextStyle(fontSize: 14)),
                      const Gap(8),
                      Expanded(child: Text(
                        'Gift wrap, thank-you card and Gifteeng coins can be added at checkout.',
                        style: GoogleFonts.inter(
                          fontSize: 11, color: _c.text1, fontWeight: FontWeight.w500,
                          height: 1.5))),
                    ]),
                  ),
                  const Gap(16),

                  // Proceed + Continue Shopping
                  // Use the root GoRouter so the navigation works whether the
                  // cart is being rendered inside the shell branch or as a
                  // standalone route. Falls back to a snackbar if router is
                  // unreachable instead of throwing into the error page.
                  GButton(
                    label: 'Proceed to Checkout  →',
                    onPressed: () {
                      HapticFeedback.mediumImpact();
                      AudioService.instance.tap();
                      try {
                        GoRouter.of(context).push('/checkout');
                      } catch (e) {
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                          content: Text('Could not open checkout. $e'),
                        ));
                      }
                    },
                  ),
                  const Gap(10),
                  GestureDetector(
                    onTap: () {
                      HapticFeedback.selectionClick();
                      try {
                        GoRouter.of(context).go('/shop');
                      } catch (_) {
                        // No-op — already at shop or shell shifted tab.
                      }
                    },
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      decoration: BoxDecoration(
                        color: _c.bg1,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: _c.border),
                      ),
                      child: Center(
                        child: Text('Continue Shopping', style: GoogleFonts.inter(
                          fontSize: 14, fontWeight: FontWeight.w700, color: _c.text0)),
                      ),
                    ),
                  ),
                  const Gap(20),

                  // Trust row — expanded cards
                  Row(children: [
                    Expanded(child: _TrustCard(
                      emoji: '🔒', label: 'Secure\npayment',
                      sub: 'SSL & Razorpay', color: const Color(0xFF10B981))),
                    const Gap(8),
                    Expanded(child: _TrustCard(
                      emoji: '🚚', label: 'Fast\ndelivery',
                      sub: '3–7 business days', color: const Color(0xFF3B82F6))),
                    const Gap(8),
                    Expanded(child: _TrustCard(
                      emoji: '🔄', label: '7-Day\nreturns',
                      sub: 'Hassle-free', color: const Color(0xFFF59E0B))),
                  ]),
                  const Gap(24),

                  // You might also like
                  _RecommendedRow(
                    recommended: ref.watch(_cartRecommendedProvider),
                    onTap: (slug) => context.push('/product/$slug'),
                  ),
                  const Gap(16),
                ],
              ),
              );
            },
          ),
        ),
      ]),
    );
  }
}

// ─── Play banner ──────────────────────────────────────────────────────────────

class _PlayBanner extends StatelessWidget {
  final VoidCallback onTap;
  const _PlayBanner({required this.onTap});
  @override
  Widget build(BuildContext context) {
    final _c = GColors.of(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: _c.brandTint,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _c.brand.withValues(alpha: 0.2)),
        ),
        child: Row(children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(
              color: _c.brand,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Center(child: Text('🎰', style: TextStyle(fontSize: 22))),
          ),
          const Gap(12),
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Play & unlock discounts', style: GoogleFonts.inter(
                fontSize: 14, fontWeight: FontWeight.w800, color: _c.text0)),
              const Gap(2),
              Text('Free scratch cards, mystery boxes & jackpots',
                style: GoogleFonts.inter(fontSize: 11, color: _c.text2)),
            ],
          )),
          Icon(Icons.arrow_forward_ios_rounded, size: 14, color: _c.brand),
        ]),
      ),
    );
  }
}

// ─── Cart item card (NEW DESIGN with Edit button) ────────────────────────────

class _CartItemCard extends StatelessWidget {
  final Map<String, dynamic> item;
  final bool updating;
  final VoidCallback onRemove, onEdit;
  final ValueChanged<int> onQtyChange;
  const _CartItemCard({
    required this.item,
    required this.updating,
    required this.onRemove,
    required this.onEdit,
    required this.onQtyChange,
  });

  @override
  Widget build(BuildContext context) {
    final _c = GColors.of(context);
    final product = (item['product'] as Map?) ?? const {};
    final name = (item['name'] ?? item['title']
        ?? product['title'] ?? product['name'] ?? 'Gift') as String;
    final qty = (item['qty'] as num?)?.toInt()
        ?? (item['quantity'] as num?)?.toInt() ?? 1;
    final images = (item['images'] as List?)
        ?? (product['images'] as List?)
        ?? const [];
    // Variant-aware lookup — the customer's picked design lives in
    // `item.variantOptions` ({"Design": "Kitchen 3"}), and the product's
    // catalog of variants lives in `product.variantOptions` (a list of
    // {name, value, image, images, priceDelta}). We pick the FIRST variant
    // option whose name+value pair matches the customer's selection and
    // use its image + priceDelta for the row. Falls back to parent
    // image + basePrice when nothing matches (or there is no variant).
    final variantOptionsMap = (item['variantOptions'] as Map?) ?? const {};
    final productVariants  = (product['variantOptions'] as List?) ?? const [];
    String? variantImage;
    num?    variantPrice;
    if (variantOptionsMap.isNotEmpty && productVariants.isNotEmpty) {
      for (final v in productVariants) {
        if (v is! Map) continue;
        final vName  = v['name']?.toString();
        final vValue = v['value']?.toString();
        if (vName == null || vValue == null) continue;
        if (variantOptionsMap[vName]?.toString() == vValue) {
          if (variantImage == null) {
            // images[] takes precedence (gallery), then single image field
            final imgsList = v['images'];
            if (imgsList is List && imgsList.isNotEmpty) {
              variantImage = imgsList.first?.toString();
            }
            variantImage ??= v['image']?.toString();
            if (variantImage != null && variantImage!.isEmpty) variantImage = null;
          }
          if (variantPrice == null) {
            final pd = v['priceDelta'];
            if (pd is num) variantPrice = pd;
            else if (pd is String) variantPrice = num.tryParse(pd);
          }
          if (variantImage != null && variantPrice != null) break;
        }
      }
    }
    final firstImage = variantImage ?? (images.isNotEmpty ? images.first : null);

    // Price priority: explicit `item.price` (if API ever returns one) →
    // matched variant priceDelta → product basePrice → 0
    final priceRaw = item['price']
        ?? variantPrice
        ?? product['basePrice']
        ?? product['price']
        ?? 0;
    final price = priceRaw is num ? priceRaw.toDouble()
        : double.tryParse(priceRaw.toString()) ?? 0;
    final hasCustom = item['customization'] != null;
    final slug = (product['slug'] ?? item['slug'] ?? '').toString();
    final variantOptions = variantOptionsMap.isEmpty
        ? null
        : variantOptionsMap.entries.map((e) => '${e.value}').join(' · ');

    final id = (item['id'] ?? item['_id'] ?? '').toString();

    return Slidable(
      key: ValueKey(id),
      endActionPane: ActionPane(
        motion: const DrawerMotion(),
        extentRatio: 0.25,
        children: [
          SlidableAction(
            onPressed: (_) => onRemove(),
            backgroundColor: _c.brand,
            foregroundColor: Colors.white,
            icon: Icons.delete_outline_rounded,
            label: 'Remove',
            borderRadius: BorderRadius.circular(12),
          ),
        ],
      ),
      child: Container(
        decoration: BoxDecoration(
          color: _c.bg1,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 10, offset: const Offset(0, 2),
          )],
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(children: [
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: slug.isNotEmpty ? () => context.push('/shop/$slug') : null,
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // Product image with custom badge
              Stack(children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: SizedBox(
                    width: 80, height: 80,
                    child: GiftImage(src: firstImage, fit: BoxFit.cover),
                  ),
                ),
                if (hasCustom)
                  Positioned(
                    top: 4, left: 4,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                      decoration: BoxDecoration(
                        color: _c.brand,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text('✨', style: GoogleFonts.inter(
                        fontSize: 9, fontWeight: FontWeight.w700, color: Colors.white)),
                    ),
                  ),
              ]),
              const Gap(12),
              // Info
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, maxLines: 2, overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(
                      fontSize: 13, fontWeight: FontWeight.w700,
                      color: _c.text0, height: 1.3)),
                  if (variantOptions != null && variantOptions.isNotEmpty) ...[
                    const Gap(3),
                    Text('Design: $variantOptions',
                      style: GoogleFonts.inter(fontSize: 11, color: _c.text2)),
                  ],
                  if (hasCustom) ...[
                    const Gap(3),
                    Row(children: [
                      Icon(Icons.auto_awesome_rounded,
                          size: 11, color: _c.brand),
                      const Gap(3),
                      Text('Personalized',
                        style: GoogleFonts.inter(
                          fontSize: 10, fontWeight: FontWeight.w700, color: _c.brand)),
                    ]),
                  ],
                  const Gap(6),
                  Text('₹${price.toInt()}', style: GoogleFonts.inter(
                    fontSize: 15, fontWeight: FontWeight.w800, color: _c.text0)),
                ],
              )),
              // Remove X
              GestureDetector(
                onTap: updating ? null : onRemove,
                child: updating
                    ? SizedBox(width: 20, height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 1.5, color: _c.text2))
                    : Icon(Icons.close_rounded,
                        size: 18, color: _c.border),
              ),
            ])),  // closes GestureDetector > Row
            const Gap(10),
            // Action row: qty stepper + Edit (if personalized) + Remove
            Row(children: [
              // Qty stepper — large 44px circle buttons for easy tapping
              Row(mainAxisSize: MainAxisSize.min, children: [
                // — button
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: (!updating && qty > 1) ? () => onQtyChange(qty - 1) : null,
                  child: AnimatedContainer(
                    duration: 120.ms,
                    width: 40, height: 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: _c.bg1,
                      border: Border.all(color: _c.border, width: 1.5),
                    ),
                    child: Icon(Icons.remove_rounded, size: 18,
                        color: (!updating && qty > 1)
                            ? _c.text0
                            : _c.text2.withValues(alpha: 0.3)),
                  ),
                ),
                // Count / spinner
                SizedBox(
                  width: 44,
                  child: updating
                      ? Center(child: SizedBox(width: 16, height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2, color: _c.text2)))
                      : Text('$qty', textAlign: TextAlign.center,
                          style: GoogleFonts.inter(
                            fontSize: 16,
                            fontWeight: FontWeight.w900,
                            color: _c.text0)),
                ),
                // + button
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: updating ? null : () => onQtyChange(qty + 1),
                  child: AnimatedContainer(
                    duration: 120.ms,
                    width: 40, height: 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: updating
                          ? _c.bg1
                          : const Color(0xFFEF3752),
                    ),
                    child: Icon(Icons.add_rounded, size: 18,
                        color: updating ? _c.text2 : Colors.white),
                  ),
                ),
              ]),
              const Spacer(),
              if (hasCustom)
                GestureDetector(
                  onTap: onEdit,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                    decoration: BoxDecoration(
                      color: _c.brandTint,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: _c.brand.withValues(alpha: 0.3)),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.edit_outlined, size: 13, color: _c.brand),
                      const Gap(5),
                      Text('Edit design', style: GoogleFonts.inter(
                        fontSize: 11, fontWeight: FontWeight.w700, color: _c.brand)),
                    ]),
                  ),
                ),
              const Gap(8),
              GestureDetector(
                onTap: onRemove,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                  decoration: BoxDecoration(
                    color: _c.bg0,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: _c.border),
                  ),
                  child: Text('Remove', style: GoogleFonts.inter(
                    fontSize: 11, fontWeight: FontWeight.w700, color: _c.text1)),
                ),
              ),
            ]),
          ]),
        ),
      ),
    );
  }
}

class _QtyBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  const _QtyBtn({required this.icon, this.onTap});
  @override
  Widget build(BuildContext context) {
    final _c = GColors.of(context);
    return GestureDetector(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        child: Icon(icon, size: 14,
            color: onTap == null ? _c.text2.withValues(alpha: 0.4) : _c.text1),
      ),
    );
  }
}

// ─── Order summary ────────────────────────────────────────────────────────────

class _OrderSummary extends ConsumerWidget {
  final double subtotal, delivery, total;
  const _OrderSummary({
    required this.subtotal, required this.delivery, required this.total,
  });
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final _c = GColors.of(context);

    // Pull the reward-derived summary so we can show the discount line
    // + final total when coupons are applied. Falls back to the
    // pre-discount values when there's no summary (guest cart, no
    // active rewards).
    final summaryAsync = ref.watch(cartSummaryProvider(subtotal.toInt()));
    final summary     = summaryAsync.maybeWhen(data: (s) => s, orElse: () => null);
    final discount    = summary?.discountInr ?? 0;
    final finalTotal  = discount > 0
        ? (subtotal - discount + delivery).clamp(0, double.infinity).toDouble()
        : total;

    Widget row(String label, String value,
        {Color? valueColor, FontStyle? valueStyle}) =>
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: GoogleFonts.inter(fontSize: 12, color: _c.text2)),
            Text(value, style: GoogleFonts.inter(
              fontSize: 13, fontWeight: FontWeight.w700,
              color: valueColor ?? _c.text0, fontStyle: valueStyle)),
          ],
        );

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _c.bg1,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(
          color: Colors.black.withValues(alpha: 0.04),
          blurRadius: 10, offset: const Offset(0, 2),
        )],
      ),
      child: Column(children: [
        Row(children: [
          Text('Order Summary', style: GoogleFonts.inter(
            fontSize: 15, fontWeight: FontWeight.w800, color: _c.text0)),
        ]),
        const Gap(12),
        row('Subtotal', '₹${subtotal.toStringAsFixed(0)}'),
        // Discount breakdown (one row per applied reward)
        if (summary != null && summary.breakdown.isNotEmpty) ...[
          for (final b in summary.breakdown) ...[
            const Gap(6),
            row(
              '🎁 ${b['label'] ?? 'Discount'}',
              '−₹${((b['amount'] as num?)?.abs().toStringAsFixed(0)) ?? '0'}',
              valueColor: const Color(0xFF22C55E),
            ),
          ],
        ],
        const Gap(6),
        row('Delivery',
          delivery == 0 ? 'FREE 🎉' : '₹${delivery.toStringAsFixed(0)}',
          valueColor: delivery == 0 ? Colors.green : null),
        const Gap(6),
        row('Gift wrap / Goins', 'At checkout',
          valueColor: _c.text2, valueStyle: FontStyle.italic),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Divider(color: _c.border, thickness: 1, height: 1),
        ),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('Total', style: GoogleFonts.inter(
            fontSize: 16, fontWeight: FontWeight.w800, color: _c.text0)),
          Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
            if (discount > 0) ...[
              Text('₹${total.toStringAsFixed(0)}',
                style: GoogleFonts.inter(
                  fontSize: 13, fontWeight: FontWeight.w600,
                  color: _c.text2,
                  decoration: TextDecoration.lineThrough)),
              const Gap(8),
            ],
            Text('₹${finalTotal.toStringAsFixed(0)}',
              style: GoogleFonts.inter(
                fontSize: 22, fontWeight: FontWeight.w900, color: _c.brand)),
          ]),
        ]),
        if (discount > 0) ...[
          const Gap(6),
          Align(
            alignment: Alignment.centerRight,
            child: Text('You saved ₹${discount.toStringAsFixed(0)}',
              style: GoogleFonts.inter(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: const Color(0xFF22C55E))),
          ),
        ],
      ]),
    );
  }
}

// ─── Trust badge ──────────────────────────────────────────────────────────────

class _TrustBadge extends StatelessWidget {
  final String emoji, label;
  const _TrustBadge({required this.emoji, required this.label});
  @override
  Widget build(BuildContext context) {
    final _c = GColors.of(context);
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Text(emoji, style: const TextStyle(fontSize: 20)),
      const Gap(4),
      Text(label, style: GoogleFonts.inter(
        fontSize: 10, color: _c.text2, fontWeight: FontWeight.w600)),
    ]);
  }
}

// ─── Expanded trust card ──────────────────────────────────────────────────────

class _TrustCard extends StatelessWidget {
  final String emoji, label, sub;
  final Color color;
  const _TrustCard({
    required this.emoji, required this.label,
    required this.sub, required this.color,
  });
  @override
  Widget build(BuildContext context) {
    final _c = GColors.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.18)),
      ),
      child: Column(children: [
        Text(emoji, style: const TextStyle(fontSize: 22)),
        const Gap(6),
        Text(label, textAlign: TextAlign.center,
          style: GoogleFonts.inter(
            fontSize: 11, fontWeight: FontWeight.w700, color: _c.text0,
            height: 1.3)),
        const Gap(3),
        Text(sub, textAlign: TextAlign.center,
          style: GoogleFonts.inter(
            fontSize: 10, color: _c.text2)),
      ]),
    );
  }
}

// ─── You might also like ──────────────────────────────────────────────────────

class _RecommendedRow extends StatelessWidget {
  final AsyncValue<List<Map<String, dynamic>>> recommended;
  final ValueChanged<String> onTap;
  const _RecommendedRow({required this.recommended, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final _c = GColors.of(context);
    return recommended.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (products) {
        if (products.isEmpty) return const SizedBox.shrink();
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('You might also like',
            style: GoogleFonts.inter(
              fontSize: 15, fontWeight: FontWeight.w800, color: _c.text0)),
          const Gap(12),
          SizedBox(
            height: 190,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: products.length,
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (_, i) {
                final p     = products[i];
                final title = (p['title'] ?? p['name'] ?? '').toString();
                final price = (p['basePrice'] ?? p['price'] ?? '').toString();
                final slug  = (p['slug'] ?? p['id'] ?? p['_id'] ?? '').toString();
                final imgs      = p['images'];
                final firstImage = (imgs is List && imgs.isNotEmpty)
                    ? imgs.first
                    : (p['imageUrl'] ?? p['image']);
                return GestureDetector(
                  onTap: () { if (slug.isNotEmpty) onTap(slug); },
                  child: Container(
                    width: 130,
                    decoration: BoxDecoration(
                      color: _c.bg1,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: _c.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClipRRect(
                          borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(11)),
                          child: SizedBox(
                            height: 110, width: double.infinity,
                            child: GiftImage(src: firstImage, fit: BoxFit.cover),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(8, 7, 8, 8),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(title,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: GoogleFonts.inter(
                                  fontSize: 11, fontWeight: FontWeight.w600,
                                  color: _c.text0, height: 1.3)),
                              const Gap(4),
                              if (price.isNotEmpty)
                                Text('₹$price',
                                  style: GoogleFonts.inter(
                                    fontSize: 12, fontWeight: FontWeight.w800,
                                    color: _kBrand)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          const Gap(8),
        ]);
      },
    );
  }
}

// ─── Free-gift banner ────────────────────────────────────────────────────────

class _FreeGiftBanner extends ConsumerStatefulWidget {
  final double subtotal;
  const _FreeGiftBanner({required this.subtotal});
  @override
  ConsumerState<_FreeGiftBanner> createState() => _FreeGiftBannerState();
}

class _FreeGiftBannerState extends ConsumerState<_FreeGiftBanner> {
  bool _adding = false;

  Future<void> _claim(_FreeGiftInfo gift) async {
    if (gift.productId.isEmpty) return;
    setState(() => _adding = true);
    try {
      await ref.read(dioProvider).post('/cart/items',
          data: {'productId': gift.productId, 'qty': 1});
      ref.invalidate(cartProvider);
    } catch (_) {
      if (mounted) {
        final _c = GColors.of(context);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Could not add free gift',
              style: GoogleFonts.inter(fontWeight: FontWeight.w500)),
          backgroundColor: _c.text0,
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 80),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12)),
        ));
      }
    } finally {
      if (mounted) setState(() => _adding = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_freeGiftProvider(widget.subtotal.toInt()));
    return async.maybeWhen(
      data: (gift) {
        if (gift == null) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: _buildBanner(gift)
              .animate()
              .fadeIn(duration: 300.ms)
              .slideY(begin: -0.04, end: 0),
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }

  Widget _buildBanner(_FreeGiftInfo gift) => switch (gift.status) {
    'in_cart'  => _buildInCart(gift),
    'unlocked' => _buildUnlocked(gift),
    _          => _buildLocked(gift),
  };

  Widget _buildInCart(_FreeGiftInfo gift) {
    final _c = GColors.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF166534).withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
            color: const Color(0xFF22C55E).withValues(alpha: 0.35)),
      ),
      child: Row(children: [
        Container(
          width: 36, height: 36,
          decoration: const BoxDecoration(
              color: Color(0xFF22C55E), shape: BoxShape.circle),
          child: const Icon(Icons.check_rounded,
              color: Colors.white, size: 18),
        ),
        const Gap(10),
        Expanded(child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('🎁 Free gift added!',
              style: GoogleFonts.inter(
                fontSize: 12, fontWeight: FontWeight.w800,
                color: const Color(0xFF22C55E))),
            Text('Pay only ₹${gift.shippingInr.toInt()} shipping · ${gift.productTitle}',
              maxLines: 1, overflow: TextOverflow.ellipsis,
              style: GoogleFonts.inter(fontSize: 11, color: _c.text2)),
          ],
        )),
      ]),
    );
  }

  Widget _buildUnlocked(_FreeGiftInfo gift) {
    final _c = GColors.of(context);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: _c.gold.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _c.gold.withValues(alpha: 0.3)),
      ),
      child: Row(children: [
        if (gift.imageUrl != null)
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: SizedBox(
              width: 48, height: 48,
              child: GiftImage(src: gift.imageUrl, fit: BoxFit.cover),
            ),
          )
        else
          Container(
            width: 48, height: 48,
            decoration: BoxDecoration(
              color: _c.gold.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(Icons.card_giftcard_rounded,
                color: _c.gold, size: 22),
          ),
        const Gap(10),
        Expanded(child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('✨ FREE GIFT UNLOCKED',
              style: GoogleFonts.inter(
                fontSize: 10, fontWeight: FontWeight.w800,
                color: _c.gold, letterSpacing: 0.6)),
            Text(gift.productTitle,
              maxLines: 1, overflow: TextOverflow.ellipsis,
              style: GoogleFonts.inter(
                fontSize: 13, fontWeight: FontWeight.w700, color: _c.text0)),
            Text('Yours for ₹${gift.shippingInr.toInt()} shipping',
              style: GoogleFonts.inter(fontSize: 11, color: _c.text2)),
          ],
        )),
        const Gap(8),
        GestureDetector(
          onTap: _adding ? null : () => _claim(gift),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            decoration: BoxDecoration(
              color: _adding
                  ? _c.brand.withValues(alpha: 0.5)
                  : _c.brand,
              borderRadius: BorderRadius.circular(10),
            ),
            child: _adding
                ? const SizedBox(width: 14, height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 1.5, color: Colors.white))
                : Text('Claim', style: GoogleFonts.inter(
                    fontSize: 12, fontWeight: FontWeight.w800,
                    color: Colors.white)),
          ),
        ),
      ]),
    );
  }

  Widget _buildLocked(_FreeGiftInfo gift) {
    final _c = GColors.of(context);
    final progress = gift.minCartInr > 0
        ? (widget.subtotal / gift.minCartInr).clamp(0.0, 1.0)
        : 0.0;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: _c.brandTint,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _c.brand.withValues(alpha: 0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: _c.brand.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.card_giftcard_rounded,
                  size: 18, color: _c.brand),
            ),
            const Gap(10),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                RichText(text: TextSpan(
                  style: GoogleFonts.inter(fontSize: 12, color: _c.text0),
                  children: [
                    const TextSpan(text: 'Add '),
                    TextSpan(
                      text: '₹${gift.remainingInr.toInt()}',
                      style: TextStyle(
                        fontWeight: FontWeight.w800, color: _c.brand)),
                    const TextSpan(text: ' more to unlock a '),
                    const TextSpan(
                      text: 'FREE GIFT',
                      style: TextStyle(fontWeight: FontWeight.w800)),
                  ],
                )),
                Text(gift.productTitle,
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.inter(fontSize: 10, color: _c.text2)),
              ],
            )),
          ]),
          const Gap(8),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              backgroundColor: _c.brand.withValues(alpha: 0.08),
              valueColor: AlwaysStoppedAnimation<Color>(_c.brand),
              minHeight: 5,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Empty / Error states ────────────────────────────────────────────────────

class _EmptyCart extends StatelessWidget {
  const _EmptyCart();
  @override
  Widget build(BuildContext context) {
    final _c = GColors.of(context);
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 100, height: 100,
          decoration: BoxDecoration(
            color: _c.brandTint, shape: BoxShape.circle),
          child: const Center(child: Text('🛒', style: TextStyle(fontSize: 44))),
        ),
        const Gap(20),
        Text('Your cart is empty', style: GoogleFonts.inter(
          fontSize: 19, fontWeight: FontWeight.w800, color: _c.text0)),
        const Gap(8),
        Text('Browse gifts and add them here', style: GoogleFonts.inter(
          fontSize: 14, color: _c.text2)),
        const Gap(24),
        GestureDetector(
          onTap: () { HapticFeedback.selectionClick(); context.go('/shop'); },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            decoration: BoxDecoration(
              color: _c.brand,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text('Explore Gifts', style: GoogleFonts.inter(
              fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white)),
          ),
        ),
      ]).animate().fadeIn(duration: 400.ms).scale(begin: const Offset(0.95, 0.95)),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final VoidCallback onRetry;
  const _ErrorState({required this.onRetry});
  @override
  Widget build(BuildContext context) {
    final _c = GColors.of(context);
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Text('😕', style: TextStyle(fontSize: 48)),
        const Gap(16),
        Text('Could not load cart', style: GoogleFonts.inter(
          fontSize: 16, fontWeight: FontWeight.w600, color: _c.text0)),
        const Gap(12),
        TextButton(
          onPressed: onRetry,
          child: Text('Try again', style: GoogleFonts.inter(color: _c.brand)),
        ),
      ]),
    );
  }
}
