// ─── Orders screen ───────────────────────────────────────────────────────────
//
// Redesigned to match the "My Orders" mockup:
//   • Top tabs: All · Processing · Shipped · Delivered
//   • Order card carries the current stage as an inline pill (e.g.
//     "Being Crafted 💪 — Your gift is being crafted with love ❤️"),
//   • A 5-stop timeline: Placed → Crafting → Packed → Shipped → Delivered
//   • Expected delivery date + a Track Order CTA
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:gap/gap.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/widgets/gift_image.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

final _ordersProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get('/orders/b2c/mine',
      queryParameters: {'pageSize': 100});
  final data = res.data;
  if (data is List) return List<Map<String, dynamic>>.from(data);
  if (data is Map) {
    return List<Map<String, dynamic>>.from(data['items'] ?? data['orders'] ?? []);
  }
  return [];
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Maps API status → timeline stage index. Anything we don't recognise lands
// on `placed` (stage 0) so the timeline never goes blank.
//   0 = Placed, 1 = Crafting (== confirmed/processing), 2 = Packed,
//   3 = Shipped, 4 = Delivered
int _stageIndex(String status) {
  // Normalize: lowercase + strip common API prefixes (e.g. "new_order" → "new").
  final s = status.toLowerCase().trim();
  switch (s) {
    case 'placed':
    case 'pending':
    case 'new':
    case 'new_order':       // raw enum from backend — was leaking as a label
    case 'order_placed':
      return 0;
    case 'confirmed':
    case 'processing':
    case 'crafting':
    case 'in_production':
      return 1;
    case 'packed':
    case 'ready':
    case 'ready_to_ship':
      return 2;
    case 'shipped':
    case 'in_transit':
    case 'out_for_delivery':
      return 3;
    case 'delivered':
    case 'completed':
      return 4;
    case 'cancelled':
    case 'canceled':
    case 'refunded':
      return -1;
    default:
      return 0;
  }
}

// Card-level stage banner: ("emoji", "label", "tagline", "accent colour").
// Default branch falls back to "Order placed" + sky-blue so the UI never shows
// a raw API enum string like "new_order" (which was leaking before).
({String emoji, String label, String tagline, Color color}) _stageBanner(
    String status, BuildContext ctx) {
  final s = status.toLowerCase().trim();
  switch (s) {
    // Active stages all wear the brand color — one consistent "in-progress"
    // hue per Impeccable rules (brand color as ACCENT, not surface). Success
    // (delivered) and failure (cancelled / refunded) stay semantically
    // distinct: emerald and rose. This makes the timeline read as a single
    // brand-colored progression that turns green on completion.
    case 'placed':
    case 'pending':
    case 'new':
    case 'new_order':
    case 'order_placed':
      return (
        emoji: '🧾',
        label: 'Order Placed',
        tagline: "We'll start crafting it shortly",
        color: GColors.brand,
      );
    case 'confirmed':
    case 'processing':
    case 'crafting':
    case 'in_production':
      return (
        emoji: '💪',
        label: 'Being Crafted',
        tagline: 'Your gift is being crafted with love',
        color: GColors.brand,
      );
    case 'packed':
    case 'ready':
    case 'ready_to_ship':
      return (
        emoji: '📦',
        label: 'Packed',
        tagline: 'Wrapped and ready to ship',
        color: GColors.brand,
      );
    case 'shipped':
    case 'in_transit':
    case 'out_for_delivery':
      return (
        emoji: '🚚',
        label: 'On the Way',
        tagline: 'Courier picked up — should be there soon',
        color: GColors.brand,
      );
    case 'delivered':
    case 'completed':
      return (
        emoji: '✅',
        label: 'Delivered',
        tagline: 'Hope the recipient loved it!',
        color: GColors.emerald,
      );
    case 'cancelled':
    case 'canceled':
      return (
        emoji: '✋',
        label: 'Cancelled',
        tagline: 'This order was cancelled',
        color: GColors.rose,
      );
    case 'refunded':
      return (
        emoji: '↩️',
        label: 'Refunded',
        tagline: 'Refund processed',
        color: GColors.rose,
      );
    default:
      // Unknown enum → friendly fallback (never expose raw API strings).
      return (
        emoji: '🧾',
        label: 'Order Placed',
        tagline: 'Updates will appear here',
        color: GColors.brand,
      );
  }
}

String _formatDate(String? iso) {
  if (iso == null) return '';
  try {
    final dt = DateTime.parse(iso).toLocal();
    return DateFormat('d MMM yyyy').format(dt);
  } catch (_) {
    return '';
  }
}

/// Date + time — used on the collapsed-card subline so the order timestamp
/// is visible at a glance without expanding ("13 May 2026 · 1:42 PM").
String _formatDateTime(String? iso) {
  if (iso == null) return '';
  try {
    final dt = DateTime.parse(iso).toLocal();
    return DateFormat('d MMM yyyy · h:mm a').format(dt);
  } catch (_) {
    return '';
  }
}

/// Display the order number cleanly:
///   • Sequential `GFT-001247` → `#001247` (clean, scannable for team)
///   • Legacy random `GFT-MP53TQY9` → `#GFT-MP53TQY9` (full, no choice)
///
/// The backend migration that introduces sequential numbers must be deployed
/// for new orders to hit the first branch. Existing orders created before
/// the migration retain their random IDs and pass through unchanged.
String _displayOrderNumber(String orderNumber) {
  final n = orderNumber.trim();
  if (n.isEmpty) return '—';
  final seq = RegExp(r'^GFT-(\d+)$');
  final m = seq.firstMatch(n);
  if (m != null) return '#${m.group(1)}';
  return '#$n';
}

String _firstImageUrl(Map order) {
  final items = (order['items'] as List?) ?? const [];
  for (final it in items) {
    final m = it as Map;
    final snapshot = (m['snapshot'] as Map?) ?? const {};
    final product  = (m['product']  as Map?) ?? const {};
    final imgs = snapshot['images'] ?? product['images'] ?? m['images'];
    if (imgs is List && imgs.isNotEmpty) {
      final first = imgs.first;
      if (first is String) return first;
      if (first is Map) return (first['url'] ?? first['src'] ?? '').toString();
    }
  }
  return '';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;
  static const _tabs = ['All', 'Processing', 'Shipped', 'Delivered'];

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: _tabs.length, vsync: this);
    _tab.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  bool _matchesTab(Map order) {
    final s = (order['status'] as String? ?? '').toLowerCase();
    switch (_tab.index) {
      case 1: // Processing
        return s == 'pending' ||
            s == 'placed' ||
            s == 'confirmed' ||
            s == 'processing' ||
            s == 'crafting' ||
            s == 'packed' ||
            s == 'ready';
      case 2: // Shipped
        return s == 'shipped' || s == 'in_transit';
      case 3: // Delivered
        return s == 'delivered' || s == 'completed';
      default:
        return true; // All
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final ordersAsync = ref.watch(_ordersProvider);

    return Scaffold(
      backgroundColor: c.bg0,
      appBar: AppBar(
        elevation: 0,
        backgroundColor: c.bg0,
        title: Text('My Orders',
            style: GoogleFonts.inter(
              fontSize: 22,
              fontWeight: FontWeight.w900,
              color: c.text0,
            )),
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: c.text0),
          onPressed: () => context.pop(),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(50),
          child: TabBar(
            controller: _tab,
            isScrollable: false,
            indicator: const UnderlineTabIndicator(
              borderSide: BorderSide(color: GColors.brand, width: 2.5),
              insets: EdgeInsets.symmetric(horizontal: 24),
            ),
            indicatorSize: TabBarIndicatorSize.label,
            indicatorColor: GColors.brand,
            labelColor: GColors.brand,
            unselectedLabelColor: c.text2,
            labelStyle: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w800),
            unselectedLabelStyle:
                GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600),
            tabs: _tabs.map((t) => Tab(text: t)).toList(),
          ),
        ),
      ),
      body: ordersAsync.when(
        loading: () =>
            const Center(child: CircularProgressIndicator(color: GColors.brand)),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('😕', style: TextStyle(fontSize: 48)),
              const Gap(12),
              Text('Could not load orders',
                  style: GoogleFonts.inter(color: GColors.text1)),
              const Gap(12),
              TextButton(
                onPressed: () => ref.invalidate(_ordersProvider),
                child:
                    Text('Retry', style: GoogleFonts.inter(color: GColors.brand)),
              ),
            ],
          ),
        ),
        data: (allOrders) {
          final orders =
              allOrders.where((o) => _matchesTab(o as Map)).toList(growable: false);
          if (orders.isEmpty) {
            return _EmptyOrders(tab: _tabs[_tab.index]);
          }
          return RefreshIndicator(
            color: GColors.brand,
            onRefresh: () async {
              ref.invalidate(_ordersProvider);
              await ref.read(_ordersProvider.future);
            },
            child: ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(
                  parent: BouncingScrollPhysics()),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              separatorBuilder: (_, __) => const Gap(14),
              itemCount: orders.length,
              itemBuilder: (ctx, i) => _OrderCard(order: orders[i])
                  .animate(delay: Duration(milliseconds: i * 60))
                  .fadeIn(duration: 300.ms)
                  .slideY(begin: 0.05, end: 0, duration: 300.ms),
            ),
          );
        },
      ),
    );
  }
}

class _EmptyOrders extends StatelessWidget {
  final String tab;
  const _EmptyOrders({required this.tab});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('📦', style: TextStyle(fontSize: 64)),
          const Gap(16),
          Text(
            tab == 'All'
                ? 'No orders yet'
                : 'No "$tab" orders right now',
            style: GoogleFonts.inter(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: GColors.text0,
            ),
          ),
          const Gap(8),
          Text('Your orders will appear here',
              style:
                  GoogleFonts.inter(fontSize: 13, color: GColors.text1)),
          const Gap(24),
          ElevatedButton(
            onPressed: () => GoRouter.of(context).go('/shop'),
            style: ElevatedButton.styleFrom(
              backgroundColor: GColors.brand,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 12),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14)),
            ),
            child: const Text('Browse Gifts'),
          ),
        ],
      ),
    );
  }
}

// ─── Order card (collapsible) ─────────────────────────────────────────────────
//
// Why this is a collapsible card now:
//   • Each old card was ~280px tall — three filled the whole screen, so the
//     "list of orders" never really looked like a list. Collapsing to a
//     compact header lets users see ~6 orders at once and tap the one they
//     want to inspect.
//   • Surface uses Theme-aware neutral (white in light mode, c.bg1 in dark)
//     instead of the brand-tinted pink. The brand color now lives ONLY in
//     the stage pill — Emil principle: brand color as accent, not surface.
//
// Default state: collapsed. Active orders (placed/crafting/packed/shipped)
// have a chevron hint; tap anywhere on the header to expand.

class _OrderCard extends StatefulWidget {
  final Map<String, dynamic> order;
  const _OrderCard({required this.order});

  @override
  State<_OrderCard> createState() => _OrderCardState();
}

class _OrderCardState extends State<_OrderCard>
    with SingleTickerProviderStateMixin {
  bool _expanded = false;
  bool _pressed  = false;

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final order = widget.order;

    final status = (order['status'] as String? ?? 'pending');
    final stageIdx = _stageIndex(status);
    final banner = _stageBanner(status, context);

    final orderNumber = order['orderNumber'] as String? ??
        order['id'] as String? ??
        '—';
    // Placed date+time for the header subline (so the user sees timestamp
    // without expanding). The API returns ISO strings for createdAt /
    // placedAt — fall back across the various keys our backends have used.
    final placedAtIso = (order['placedAt'] ?? order['createdAt']
        ?? order['created_at']) as String?;
    final placedDateTime = _formatDateTime(placedAtIso);
    final expectedDate = _formatDate(order['expectedDeliveryAt'] as String? ??
        order['expected_delivery'] as String?);
    final deliveredDate = _formatDate(order['deliveredAt'] as String? ??
        order['delivered_at'] as String?);

    final imgUrl = _firstImageUrl(order);
    final hasTimeline = stageIdx >= 0 && stageIdx < 4;

    // Neutral surface — brand-pink belongs on accent elements, not card fill.
    final cardSurface = isDark ? c.bg1 : Colors.white;

    return GestureDetector(
      onTapDown:   (_) => setState(() => _pressed = true),
      onTapUp:     (_) {
        setState(() {
          _pressed = false;
          _expanded = !_expanded;
        });
      },
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.99 : 1.0,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
          decoration: BoxDecoration(
            color: cardSurface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: c.border, width: 1),
            boxShadow: isDark
                ? []
                : [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.04),
                      blurRadius: 10,
                      offset: const Offset(0, 2),
                    ),
                  ],
          ),
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Header row (always visible) ─────────────────────────────
              Row(
                children: [
                  // Tiny product thumb stays in the header for visual anchor
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: SizedBox(
                      width: 44, height: 44,
                      child: imgUrl.isNotEmpty
                          ? GiftImage(src: imgUrl, fit: BoxFit.cover)
                          : Container(
                              color: c.bg2,
                              child: const Icon(Icons.card_giftcard_rounded,
                                  color: GColors.brand, size: 18),
                            ),
                    ),
                  ),
                  const Gap(12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Display number: `#001247` for sequential, `#GFT-…`
                        // for legacy random orders. Easier for the team to
                        // reference than the full random hash.
                        Text('Order ${_displayOrderNumber(orderNumber)}',
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.inter(
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                              color: c.text0,
                            )),
                        const Gap(2),
                        // Date + time on collapsed cards so the user sees
                        // the timestamp without having to expand. Falls
                        // back to delivered date for delivered orders.
                        Text(
                          stageIdx == 4 && deliveredDate.isNotEmpty
                              ? 'Delivered $deliveredDate'
                              : placedDateTime.isNotEmpty
                                  ? 'Placed $placedDateTime'
                                  : '',
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                            color: c.text2,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Gap(8),
                  // Stage pill — brand color lives here, not on the surface
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: banner.color.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      banner.label,
                      style: GoogleFonts.inter(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: banner.color,
                        letterSpacing: 0.1,
                      ),
                    ),
                  ),
                  const Gap(4),
                  // Chevron rotates 180° when expanded
                  AnimatedRotation(
                    duration: const Duration(milliseconds: 200),
                    turns: _expanded ? 0.5 : 0,
                    child: Icon(Icons.expand_more_rounded,
                        size: 20, color: c.text2),
                  ),
                ],
              ),

              // ── Expanded body (timeline + track button) ─────────────────
              AnimatedCrossFade(
                duration: const Duration(milliseconds: 220),
                sizeCurve: Curves.easeOut,
                firstCurve: Curves.easeOut,
                secondCurve: Curves.easeOut,
                crossFadeState: _expanded
                    ? CrossFadeState.showSecond
                    : CrossFadeState.showFirst,
                firstChild: const SizedBox(width: double.infinity),
                secondChild: Padding(
                  padding: const EdgeInsets.only(top: 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Tagline (only meaningful for active stages)
                      if (hasTimeline) ...[
                        Row(
                          children: [
                            Text(banner.emoji,
                                style: const TextStyle(fontSize: 14)),
                            const Gap(6),
                            Expanded(
                              child: Text(banner.tagline,
                                  style: GoogleFonts.inter(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                    color: c.text1,
                                  )),
                            ),
                          ],
                        ),
                        const Gap(12),
                        // Timeline strip
                        _Timeline(currentStage: stageIdx, brand: banner.color),
                        const Gap(14),
                      ],

                      // Expected delivery + Track button. The dash-fallback
                      // was confusing — if there's no expected date, hide
                      // the label entirely and let the Track button stand
                      // alone right-aligned.
                      Row(
                        children: [
                          if (expectedDate.isNotEmpty) ...[
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Expected Delivery',
                                      style: GoogleFonts.inter(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w500,
                                        color: c.text2,
                                      )),
                                  const Gap(2),
                                  Text(
                                    expectedDate,
                                    style: GoogleFonts.inter(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w800,
                                      color: c.text0,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ] else
                            const Spacer(),
                          _TrackButton(order: order, accent: banner.color),
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

// ─── Timeline (5 stops) ──────────────────────────────────────────────────────

class _Timeline extends StatelessWidget {
  final int currentStage; // 0..4
  final Color brand;
  const _Timeline({required this.currentStage, required this.brand});

  static const _labels = ['Placed', 'Crafting', 'Packed', 'Shipped', 'Delivered'];
  static const _icons = [
    Icons.shopping_bag_outlined,
    Icons.handyman_outlined,
    Icons.inventory_2_outlined,
    Icons.local_shipping_outlined,
    Icons.check_circle_outline,
  ];

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final dim = c.text2.withValues(alpha: 0.5);

    return Row(
      children: List.generate(_labels.length, (i) {
        final isDone = i <= currentStage;
        final isLast = i == _labels.length - 1;
        final node = Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: isDone ? brand : c.bg2,
                shape: BoxShape.circle,
                border: Border.all(
                  color: isDone ? brand : c.border,
                  width: 1.5,
                ),
              ),
              child: Icon(
                _icons[i],
                size: 14,
                color: isDone ? Colors.white : dim,
              ),
            ),
            const Gap(4),
            Text(
              _labels[i],
              style: GoogleFonts.inter(
                fontSize: 9,
                fontWeight: isDone ? FontWeight.w800 : FontWeight.w500,
                color: isDone ? c.text0 : c.text2,
              ),
            ),
          ],
        );

        return Expanded(
          child: Row(
            children: [
              node,
              if (!isLast)
                Expanded(
                  child: Container(
                    height: 2,
                    margin: const EdgeInsets.only(bottom: 16),
                    color: i < currentStage ? brand : c.border,
                  ),
                ),
            ],
          ),
        );
      }),
    );
  }
}

// ─── Track button ─────────────────────────────────────────────────────────────

class _TrackButton extends StatelessWidget {
  final Map<String, dynamic> order;
  final Color accent;
  const _TrackButton({required this.order, required this.accent});

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: () {
        final id = (order['id'] ?? order['_id'] ?? '').toString();
        if (id.isNotEmpty) {
          context.push('/orders/$id', extra: order);
        }
      },
      style: OutlinedButton.styleFrom(
        foregroundColor: accent,
        side: BorderSide(color: accent, width: 1.5),
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
      ),
      child: Text(
        'Track Order',
        style: GoogleFonts.inter(
            fontSize: 12, fontWeight: FontWeight.w800, color: accent),
      ),
    );
  }
}
