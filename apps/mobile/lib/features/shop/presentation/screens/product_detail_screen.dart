import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:go_router/go_router.dart';
import 'package:gap/gap.dart';
import 'package:lottie/lottie.dart';
import 'package:smooth_page_indicator/smooth_page_indicator.dart';
import 'package:dio/dio.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/gift_image.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/services/audio_service.dart';
import '../../../../core/analytics/analytics_service.dart';
import '../../../reviews/reviews_feature.dart';
import '../widgets/product_badges.dart';
import '../widgets/pincode_delivery_check.dart';
import '../widgets/you_may_also_like.dart';
import '../widgets/share_product_button.dart';
// cartItemCountProvider drives the bottom-nav cart-tab badge; cartProvider
// is the family the cart-screen reads. Invalidating both after add-to-cart
// keeps badge + screen in sync without a manual refresh.
import '../../../home/presentation/screens/shell_screen.dart' show cartItemCountProvider;
import '../../../cart/presentation/screens/cart_screen.dart' show cartProvider;
import '../../../search/presentation/screens/search_screen.dart' show SearchViewedStore;

// ─── Palette ────────────────────��───────────────────────────────────���─────────
// NOTE: _k* are resolved per-build via GColors.of(context) for theme support.
const _kGold    = GColors.gold;

// ─── Provider ─────────────────────────────────────────────────────────────────

final _productDetailProvider =
    FutureProvider.autoDispose.family<Map<String, dynamic>, String>(
        (ref, slug) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get('/products/$slug');
  return Map<String, dynamic>.from(res.data as Map);
});

String _stripHtml(String html) => html
    .replaceAll(RegExp(r'<[^>]*>'), ' ')
    .replaceAll(RegExp(r'\s{2,}'), ' ')
    .trim();

// ─── Screen ───────────────────────────────────────────────────────────────────

class ProductDetailScreen extends ConsumerStatefulWidget {
  final String slug;
  const ProductDetailScreen({super.key, required this.slug});

  @override
  ConsumerState<ProductDetailScreen> createState() =>
      _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen>
    with TickerProviderStateMixin {
  final _pageCtrl = PageController();

  // State
  int _qty = 1;
  String? _selectedVariant;
  final Map<String, String> _selectedAttrs = {};
  final List<String> _selectedDesigns = []; // For multi-select (Pack of N)
  bool _descExpanded = false;
  bool _addingToCart = false;
  bool _cartSuccess = false;
  bool _viewedRecorded = false; // ensures SearchViewedStore.record fires once

  /// If the currently selected attribute matches "Pack of N", returns N.
  /// Otherwise returns null (single-select mode).
  int? get _packSize {
    for (final v in _selectedAttrs.values) {
      final m = RegExp(r'(?:pack|set)\s*of\s*(\d+)', caseSensitive: false)
          .firstMatch(v);
      if (m != null) return int.tryParse(m.group(1)!);
    }
    return null;
  }

  late final AnimationController _cartCtrl;

  @override
  void initState() {
    super.initState();
    _cartCtrl = AnimationController(vsync: this, duration: 600.ms);
    Analytics.track('product_view', {'slug': widget.slug});
    Analytics.screen('/shop/${widget.slug}');
  }

  @override
  void dispose() {
    _pageCtrl.dispose();
    _cartCtrl.dispose();
    super.dispose();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  String _productId(Map<String, dynamic> p) =>
      (p['id'] ?? p['_id'] ?? p['productId'] ?? '').toString();

  List<Map<String, dynamic>> _variants(Map<String, dynamic> p) {
    // Backend returns `variantOptions` with flat { name, value, priceDelta, inventory, image }
    final v = p['variantOptions'] ?? p['variants'] ?? p['productVariants'] ?? [];
    if (v is List) return List<Map<String, dynamic>>.from(v.map((e) => e as Map));
    return [];
  }

  List<Map<String, dynamic>> _attributes(Map<String, dynamic> p) {
    final a = p['attributes'] ?? p['specs'] ?? p['specifications'] ?? [];
    if (a is List) {
      return List<Map<String, dynamic>>.from(a.map((e) => e as Map));
    }
    if (a is Map) {
      return a.entries
          .map((e) => {'name': e.key, 'value': e.value.toString()})
          .toList();
    }
    return [];
  }

  // ── Add to Cart ────────────────────────────────────────────────────────────

  Future<void> _addToCart(Map<String, dynamic> p) async {
    if (_addingToCart) return;

    // ── Guest gate ────────────────────────────────────────────────────────
    // Cart is an account-bound resource (saved per user on the backend).
    // Guests would just get 401 from the API and see a raw "Unauthorized"
    // toast. Better UX: prompt them to sign in inline, then let them
    // resume the action after auth.
    final isLoggedIn =
        ref.read(authTokenNotifierProvider).valueOrNull != null;
    if (!isLoggedIn) {
      HapticFeedback.selectionClick();
      await _promptSignInToContinue(
        title: 'Sign in to add to cart',
        message: 'Your cart is saved to your account so it follows you '
            'across devices. Sign in to continue.',
      );
      return;
    }

    HapticFeedback.mediumImpact();
    AudioService.instance.tap();

    // Optimistic UI — flip to "Added ✓" instantly so the button feels
    // responsive. The actual API call runs in the background. If it
    // fails, we revert and show the error.
    setState(() {
      _addingToCart = true;
      _cartSuccess  = true;
    });
    _cartCtrl.forward();

    final body = <String, dynamic>{
      'productId': _productId(p),
      'qty': _qty,
    };
    if (_selectedAttrs.isNotEmpty) body['variantOptions'] = _selectedAttrs;
    if (_selectedDesigns.isNotEmpty) body['selectedDesigns'] = _selectedDesigns;

    try {
      final dio = ref.read(dioProvider);
      await dio.post('/cart/items', data: body);

      // Eagerly invalidate the cart-related providers so the cart-tab
      // badge + the cart screen update on next render — no stale data
      // when the user taps the cart tab seconds later.
      ref.invalidate(cartItemCountProvider);
      // cart_screen.dart's own provider name is `cartProvider` — invalidate
      // via the family/global hook so any open cart screen refreshes.
      try { ref.invalidate(cartProvider); } catch (_) {}

      if (mounted) {
        AudioService.instance.coinCollect();
        HapticFeedback.lightImpact();
        // Hold the success state ~600ms (was 1800ms) so users see the
        // confirmation without feeling locked out of further actions.
        await Future.delayed(600.ms);
        if (mounted) {
          _cartCtrl.reset();
          setState(() { _cartSuccess = false; });
        }
      }
    } catch (e) {
      // Revert the optimistic state on failure.
      if (mounted) {
        setState(() { _cartSuccess = false; });
        _cartCtrl.reset();
        HapticFeedback.mediumImpact();
        String msg = 'Could not add to cart. Please try again.';
        if (e is DioException) {
          final data = e.response?.data;
          if (data is Map) {
            final apiMsg = data['message'];
            if (apiMsg is String && apiMsg.isNotEmpty) msg = apiMsg;
            else if (apiMsg is List && apiMsg.isNotEmpty) msg = apiMsg.first.toString();
          }
        }
        _showError(msg);
      }
    } finally {
      if (mounted) setState(() => _addingToCart = false);
    }
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg, style: GoogleFonts.inter(fontWeight: FontWeight.w500)),
        backgroundColor: const Color(0xFF2A0A14),
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
  }

  // ── Guest-mode sign-in prompt ────────────────────────────────────────────
  // Renders a confirmation card via OverlayEntry (NOT showDialog —
  // showDialog's Navigator route transition triggers a Samsung One UI
  // black-screen bug; OverlayEntry sits above the Navigator and avoids it).
  Future<void> _promptSignInToContinue({
    required String title,
    required String message,
  }) async {
    final c = GColors.of(context);
    final overlay = Overlay.of(context, rootOverlay: true);
    bool? userChoice;
    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (_) => Material(
        type: MaterialType.transparency,
        child: Stack(
          children: [
            Positioned.fill(
              child: GestureDetector(
                onTap: () { userChoice = false; entry.remove(); },
                child: ColoredBox(color: Colors.black.withValues(alpha: 0.55)),
              ),
            ),
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 28),
                child: Container(
                  decoration: BoxDecoration(
                    color: c.bg1,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  padding: const EdgeInsets.fromLTRB(22, 22, 22, 14),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 36, height: 36,
                            decoration: BoxDecoration(
                              color: GColors.brand.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            alignment: Alignment.center,
                            child: const Icon(Icons.lock_outline_rounded,
                                color: GColors.brand, size: 18),
                          ),
                          const Gap(12),
                          Expanded(
                            child: Text(
                              title,
                              style: GoogleFonts.inter(
                                fontSize: 16, fontWeight: FontWeight.w800,
                                color: c.text0, height: 1.25,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const Gap(12),
                      Text(
                        message,
                        style: GoogleFonts.inter(
                          fontSize: 13, color: c.text1, height: 1.45,
                        ),
                      ),
                      const Gap(16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          TextButton(
                            onPressed: () {
                              userChoice = false;
                              entry.remove();
                            },
                            child: Text(
                              'Not now',
                              style: GoogleFonts.inter(
                                color: c.text1, fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          const Gap(4),
                          TextButton(
                            onPressed: () {
                              userChoice = true;
                              entry.remove();
                            },
                            child: Text(
                              'Sign in',
                              style: GoogleFonts.inter(
                                color: GColors.brand, fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
    overlay.insert(entry);
    while (userChoice == null) {
      await Future.delayed(const Duration(milliseconds: 30));
    }
    if (userChoice == true && mounted && context.mounted) {
      // Clear guest mode so /auth doesn't bounce back to /.
      await ref.read(guestModeNotifierProvider.notifier).setEnabled(false);
      if (context.mounted) GoRouter.of(context).go('/auth');
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kSurface = _c.bg1;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;
    final async = ref.watch(_productDetailProvider(widget.slug));

    // Record this product in the "recently viewed" store the first time data
    // lands — so the search screen's "Recently Viewed" strip stays fresh even
    // when the user browses from home/shop (not just from search results).
    ref.listen(_productDetailProvider(widget.slug), (_, next) {
      next.whenData((p) {
        if (!_viewedRecorded) {
          _viewedRecorded = true;
          SearchViewedStore.record(p);
        }
      });
    });

    return Scaffold(
      backgroundColor: _kBg,
      extendBodyBehindAppBar: true,
      body: async.when(
        loading: () => const _LoadingView(),
        error: (_, __) => _ErrorView(onBack: () => context.pop()),
        data: (p) => _DetailView(
          product: p,
          pageCtrl: _pageCtrl,
          qty: _qty,
          selectedVariant: _selectedVariant,
          selectedAttrs: _selectedAttrs,
          selectedDesigns: _selectedDesigns,
          packSize: _packSize,
          descExpanded: _descExpanded,
          addingToCart: _addingToCart,
          cartSuccess: _cartSuccess,
          cartCtrl: _cartCtrl,
          onQtyChanged: (v) => setState(() => _qty = v),
          onVariantSelected: (id) => setState(() => _selectedVariant = id),
          onAttrSelected: (k, v) => setState(() {
            _selectedAttrs[k] = v;
            _selectedDesigns.clear(); // reset designs when variant changes
          }),
          onDesignToggle: (design) => setState(() {
            if (_selectedDesigns.contains(design)) {
              _selectedDesigns.remove(design);
            } else {
              final cap = _packSize ?? 0;
              if (cap > 0 && _selectedDesigns.length < cap) {
                _selectedDesigns.add(design);
              }
            }
          }),
          onDescToggle: () => setState(() => _descExpanded = !_descExpanded),
          onAddToCart: () => _addToCart(p),
          onCustomize: () => context.push('/shop/${widget.slug}/customize', extra: p),
          onBack: () => context.pop(),
          variants: _variants(p),
          attributes: _attributes(p),
          productId: _productId(p),
        ),
      ),
    );
  }
}

// ─── Detail view (extracted for readability) ──────────────────────────────────

class _DetailView extends StatelessWidget {
  final Map<String, dynamic> product;
  final PageController pageCtrl;
  final int qty;
  final String? selectedVariant;
  final Map<String, String> selectedAttrs;
  final List<String> selectedDesigns;
  final int? packSize;
  final bool descExpanded, addingToCart, cartSuccess;
  final AnimationController cartCtrl;
  final List<Map<String, dynamic>> variants, attributes;
  final String productId;
  final VoidCallback onAddToCart, onCustomize, onBack, onDescToggle;
  final ValueChanged<int> onQtyChanged;
  final ValueChanged<String> onVariantSelected;
  final void Function(String k, String v) onAttrSelected;
  final ValueChanged<String> onDesignToggle;

  const _DetailView({
    required this.product,
    required this.pageCtrl,
    required this.qty,
    required this.selectedVariant,
    required this.selectedAttrs,
    required this.selectedDesigns,
    required this.packSize,
    required this.descExpanded,
    required this.addingToCart,
    required this.cartSuccess,
    required this.cartCtrl,
    required this.variants,
    required this.attributes,
    required this.productId,
    required this.onAddToCart,
    required this.onCustomize,
    required this.onBack,
    required this.onDescToggle,
    required this.onQtyChanged,
    required this.onVariantSelected,
    required this.onAttrSelected,
    required this.onDesignToggle,
  });

  @override
  Widget build(BuildContext context) {
    final _c        = GColors.of(context);
    final _kBg      = _c.bg0;
    final _kSurface = _c.bg1;
    final _kBorder  = _c.border;
    final _kText0   = _c.text0;
    final _kText1   = _c.text1;
    final _kText2   = _c.text2;
    final title     = product['title']     as String? ?? '';
    final priceRaw  = product['basePrice'] as String? ?? '0';
    final price     = double.tryParse(priceRaw) ?? 0;
    final descHtml  = product['description'] as String? ?? '';
    final desc      = _stripHtml(descHtml);
    final productImages = product['images']    as List? ?? [];
    final isCustom  = product['isCustomizable'] as bool? ?? false;
    final category  = product['category']  as String? ?? '';
    final brand     = product['brand']     as String? ?? product['brandName'] as String? ?? '';
    final inStock   = product['inStock'] as bool? ?? product['stock'] != 0;
    final inventory = (product['inventory'] as num?)?.toInt()
        ?? (product['stock']   as num?)?.toInt()
        ?? (product['qty']     as num?)?.toInt()
        ?? 99; // fallback: no hard cap
    final tags      = (product['tags'] as List?)?.cast<String>() ?? [];

    // Build display images: if a variant has an image and its value is selected, prepend it
    final displayImages = <dynamic>[];
    for (final v in variants) {
      final vName  = v['name']  as String?;
      final vValue = v['value'] as String?;
      final vImage = v['image'] as String?;
      if (vName != null && vValue != null && vImage != null && vImage.isNotEmpty
          && selectedAttrs[vName] == vValue) {
        displayImages.add(vImage);
      }
    }
    displayImages.addAll(productImages);
    final images = displayImages.isEmpty ? productImages : displayImages;

    // Group variant options by attribute name.
    // New API: flat { name: "Design", value: "Be Brave", priceDelta, inventory, image }
    // Old API: { attributes: { Color: "Red" } }
    final variantGroups = <String, List<Map<String, dynamic>>>{};
    for (final v in variants) {
      // New flat structure
      final flatName = v['name'] as String?;
      final flatValue = v['value'] as String?;
      if (flatName != null && flatValue != null) {
        variantGroups.putIfAbsent(flatName, () => []);
        final inv = v['inventory'];
        final inStock = inv is num ? inv > 0 : (v['inStock'] as bool? ?? true);
        variantGroups[flatName]!.add({
          'id': v['id'] ?? v['_id'] ?? '',
          'value': flatValue,
          'priceDelta': v['priceDelta']?.toString(),
          'inStock': inStock,
          'image': v['image'] as String?,
        });
        continue;
      }
      // Legacy attributes map
      final attrMap = v['attributes'] as Map?;
      if (attrMap != null) {
        attrMap.forEach((k, val) {
          variantGroups.putIfAbsent(k.toString(), () => []);
          variantGroups[k.toString()]!.add({
            'id': v['id'] ?? v['_id'] ?? '',
            'value': val.toString(),
            'price': v['price']?.toString(),
            'inStock': v['inStock'] ?? true,
          });
        });
      }
    }

    return Stack(
      children: [
        CustomScrollView(
          physics: const BouncingScrollPhysics(),
          slivers: [
            // ── Image gallery ──────────────────────────────────────────────
            SliverToBoxAdapter(
              child: _ImageGallery(
                images: images,
                pageCtrl: pageCtrl,
                onBack: onBack,
                isCustom: isCustom,
                inStock: inStock,
                productSlug: (product['slug'] ?? '').toString(),
                productTitle: title,
                productPrice: price,
              ),
            ),

            // ── Product card body ──────────────────────────────────────────
            SliverToBoxAdapter(
              child: Container(
                decoration: BoxDecoration(
                  color: _kBg,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                ),
                // Overlap image by 20px
                transform: Matrix4.translationValues(0, -20, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Category + brand row
                          if (category.isNotEmpty || brand.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: Row(
                                children: [
                                  if (category.isNotEmpty)
                                    _Chip(
                                      label: category,
                                      color: _kGold.withValues(alpha: 0.12),
                                      textColor: _kGold,
                                      borderColor: _kGold.withValues(alpha: 0.3),
                                    ),
                                  if (brand.isNotEmpty) ...[
                                    const Gap(8),
                                    _Chip(
                                      label: brand,
                                      color: _kSurface,
                                      textColor: _kText1,
                                      borderColor: _kBorder,
                                    ),
                                  ],
                                ],
                              ),
                            ),

                          // Title
                          Text(
                            title,
                            style: GoogleFonts.inter(
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                              color: _kText0,
                              height: 1.25,
                            ),
                          ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.08, end: 0),

                          const Gap(12),

                          // ── Badges + social proof — single inline row ─────────
                          Row(
                            children: [
                              Flexible(
                                child: ProductBadgeRow(product: product, maxBadges: 2),
                              ),
                              const Gap(8),
                              PeopleViewingNow(productId: productId),
                            ],
                          ).animate().fadeIn(duration: 400.ms, delay: 100.ms),

                          const Gap(16),

                          // Price + stock row
                          Row(
                            children: [
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    crossAxisAlignment: CrossAxisAlignment.baseline,
                                    textBaseline: TextBaseline.alphabetic,
                                    children: [
                                      Text(
                                        '₹${price.toInt()}',
                                        style: GoogleFonts.inter(
                                          fontSize: 26,
                                          fontWeight: FontWeight.w900,
                                          color: _kGold,
                                          height: 1,
                                        ),
                                      ),
                                      const Gap(6),
                                      Text(
                                        '· incl. all taxes',
                                        style: GoogleFonts.inter(
                                            fontSize: 11, color: _kText2),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                              const Spacer(),
                              // Stock indicator
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 12, vertical: 6),
                                decoration: BoxDecoration(
                                  color: inStock
                                      ? GColors.emerald.withValues(alpha: 0.1)
                                      : GColors.rose.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(999),
                                  border: Border.all(
                                    color: inStock
                                        ? GColors.emerald.withValues(alpha: 0.3)
                                        : GColors.rose.withValues(alpha: 0.3),
                                  ),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Container(
                                      width: 6, height: 6,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: inStock ? GColors.emerald : GColors.rose,
                                      ),
                                    ),
                                    const Gap(6),
                                    Text(
                                      inStock ? 'In Stock' : 'Out of Stock',
                                      style: GoogleFonts.inter(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600,
                                        color: inStock ? GColors.emerald : GColors.rose,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),

                    const Gap(20),

                    // ── Variant groups ── FIRST: pick your design before delivery ──
                    if (variantGroups.isNotEmpty) ...[
                      Builder(builder: (ctx) {
                        final meta = (product['metadata'] as Map?) ?? {};
                        final cmpRaw = meta['compareAtPrice']
                            ?? meta['mrp']
                            ?? product['compareAtPrice']
                            ?? product['mrp'];
                        double? cmp;
                        if (cmpRaw is num) cmp = cmpRaw.toDouble();
                        else if (cmpRaw != null) cmp = double.tryParse(cmpRaw.toString());
                        // First product image — used as fallback thumbnail
                        // when individual variants don't have their own image
                        // (common for Design/Color variants of the same SKU).
                        String? fallback;
                        final prodImgs = product['images'] as List? ?? [];
                        if (prodImgs.isNotEmpty) {
                          final first = prodImgs.first;
                          if (first is String) {
                            fallback = first;
                          } else if (first is Map) {
                            fallback = (first['url'] ?? first['src']) as String?;
                          }
                        }
                        return Column(
                          children: variantGroups.entries.map((entry) => _VariantGroup(
                            name: entry.key,
                            options: entry.value,
                            selected: selectedAttrs[entry.key],
                            onSelect: (val) => onAttrSelected(entry.key, val),
                            basePrice: price,
                            compareAtPrice: cmp,
                            fallbackImage: fallback,
                          )).toList(),
                        );
                      }),
                    ],

                    // ── Multi-design picker (Pack of N) ───────────────────────
                    if (packSize != null && packSize! > 1 && variantGroups.isNotEmpty)
                      _MultiDesignPicker(
                        maxCount: packSize!,
                        selected: selectedDesigns,
                        // All variant options (excluding the pack option itself)
                        designs: variantGroups.values
                            .expand((opts) => opts)
                            .where((o) => !RegExp(r'pack|set', caseSensitive: false)
                                .hasMatch(o['value'].toString()))
                            .toList(),
                        onToggle: onDesignToggle,
                      ),

                    // ── Simple variants (no attribute structure) ──────────────
                    if (variantGroups.isEmpty && variants.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Select Option',
                              style: GoogleFonts.inter(
                                fontSize: 13, fontWeight: FontWeight.w700, color: _kText0,
                              )),
                            const Gap(12),
                            Wrap(
                              spacing: 8, runSpacing: 8,
                              children: variants.map((v) {
                                final id = (v['id'] ?? v['_id'] ?? '').toString();
                                final name = (v['name'] ?? v['value'] ?? '').toString();
                                final sel = selectedVariant == id;
                                return GestureDetector(
                                  onTap: () => onVariantSelected(id),
                                  child: AnimatedContainer(
                                    duration: 200.ms,
                                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                                    decoration: BoxDecoration(
                                      color: sel ? _kGold.withValues(alpha: 0.12) : _kSurface,
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(
                                        color: sel ? _kGold.withValues(alpha: 0.6) : _kBorder,
                                        width: sel ? 1.5 : 1,
                                      ),
                                    ),
                                    child: Text(name,
                                      style: GoogleFonts.inter(
                                        fontSize: 13, fontWeight: FontWeight.w600,
                                        color: sel ? _kGold : _kText1,
                                      )),
                                  ),
                                );
                              }).toList(),
                            ),
                          ],
                        ),
                      ),

                    // ── Quantity selector ─────────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                      child: _QuantitySelector(qty: qty, onChanged: onQtyChanged,
                          maxQty: inventory > 0 ? inventory : 99),
                    ),

                    // ── Divider ───────────────────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 2),
                      child: Container(height: 1, color: _kBorder),
                    ),

                    // ── Pincode delivery check ────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                      child: PincodeDeliveryCheck(productId: productId),
                    ),

                    // ── Description ───────────────────────────────────────────
                    if (desc.isNotEmpty) ...[
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
                        child: _DescriptionSection(
                          desc: desc,
                          expanded: descExpanded,
                          onToggle: onDescToggle,
                        ),
                      ),
                      const Gap(16),
                    ],

                    // ── Specifications / attributes ────────────────────────────
                    if (attributes.isNotEmpty) ...[
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
                        child: _SpecsSection(attributes: attributes),
                      ),
                      const Gap(16),
                    ],

                    // ── FAQ (auto-generated by AI SEO — People Also Ask) ──────
                    Builder(builder: (ctx) {
                      final metaMap = (product['metadata'] as Map?) ?? {};
                      final seoMeta = (metaMap['seo']      as Map?) ?? {};
                      final faqRaw  = seoMeta['faq'];
                      final faqItems = faqRaw is List
                          ? List<Map<String, dynamic>>.from(
                              faqRaw.whereType<Map>().map((e) =>
                                  Map<String, dynamic>.from(e as Map)))
                          : <Map<String, dynamic>>[];
                      if (faqItems.isEmpty) return const SizedBox.shrink();
                      return Padding(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                        child: _FaqSection(faqs: faqItems),
                      );
                    }),

                    // ── Tags ──────────────────────────────────────────────────
                    if (tags.isNotEmpty) ...[
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
                        child: Wrap(
                          spacing: 8, runSpacing: 8,
                          children: tags.map((t) => _Chip(
                            label: '#$t',
                            color: _kSurface,
                            textColor: _kText1,
                            borderColor: _kBorder,
                          )).toList(),
                        ),
                      ),
                      const Gap(16),
                    ],

                    // ── Why Gifteeng block ────────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
                      child: _TrustRow(),
                    ),

                    const Gap(20),

                    // ── Ratings & Reviews ─────────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
                      child: ReviewsSection(
                        productId: productId,
                        productSlug: (product['slug'] ?? '').toString(),
                        productTitle: title,
                      ),
                    ),

                    const Gap(20),

                    // ── You may also like ─────────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                      child: YouMayAlsoLikeSection(
                        currentProductId: productId,
                        category: category,
                      ),
                    ),

                    // Bottom padding sized for the sticky CTA only — was 170,
                    // which left a visible empty band below "You may also
                    // like" on tall phones. The sticky bar measures ~88px
                    // (safe area + 62 nav + 26 padding) so 110 is enough.
                    const Gap(110),
                  ],
                ),
              ),
            ),
          ],
        ),

        // ── Sticky bottom CTA ──────────────────────────────────────────────
        Positioned(
          bottom: 0, left: 0, right: 0,
          child: _StickyBottomBar(
            price: price,
            qty: qty,
            isCustom: isCustom,
            addingToCart: addingToCart,
            cartSuccess: cartSuccess,
            cartCtrl: cartCtrl,
            onAddToCart: onAddToCart,
            onCustomize: onCustomize,
          ),
        ),
      ],
    );
  }
}

// ─── Image gallery ────────────────────────────────────────────────────────────

class _ImageGallery extends StatelessWidget {
  final List images;
  final PageController pageCtrl;
  final VoidCallback onBack;
  final bool isCustom, inStock;
  final String productSlug;
  final String productTitle;
  final double productPrice;
  const _ImageGallery({
    required this.images,
    required this.pageCtrl,
    required this.onBack,
    required this.isCustom,
    required this.inStock,
    required this.productSlug,
    required this.productTitle,
    required this.productPrice,
  });

  @override
  Widget build(BuildContext context) {
    final _c        = GColors.of(context);
    final _kBg      = _c.bg0;
    final _kSurface = _c.bg1;
    final _kBorder  = _c.border;
    final _kText0   = _c.text0;
    final h = MediaQuery.sizeOf(context).height * 0.46;
    return SizedBox(
      height: h,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Images
          images.isEmpty
              ? Container(
                  color: _kSurface,
                  child: const Center(
                    child: Text('🎁', style: TextStyle(fontSize: 80)),
                  ),
                )
              : PageView.builder(
                  controller: pageCtrl,
                  itemCount: images.length,
                  // Key changes when first image changes → PageView fully rebuilds
                  key: ValueKey('gallery-${images.first.hashCode}'),
                  itemBuilder: (_, i) => GiftImage(
                    // ValueKey ensures a fresh GiftImage when URL changes
                    key: ValueKey('img-$i-${images[i].hashCode}'),
                    src: images[i],
                    fit: BoxFit.cover,
                  ),
                ),

          // Bottom gradient
          Positioned(
            bottom: 0, left: 0, right: 0,
            child: Container(
              height: 120,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, _kBg.withValues(alpha: 0.6)],
                ),
              ),
            ),
          ),

          // Back button — always visible, solid background
          Positioned(
            top: MediaQuery.of(context).padding.top + 12,
            left: 16,
            child: GestureDetector(
              onTap: () {
                AudioService.instance.tap();
                onBack();
              },
              child: Container(
                width: 42, height: 42,
                decoration: BoxDecoration(
                  color: _kBg.withValues(alpha: 0.9),
                  shape: BoxShape.circle,
                  border: Border.all(color: _kBorder),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x14000000),
                      blurRadius: 8,
                    ),
                  ],
                ),
                child: Icon(
                  Icons.arrow_back_ios_new_rounded,
                  size: 18,
                  color: _kText0,
                ),
              ),
            ),
          ),

          // Top-right: Share button only — Customizable shown in badge row below title
          Positioned(
            top: MediaQuery.of(context).padding.top + 12,
            right: 16,
            child: ShareProductButton(
              productSlug: productSlug,
              productTitle: productTitle,
              productPrice: productPrice,
            ),
          ),

          // Page dots
          if (images.length > 1)
            Positioned(
              bottom: 28, left: 0, right: 0,
              child: Center(
                child: SmoothPageIndicator(
                  controller: pageCtrl,
                  count: images.length,
                  effect: const WormEffect(
                    dotWidth: 6, dotHeight: 6,
                    activeDotColor: _kGold,
                    dotColor: Colors.white30,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ─── Variant group ────────────────────────────────────────────────────────────

// ─── Multi-design picker (Pack of N) ──────────────────────────────────────────

class _MultiDesignPicker extends StatelessWidget {
  final int maxCount;
  final List<String> selected;
  final List<Map<String, dynamic>> designs;
  final ValueChanged<String> onToggle;

  const _MultiDesignPicker({
    required this.maxCount,
    required this.selected,
    required this.designs,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final _c        = GColors.of(context);
    final _kBg      = _c.bg0;
    final _kSurface = _c.bg1;
    final _kBorder  = _c.border;
    final _kText0   = _c.text0;
    final _kText1   = _c.text1;
    final _kText2   = _c.text2;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: _kGold.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _kGold.withValues(alpha: 0.3)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text('🎨', style: TextStyle(fontSize: 18)),
                const Gap(8),
                Text('Pick $maxCount designs',
                  style: GoogleFonts.inter(
                    fontSize: 14, fontWeight: FontWeight.w800, color: _kText0)),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: selected.length == maxCount
                        ? Colors.green.withValues(alpha: 0.15)
                        : _kGold.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                      color: selected.length == maxCount
                          ? Colors.green.withValues(alpha: 0.4)
                          : _kGold.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Text('${selected.length}/$maxCount',
                    style: GoogleFonts.inter(
                      fontSize: 11, fontWeight: FontWeight.w800,
                      color: selected.length == maxCount
                          ? Colors.green
                          : _kGold,
                    )),
                ),
              ],
            ),
            const Gap(4),
            Text('Tap to select — same image can be repeated',
              style: GoogleFonts.inter(fontSize: 11, color: _kText2)),
            const Gap(12),
            Wrap(
              spacing: 8, runSpacing: 8,
              children: designs.map((d) {
                final value = d['value'].toString();
                final img   = d['image'] as String?;
                final picked = selected.contains(value);
                final disabled = !picked && selected.length >= maxCount;
                return GestureDetector(
                  onTap: disabled ? null : () => onToggle(value),
                  child: AnimatedContainer(
                    duration: 180.ms,
                    width: 88,
                    decoration: BoxDecoration(
                      color: picked
                          ? _kGold.withValues(alpha: 0.15)
                          : _kSurface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: picked ? _kGold : _kBorder,
                        width: picked ? 2 : 1,
                      ),
                    ),
                    padding: const EdgeInsets.all(6),
                    child: Column(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: SizedBox(
                            height: 60, width: 76,
                            child: img != null && img.isNotEmpty
                                ? Image.network(img, fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => Container(
                                      color: _kBg,
                                      child: const Center(
                                        child: Text('🎁', style: TextStyle(fontSize: 24))),
                                    ))
                                : Container(
                                    color: _kBg,
                                    child: const Center(
                                      child: Text('🎁', style: TextStyle(fontSize: 24))),
                                  ),
                          ),
                        ),
                        const Gap(4),
                        Text(value, textAlign: TextAlign.center,
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(
                            fontSize: 9, fontWeight: FontWeight.w700,
                            color: picked ? _kGold : _kText1,
                          )),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }
}

/// Variant group — always shows Amazon-style thumbnail cards. When a variant
/// has no image of its own, falls back to the product's main image so the
/// user still sees a visual card instead of an empty placeholder.
class _VariantGroup extends StatelessWidget {
  final String name;
  final List<Map<String, dynamic>> options;
  final String? selected;
  final ValueChanged<String> onSelect;
  final double basePrice;
  final double? compareAtPrice; // strikethrough "M.R.P." reference
  final String? fallbackImage;  // product's main image — used when variant.image is missing

  const _VariantGroup({
    required this.name,
    required this.options,
    required this.selected,
    required this.onSelect,
    required this.basePrice,
    this.compareAtPrice,
    this.fallbackImage,
  });

  // True when at least one variant has its own image OR we have a product
  // fallback image. In both cases we want the rich card layout.
  bool get _canShowThumbnails =>
      (fallbackImage != null && fallbackImage!.isNotEmpty) ||
      options.any((o) {
        final img = o['image'];
        return img is String && img.isNotEmpty;
      });

  // Kept for the old fallback path; now just an alias.
  bool get _hasImages => _canShowThumbnails;

  @override
  Widget build(BuildContext context) {
    final _c        = GColors.of(context);
    final _kSurface = _c.bg1;
    final _kBorder  = _c.border;
    final _kText0   = _c.text0;
    final _kText2   = _c.text2;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Text(name, style: GoogleFonts.inter(
              fontSize: 13, fontWeight: FontWeight.w700, color: _kText0)),
            if (selected != null) ...[
              const Gap(6),
              Text('·', style: GoogleFonts.inter(fontSize: 13, color: _kText2)),
              const Gap(6),
              Flexible(
                child: Text(selected!,
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.inter(
                    fontSize: 13, fontWeight: FontWeight.w600, color: _kGold))),
            ],
          ]),
          const Gap(12),
          if (_hasImages) _buildThumbnailRow() else _buildPillsRow(context),
        ],
      ),
    );
  }

  /// Horizontal scrollable row of rich variant cards (Amazon-style).
  /// After [_maxInlineVariants], shows a "See all N options" tile that
  /// opens a full-screen grid of every variant.
  static const _maxInlineVariants = 5;

  Widget _buildThumbnailRow() {
    final total = options.length;
    final showAll = total > _maxInlineVariants;
    final inlineCount = showAll ? _maxInlineVariants : total;
    // +1 for the "See all" tile when needed.
    final itemCount = showAll ? inlineCount + 1 : inlineCount;

    // Use a generous height so the ListView has a valid cross-axis constraint,
    // but align each card to the top so whitespace falls *outside* the card
    // border (cards size to their own content, not the row height).
    return SizedBox(
      height: 210,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: itemCount,
        separatorBuilder: (_, __) => const Gap(10),
        itemBuilder: (ctx, i) {
          if (showAll && i == inlineCount) {
            return _SeeAllTile(
              total: total,
              onTap: () => _showAllVariantsSheet(ctx),
            );
          }
          // Align to top so the AnimatedContainer shrinks to its content
          // height instead of stretching to fill all 210 px.
          return Align(
            alignment: Alignment.topCenter,
            child: _VariantCard(
              option: options[i],
              selected: selected == options[i]['value'].toString(),
              basePrice: basePrice,
              compareAtPrice: compareAtPrice,
              fallbackImage: fallbackImage,
              onTap: () {
                final inStock = options[i]['inStock'] as bool? ?? true;
                if (inStock) onSelect(options[i]['value'].toString());
              },
            ),
          );
        },
      ),
    );
  }

  void _showAllVariantsSheet(BuildContext context) {
    HapticFeedback.selectionClick();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetCtx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.85,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        builder: (_, scroll) => Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
          child: Column(children: [
            Center(child: Container(
              width: 42, height: 4, margin: const EdgeInsets.only(bottom: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFE5E7EB),
                borderRadius: BorderRadius.circular(2),
              ),
            )),
            Row(children: [
              Text('Choose $name', style: GoogleFonts.inter(
                fontSize: 18, fontWeight: FontWeight.w800,
                color: const Color(0xFF1A1A1A))),
              const Gap(8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFFF3F4F6),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text('${options.length} options',
                  style: GoogleFonts.inter(
                    fontSize: 11, fontWeight: FontWeight.w700,
                    color: const Color(0xFF4B5563))),
              ),
              const Spacer(),
              GestureDetector(
                onTap: () => Navigator.pop(sheetCtx),
                child: const Icon(Icons.close_rounded, size: 22,
                    color: Color(0xFF4B5563)),
              ),
            ]),
            const Gap(12),
            Expanded(
              child: LayoutBuilder(builder: (ctx, constraints) {
                // mainAxisExtent gives a predictable cell height that
                // always fits the square image + name + price + optional
                // strikethrough M.R.P + optional "Out of stock" line.
                // 0.78 aspect-ratio left a 14px deficit on most phones —
                // calculating the height explicitly avoids that.
                const double crossSpacing = 10;
                final double cellW =
                    (constraints.maxWidth - crossSpacing) / 2;
                // image(cellW) + 8 padTop + 16 name + 4 gap +
                // 18 price + 14 mrp + 4 stock + 10 padBot ≈ cellW + 74
                final double cellH = cellW + 78;
                return GridView.builder(
                  controller: scroll,
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount:   2,
                    crossAxisSpacing: crossSpacing,
                    mainAxisSpacing:  10,
                    mainAxisExtent:   cellH,
                  ),
                  itemCount: options.length,
                  itemBuilder: (_, i) => _VariantCard(
                    option: options[i],
                    selected: selected == options[i]['value'].toString(),
                    basePrice: basePrice,
                    compareAtPrice: compareAtPrice,
                    fallbackImage: fallbackImage,
                    onTap: () {
                      final inStock = options[i]['inStock'] as bool? ?? true;
                      if (inStock) {
                        onSelect(options[i]['value'].toString());
                        Navigator.pop(sheetCtx);
                      }
                    },
                  ),
                );
              }),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _buildPillsRow(BuildContext context) {
    final _c        = GColors.of(context);
    final _kSurface = _c.bg1;
    final _kBorder  = _c.border;
    final _kText1   = _c.text1;
    final _kText2   = _c.text2;
    return Wrap(
      spacing: 8, runSpacing: 8,
      children: options.map((opt) {
        final val     = opt['value'].toString();
        final inStock = opt['inStock'] as bool? ?? true;
        final sel     = selected == val;
        return GestureDetector(
          onTap: inStock ? () => onSelect(val) : null,
          child: AnimatedContainer(
            duration: 200.ms,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: sel
                  ? _kGold.withValues(alpha: 0.12)
                  : inStock ? _kSurface : _kSurface.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: sel ? _kGold.withValues(alpha: 0.6) : _kBorder,
                width: sel ? 1.5 : 1,
              ),
            ),
            child: Text(inStock ? val : '$val (OOS)',
              style: GoogleFonts.inter(
                fontSize: 13, fontWeight: FontWeight.w600,
                color: sel ? _kGold : inStock ? _kText1 : _kText2,
                decoration: inStock ? null : TextDecoration.lineThrough,
              )),
          ),
        );
      }).toList(),
    );
  }
}

/// Single Amazon-style variant card: image + name + price + M.R.P + stock.
class _VariantCard extends StatelessWidget {
  final Map<String, dynamic> option;
  final bool selected;
  final double basePrice;
  final double? compareAtPrice;
  final String? fallbackImage; // product's main image — used if variant has none
  final VoidCallback onTap;

  const _VariantCard({
    required this.option,
    required this.selected,
    required this.basePrice,
    required this.compareAtPrice,
    required this.onTap,
    this.fallbackImage,
  });

  @override
  Widget build(BuildContext context) {
    final _c        = GColors.of(context);
    final _kSurface = _c.bg1;
    final _kBorder  = _c.border;
    final _kText1   = _c.text1;
    final _kText2   = _c.text2;
    final value = option['value']?.toString() ?? '';
    // Variant image first, product main image as fallback.
    final variantImage = option['image'] as String?;
    final image = (variantImage != null && variantImage.isNotEmpty)
        ? variantImage
        : fallbackImage;
    final inStock = option['inStock'] as bool? ?? true;
    // Variant price = base + priceDelta (priceDelta may be String)
    final pdRaw   = option['priceDelta'] ?? option['price'] ?? 0;
    final pd = pdRaw is num
        ? pdRaw.toDouble()
        : double.tryParse(pdRaw.toString()) ?? 0;
    final price = basePrice + pd;
    final hasDiscount = compareAtPrice != null && compareAtPrice! > price;
    final discountPct = hasDiscount
        ? ((compareAtPrice! - price) / compareAtPrice! * 100).round()
        : 0;

    return GestureDetector(
      onTap: inStock ? onTap : null,
      child: Opacity(
        opacity: inStock ? 1.0 : 0.45,
        child: AnimatedContainer(
        duration: 180.ms,
        width: 140,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? _kGold : const Color(0xFFE5E7EB),
            width: selected ? 2 : 1,
          ),
          boxShadow: selected
              ? [const BoxShadow(
                  color: Color(0x14000000),
                  blurRadius: 8, offset: Offset(0, 2),
                )]
              : null,
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,   // ← shrink-wrap content, no empty gap
              children: [
                // Image area — square 1:1 so every variant looks
                // consistent regardless of source image aspect ratio.
                // Was a fixed 110px height which produced cropped /
                // stretched thumbnails depending on the design.
                Stack(children: [
                  AspectRatio(
                    aspectRatio: 1,
                    child: image != null && image.isNotEmpty
                        ? GiftImage(src: image, fit: BoxFit.cover)
                        : _placeholder(),
                  ),
                  if (hasDiscount)
                    Positioned(
                      top: 6, left: 6,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 5, vertical: 2),
                        decoration: BoxDecoration(
                          color: const Color(0xFFCC0C39), // Amazon red
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text('$discountPct% off',
                          style: GoogleFonts.inter(
                            fontSize: 9, fontWeight: FontWeight.w800,
                            color: Colors.white)),
                      ),
                    ),
                ]),

                // Info area
                Padding(
                  padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Variant name
                      Text(value, maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.inter(
                          fontSize: 12, fontWeight: FontWeight.w700,
                          color: const Color(0xFF1A1A1A))),
                      const Gap(4),
                      // Price
                      Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text('₹${price.toStringAsFixed(0)}',
                          style: GoogleFonts.inter(
                            fontSize: 15, fontWeight: FontWeight.w800,
                            color: const Color(0xFF1A1A1A))),
                        if (pd > 0) ...[
                          const Gap(2),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 3, vertical: 1),
                            decoration: BoxDecoration(
                              color: _kGold.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text('+${pd.toStringAsFixed(0)}',
                              style: GoogleFonts.inter(
                                fontSize: 8, fontWeight: FontWeight.w700,
                                color: _kGold)),
                          ),
                        ],
                      ]),
                      // M.R.P strikethrough
                      if (hasDiscount)
                        Text('₹${compareAtPrice!.toStringAsFixed(0)}',
                          style: GoogleFonts.inter(
                            fontSize: 11, color: const Color(0xFF888888),
                            decoration: TextDecoration.lineThrough)),
                      if (!inStock) ...[
                        const Gap(2),
                        Text('Out of stock',
                          style: GoogleFonts.inter(
                            fontSize: 10, fontWeight: FontWeight.w600,
                            color: const Color(0xFFDC2626))),
                      ],
                    ],
                  ),
                ),
              ],
            ),
            // Selected checkmark overlay
            if (selected)
              Positioned(
                top: 6, right: 6,
                child: Container(
                  width: 22, height: 22,
                  decoration: BoxDecoration(
                    color: _kGold, shape: BoxShape.circle,
                    boxShadow: [BoxShadow(
                      color: Colors.black.withValues(alpha: 0.2),
                      blurRadius: 4, offset: const Offset(0, 1),
                    )],
                  ),
                  child: const Icon(Icons.check_rounded,
                      size: 14, color: Colors.black),
                ),
              ),
          ],
        ),
        ),
      ),
    );
  }

  Widget _placeholder() => Container(
    color: const Color(0xFFF3F4F6),
    child: const Center(child: Text('🎁', style: TextStyle(fontSize: 44))),
  );
}

/// "See all N options" tile shown at the end of the inline variant row.
class _SeeAllTile extends StatelessWidget {
  final int total;
  final VoidCallback onTap;
  const _SeeAllTile({required this.total, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final _c        = GColors.of(context);
    final _kSurface = _c.bg1;
    final _kBorder  = _c.border;
    final _kText0   = _c.text0;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 140,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE5E7EB)),
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // 4-dot grid icon (like Amazon's)
              Container(
                width: 46, height: 46,
                decoration: BoxDecoration(
                  color: const Color(0xFFF3F4F6),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.grid_view_rounded,
                    size: 24, color: Color(0xFF4B5563)),
              ),
              const Gap(12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: Text.rich(
                  TextSpan(children: [
                    const TextSpan(text: 'See all '),
                    TextSpan(text: '$total',
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                    const TextSpan(text: '\noptions'),
                  ]),
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(
                    fontSize: 13, fontWeight: FontWeight.w700,
                    color: const Color(0xFF2563EB),
                    height: 1.35,
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

// ─── Quantity selector ────────────────────────────────────────────────────────

class _QuantitySelector extends StatelessWidget {
  final int qty;
  final int maxQty;
  final ValueChanged<int> onChanged;
  const _QuantitySelector({
    required this.qty,
    required this.onChanged,
    this.maxQty = 99,
  });

  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final _kSurface = _c.bg1;
    final _kBorder  = _c.border;
    final _kText0  = _c.text0;
    return Row(
      children: [
        Text('Quantity', style: GoogleFonts.inter(
          fontSize: 13, fontWeight: FontWeight.w700, color: _kText0,
        )),
        const Spacer(),
        Container(
          decoration: BoxDecoration(
            color: _kSurface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _kBorder),
          ),
          child: Row(
            children: [
              _QtyBtn(
                icon: Icons.remove_rounded,
                onTap: qty > 1 ? () => onChanged(qty - 1) : null,
              ),
              Container(
                width: 42,
                alignment: Alignment.center,
                child: Text(
                  '$qty',
                  style: GoogleFonts.inter(
                    fontSize: 16, fontWeight: FontWeight.w700, color: _kText0,
                  ),
                ),
              ),
              _QtyBtn(
                icon: Icons.add_rounded,
                onTap: qty < maxQty ? () => onChanged(qty + 1) : null,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _QtyBtn extends StatefulWidget {
  final IconData icon;
  final VoidCallback? onTap;
  const _QtyBtn({required this.icon, this.onTap});

  @override
  State<_QtyBtn> createState() => _QtyBtnState();
}

class _QtyBtnState extends State<_QtyBtn> {
  bool _pressing = false;

  @override
  Widget build(BuildContext context) {
    final _c      = GColors.of(context);
    final enabled = widget.onTap != null;
    return GestureDetector(
      onTapDown:   enabled ? (_) => setState(() => _pressing = true)  : null,
      onTapUp:     (_) => setState(() => _pressing = false),
      onTapCancel: ()  => setState(() => _pressing = false),
      onTap: () {
        if (widget.onTap != null) {
          HapticFeedback.selectionClick();
          widget.onTap!();
        }
      },
      child: AnimatedScale(
        scale:    _pressing && enabled ? 0.82 : 1.0,
        duration: const Duration(milliseconds: 100),
        curve:    Curves.easeOut,
        child: Container(
          width: 38, height: 38,
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(10)),
          child: Icon(widget.icon, size: 18,
              color: enabled ? _c.text0 : _c.text2),
        ),
      ),
    );
  }
}

// ─── Description section ──────────────────────────────────────────────────────

class _DescriptionSection extends StatelessWidget {
  final String desc;
  final bool expanded;
  final VoidCallback onToggle;
  const _DescriptionSection({
    required this.desc,
    required this.expanded,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final _c        = GColors.of(context);
    final _kSurface = _c.bg1;
    final _kBorder  = _c.border;
    final _kText0   = _c.text0;
    final _kText1   = _c.text1;
    const maxChars = 200;
    final isLong = desc.length > maxChars;
    final displayText = expanded || !isLong
        ? desc
        : '${desc.substring(0, maxChars)}…';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _kSurface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _kBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('📦', style: TextStyle(fontSize: 16)),
              const Gap(8),
              Text(
                'About this gift',
                style: GoogleFonts.inter(
                  fontSize: 14, fontWeight: FontWeight.w700, color: _kText0,
                ),
              ),
            ],
          ),
          const Gap(12),
          Text(
            displayText,
            style: GoogleFonts.inter(
              fontSize: 13, color: _kText1, height: 1.7,
            ),
          ),
          if (isLong) ...[
            const Gap(8),
            GestureDetector(
              onTap: onToggle,
              child: Text(
                expanded ? 'Show less ↑' : 'Read more ↓',
                style: GoogleFonts.inter(
                  fontSize: 12, fontWeight: FontWeight.w600, color: _kGold,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ─── Specifications section ───────────────────────────────────────────────────

class _SpecsSection extends StatelessWidget {
  final List<Map<String, dynamic>> attributes;
  const _SpecsSection({required this.attributes});

  @override
  Widget build(BuildContext context) {
    final _c        = GColors.of(context);
    final _kBg      = _c.bg0;
    final _kSurface = _c.bg1;
    final _kBorder  = _c.border;
    final _kText0   = _c.text0;
    final _kText1   = _c.text1;
    final _kText2   = _c.text2;
    return Container(
      decoration: BoxDecoration(
        color: _kSurface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _kBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Row(
              children: [
                const Text('📋', style: TextStyle(fontSize: 16)),
                const Gap(8),
                Text('Specifications',
                  style: GoogleFonts.inter(
                    fontSize: 14, fontWeight: FontWeight.w700, color: _kText0,
                  )),
              ],
            ),
          ),
          ...attributes.asMap().entries.map((entry) {
            final i = entry.key;
            final attr = entry.value;
            final name = attr['name']?.toString() ?? '';
            final value = attr['value']?.toString() ?? '';
            return Container(
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(color: _kBorder),
                ),
                color: i.isOdd ? _kBg.withValues(alpha: 0.5) : Colors.transparent,
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 120,
                      child: Text(name,
                        style: GoogleFonts.inter(fontSize: 12, color: _kText2)),
                    ),
                    Expanded(
                      child: Text(value,
                        style: GoogleFonts.inter(
                          fontSize: 12, fontWeight: FontWeight.w500, color: _kText1,
                        )),
                    ),
                  ],
                ),
              ),
            );
          }),
          const Gap(4),
        ],
      ),
    );
  }
}

// ─── Trust row ────────────────────────────────────────────────────────────────

class _TrustRow extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final _c        = GColors.of(context);
    final _kSurface = _c.bg1;
    final _kBorder  = _c.border;
    final _kText2   = _c.text2;
    const items = <(IconData, String)>[
      (Icons.local_shipping_outlined,  'Fast Delivery'),
      (Icons.replay_outlined,          'Easy Returns'),
      (Icons.verified_outlined,        'Verified Quality'),
      (Icons.card_giftcard_outlined,   'Gift Wrapping'),
    ];
    // Each trust item: icon stacked above label (vertical layout).
    // Before: horizontal icon+text at 13px/9px crammed in a row → receipt footer feel.
    // After:  icon 18px centred, label 10px below → distinct quality signals.
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        color: _kSurface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _kBorder),
      ),
      child: Row(
        children: items.map((item) => Expanded(
          child: Container(
            decoration: item != items.last
                ? BoxDecoration(
                    border: Border(
                        right: BorderSide(color: _kBorder, width: 0.5)))
                : null,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(item.$1, size: 18, color: _kText2),
                const Gap(5),
                Text(
                  item.$2,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(
                      fontSize: 10,
                      color: _kText2,
                      fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
        )).toList(),
      ),
    );
  }
}

// ─── Sticky bottom CTA ────────────────────────────────────────────────────────

class _StickyBottomBar extends StatefulWidget {
  final double price;
  final int qty;
  final bool isCustom, addingToCart, cartSuccess;
  final AnimationController cartCtrl;
  final VoidCallback onAddToCart, onCustomize;
  const _StickyBottomBar({
    required this.price,
    required this.qty,
    required this.isCustom,
    required this.addingToCart,
    required this.cartSuccess,
    required this.cartCtrl,
    required this.onAddToCart,
    required this.onCustomize,
  });

  @override
  State<_StickyBottomBar> createState() => _StickyBottomBarState();
}

class _StickyBottomBarState extends State<_StickyBottomBar> {
  bool _pressingCart     = false;
  bool _pressingCustomize = false;

  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kBorder = _c.border;
    final _kText2  = _c.text2;
    final total = (widget.price * widget.qty).toInt();

    return Container(
      // Shell uses bottomNavigationBar → scaffold body already ends above nav bar.
      // Only need safe-area + small inner gap.
      padding: EdgeInsets.fromLTRB(
          16, 10, 16, MediaQuery.of(context).padding.bottom + 10),
      decoration: BoxDecoration(
        color: _kBg.withValues(alpha: 0.97),
        border: Border(top: BorderSide(color: _kBorder)),
      ),
      // ── Always show: Total | Add to Cart | [Customise if applicable] ──────
      child: Row(
        children: [
          // Price
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Total',
                  style: GoogleFonts.inter(fontSize: 10, color: _kText2)),
              Text('₹$total',
                  style: GoogleFonts.inter(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    color: _c.text0,
                  )),
            ],
          ),
          const Gap(12),

          // For customizable products: Customise button only.
          // For non-customizable products: Add to Cart only.
          if (widget.isCustom) ...[
            Expanded(
              child: GestureDetector(
                onTapDown:   (_) => setState(() => _pressingCustomize = true),
                onTapUp:     (_) => setState(() => _pressingCustomize = false),
                onTapCancel: ()  => setState(() => _pressingCustomize = false),
                onTap: widget.onCustomize,
                child: AnimatedScale(
                  scale:    _pressingCustomize ? 0.97 : 1.0,
                  duration: const Duration(milliseconds: 120),
                  curve:    Curves.easeOut,
                  child: Container(
                    height: 44,
                    decoration: BoxDecoration(
                      color: GColors.brand,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.auto_awesome_rounded,
                              size: 16, color: Colors.white),
                          const Gap(6),
                          Text('Customise & Add',
                              style: GoogleFonts.inter(
                                fontSize: 13,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              )),
                        ]),
                  ),
                ),
              ),
            ),
          ] else ...[
            Expanded(
              child: GestureDetector(
                onTapDown: (!widget.addingToCart && !widget.cartSuccess)
                    ? (_) => setState(() => _pressingCart = true)
                    : null,
                onTapUp:     (_) => setState(() => _pressingCart = false),
                onTapCancel: ()  => setState(() => _pressingCart = false),
                onTap: widget.addingToCart ? null : widget.onAddToCart,
                child: AnimatedScale(
                  scale: (_pressingCart &&
                          !widget.addingToCart &&
                          !widget.cartSuccess)
                      ? 0.97
                      : 1.0,
                  duration: const Duration(milliseconds: 120),
                  curve:    Curves.easeOut,
                  child: AnimatedContainer(
                    duration: 250.ms,
                    height: 44,
                    decoration: BoxDecoration(
                      color: widget.cartSuccess
                          ? GColors.emerald
                          : GColors.brand,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Center(
                      child: widget.addingToCart
                          ? const SizedBox(
                              width: 20, height: 20,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2.5, color: Colors.white),
                            )
                          : widget.cartSuccess
                              ? Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Lottie.asset(
                                      'assets/animations/checkmark.json',
                                      width: 24, height: 24,
                                      controller: widget.cartCtrl,
                                      onLoaded: (c) =>
                                          widget.cartCtrl.duration = c.duration,
                                    ),
                                    const Gap(5),
                                    Text('Added!',
                                        style: GoogleFonts.inter(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w800,
                                          color: Colors.white,
                                        )),
                                  ])
                              : Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(
                                        Icons.shopping_bag_outlined,
                                        size: 16,
                                        color: Colors.white),
                                    const Gap(6),
                                    Text('Add to Cart',
                                        style: GoogleFonts.inter(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w800,
                                          color: Colors.white,
                                        )),
                                  ]),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

class _Chip extends StatelessWidget {
  final String label;
  final Color color, textColor, borderColor;
  const _Chip({
    required this.label,
    required this.color,
    required this.textColor,
    required this.borderColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: borderColor),
      ),
      child: Text(label, style: GoogleFonts.inter(
        fontSize: 11, fontWeight: FontWeight.w600, color: textColor,
      )),
    );
  }
}

// ─── Loading / Error views ────────────────────────────────────────────────────

class _LoadingView extends StatelessWidget {
  const _LoadingView();
  @override
  Widget build(BuildContext context) {
    final _kBg = GColors.of(context).bg0;
    return Scaffold(
      backgroundColor: _kBg,
      body: const Center(
        child: CircularProgressIndicator(color: _kGold, strokeWidth: 2),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final VoidCallback onBack;
  const _ErrorView({required this.onBack});
  @override
  Widget build(BuildContext context) {
    final _c      = GColors.of(context);
    final _kBg    = _c.bg0;
    final _kText1 = _c.text1;
    return Scaffold(
      backgroundColor: _kBg,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('😕', style: TextStyle(fontSize: 56)),
            const Gap(16),
            Text('Could not load product',
              style: GoogleFonts.inter(fontSize: 16, color: _kText1)),
            const Gap(20),
            GestureDetector(
              onTap: onBack,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                decoration: BoxDecoration(
                  color: GColors.brand,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text('← Go back',
                  style: GoogleFonts.inter(
                    fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white,
                  )),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── FAQ Section ─────────────────────────────────────────────────────────────
//
// Renders the AI-generated FAQ items stored in product.metadata.seo.faq.
// Each item is an accordion tile — users tap to reveal the answer.
// This matches the FAQPage schema injected into the web product pages and
// drives Google's "People Also Ask" rich-snippet eligibility.

class _FaqSection extends StatefulWidget {
  final List<Map<String, dynamic>> faqs;
  const _FaqSection({required this.faqs});

  @override
  State<_FaqSection> createState() => _FaqSectionState();
}

class _FaqSectionState extends State<_FaqSection> {
  final Set<int> _open = {};

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);

    // Pre-filter to only items with both a question and an answer.
    final valid = widget.faqs
        .map((e) => (
              q: (e['q'] ?? e['question'] ?? '').toString(),
              a: (e['a'] ?? e['answer']   ?? '').toString(),
            ))
        .where((e) => e.q.isNotEmpty && e.a.isNotEmpty)
        .toList();

    if (valid.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Section header
        Row(
          children: [
            const Text('❓', style: TextStyle(fontSize: 16)),
            const Gap(8),
            Text(
              'Frequently Asked Questions',
              style: GoogleFonts.inter(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: c.text0,
              ),
            ),
          ],
        ),
        const Gap(10),

        // All FAQ items unified in one container — hairline dividers between.
        // Before: one heavy rounded card per item (visual weight × N).
        // After:  one shared surface, items separated by 1px hairlines.
        Container(
          decoration: BoxDecoration(
            color: c.bg1,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: c.border),
          ),
          child: Column(
            children: valid.asMap().entries.map((entry) {
              final i      = entry.key;
              final item   = entry.value;
              final isOpen = _open.contains(i);

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Hairline divider between items (not before the first one)
                  if (i > 0)
                    Divider(height: 1, thickness: 1, color: c.border),

                  GestureDetector(
                    onTap: () {
                      HapticFeedback.selectionClick();
                      setState(() {
                        if (isOpen) _open.remove(i); else _open.add(i);
                      });
                    },
                    behavior: HitTestBehavior.opaque,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Question + chevron
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Text(
                                  item.q,
                                  style: GoogleFonts.inter(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: isOpen ? GColors.brand : c.text0,
                                    height: 1.35,
                                  ),
                                ),
                              ),
                              const Gap(8),
                              AnimatedRotation(
                                turns: isOpen ? 0.5 : 0,
                                duration: const Duration(milliseconds: 200),
                                curve: Curves.easeOut,
                                child: Icon(
                                  Icons.keyboard_arrow_down_rounded,
                                  size: 20,
                                  color: isOpen ? GColors.brand : c.text2,
                                ),
                              ),
                            ],
                          ),

                          // Answer (animated expand — same logic, tighter padding)
                          AnimatedCrossFade(
                            firstChild: const SizedBox.shrink(),
                            secondChild: Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text(
                                item.a,
                                style: GoogleFonts.inter(
                                  fontSize: 12.5,
                                  color: c.text1,
                                  height: 1.55,
                                ),
                              ),
                            ),
                            crossFadeState: isOpen
                                ? CrossFadeState.showSecond
                                : CrossFadeState.showFirst,
                            duration: const Duration(milliseconds: 200),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              );
            }).toList(),
          ),
        ),
      ],
    );
  }
}
