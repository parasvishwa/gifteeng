import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:gap/gap.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/widgets/gift_image.dart';

// ─── Helpers ──────────────────────────────────────────────────────────────────

double _amt(dynamic v) {
  if (v == null) return 0.0;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? 0.0;
}

// Statuses where the order is still editable/cancellable
const _editableStatuses  = {'pending', 'new_order', 'confirmed'};
// Statuses where delivery date can be requested
const _postponeStatuses  = {'new_order', 'confirmed', 'in_production'};

// Inline tracking sheet — replaces the old /orders/:id/track navigation,
// which had no matching route and dropped users on the error page.
Future<void> _showTrackSheet({
  required BuildContext context,
  required String status,
  String? trackingId,
  List shipments = const [],
}) {
  return showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (ctx) {
      String label;
      switch (status.toLowerCase()) {
        case 'new_order':     label = 'Order received — preparing your gift'; break;
        case 'confirmed':     label = 'Order confirmed — moving to production'; break;
        case 'in_production': label = 'Crafting your gift — almost ready'; break;
        case 'ready_to_ship': label = 'Packed and ready — courier pickup soon'; break;
        case 'shipped':       label = 'On the way — courier en route'; break;
        case 'delivered':     label = 'Delivered — enjoy! 🎁'; break;
        case 'cancelled':     label = 'Order cancelled'; break;
        case 'returned':      label = 'Order returned'; break;
        default:              label = 'Order status: $status';
      }
      return SafeArea(
        child: Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 36, height: 4,
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text('Tracking',
                style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              Text(label, style: GoogleFonts.inter(fontSize: 14)),
              if (trackingId != null && trackingId.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text('AWB: $trackingId',
                  style: GoogleFonts.inter(
                    fontSize: 12, fontWeight: FontWeight.w600)),
              ],
              if (shipments.isNotEmpty) ...[
                const SizedBox(height: 16),
                ...shipments.whereType<Map>().map((s) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    '${s['status'] ?? ''} — ${s['carrier'] ?? ''} ${s['trackingNumber'] ?? ''}',
                    style: GoogleFonts.inter(fontSize: 12),
                  ),
                )),
              ],
              const SizedBox(height: 16),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Close'),
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}

int _stepForStatus(String s) {
  switch (s.toLowerCase()) {
    case 'new_order':
    case 'pending':    return 0;
    case 'confirmed':  return 1;
    case 'in_production':
    case 'processing': return 2;
    case 'ready_to_ship':
    case 'shipped':
    case 'out_for_delivery': return 3;
    case 'delivered':  return 4;
    default:           return 0;
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

final _orderDetailProvider =
    FutureProvider.autoDispose.family<Map<String, dynamic>, String>(
        (ref, id) async {
  final dio   = ref.watch(dioProvider);
  // Backend exposes single B2C order at /orders/b2c/mine/:id (scoped to caller).
  // Hitting /orders/b2c/:id triggers the global :id catch-all which is guarded
  // by the B2B JWT and returns 404 for B2C tokens.
  final res   = await dio.get('/orders/b2c/mine/$id');
  final order = Map<String, dynamic>.from(res.data as Map);

  // Always fetch full product for every item (need slug + metadata for customizer).
  // Prefer slug-based lookup (more reliable); fall back to productId (UUID).
  final rawItems =
      (order['items'] ?? order['orderItems'] ?? order['products']) as List? ?? [];
  final needs = <int, String>{};  // index → slug-or-id to fetch
  for (var i = 0; i < rawItems.length; i++) {
    final item     = rawItems[i];
    if (item is! Map) continue;
    final snapshot = item['snapshot'] as Map?;
    final product  = item['product'];
    // Slug is more reliable than UUID for the /products/:slug endpoint
    final slugOrId = snapshot?['slug']?.toString()
        ?? (product is Map ? product['slug']?.toString() : null)
        ?? item['productSlug']?.toString()
        ?? item['productId']?.toString()
        ?? item['product_id']?.toString()
        ?? (product is Map ? product['id']?.toString() ?? product['_id']?.toString() : null);
    if (slugOrId != null && slugOrId.isNotEmpty) needs[i] = slugOrId;
  }
  if (needs.isNotEmpty) {
    await Future.wait(needs.entries.map((e) async {
      try {
        final r = await dio.get('/products/${e.value}');
        (rawItems[e.key] as Map)['product'] =
            Map<String, dynamic>.from(r.data as Map);
      } catch (_) {}
    }));
  }
  return order;
});

// ─── Screen ───────────────────────────────────────────────────────────────────

class OrderDetailScreen extends ConsumerStatefulWidget {
  final String orderId;
  final Map<String, dynamic> orderCache;

  const OrderDetailScreen({
    super.key,
    required this.orderId,
    this.orderCache = const {},
  });

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  bool _cancelling = false;
  bool _requestingDelivery = false;

  // ── Cancel order ────────────────────────────────────────────────────────────
  Future<void> _cancelOrder(String reason) async {
    setState(() => _cancelling = true);
    try {
      final dio = ref.read(dioProvider);
      await dio.post('/orders/b2c/mine/${widget.orderId}/cancel',
          data: {'reason': reason});
      ref.invalidate(_orderDetailProvider(widget.orderId));
      if (mounted) {
        _snack('Order cancelled successfully', isError: false);
      }
    } catch (_) {
      if (mounted) _snack('Could not cancel order. Try again.');
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  // ── Request delivery date ────────────────────────────────────────────────────
  Future<void> _requestDeliveryDate(DateTime date) async {
    setState(() => _requestingDelivery = true);
    try {
      final dio = ref.read(dioProvider);
      await dio.patch(
          '/orders/b2c/mine/${widget.orderId}/request-delivery-date',
          data: {'requestedDate': date.toIso8601String()});
      ref.invalidate(_orderDetailProvider(widget.orderId));
      if (mounted) _snack('Delivery date requested!', isError: false);
    } catch (_) {
      if (mounted) _snack('Could not update delivery date.');
    } finally {
      if (mounted) setState(() => _requestingDelivery = false);
    }
  }

  void _snack(String msg, {bool isError = true}) {
    final c = GColors.of(context);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg,
          style: GoogleFonts.inter(
              fontWeight: FontWeight.w500,
              color: isError ? Colors.white : Colors.white)),
      backgroundColor: isError ? GColors.rose : GColors.emerald,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ));
  }

  // ── Cancel modal ─────────────────────────────────────────────────────────────
  void _showCancelModal() {
    final reasons = [
      'Changed my mind',
      'Ordered by mistake',
      'Found a better price elsewhere',
      'Delivery time too long',
      'Other',
    ];
    String? selected;
    final textCtrl = TextEditingController();
    final c = GColors.of(context);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => StatefulBuilder(builder: (ctx, setModal) {
        final mc = GColors.of(ctx);
        return Container(
          margin: EdgeInsets.only(
              bottom: MediaQuery.of(ctx).viewInsets.bottom),
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
          decoration: BoxDecoration(
            color: mc.bg1,
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                        color: mc.border,
                        borderRadius: BorderRadius.circular(2))),
              ),
              const Gap(16),
              Text('Cancel Order',
                  style: GoogleFonts.inter(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: mc.text0)),
              const Gap(4),
              Text('Please tell us why you want to cancel',
                  style: GoogleFonts.inter(
                      fontSize: 13, color: mc.text1)),
              const Gap(16),
              ...reasons.map((r) => GestureDetector(
                    onTap: () => setModal(() => selected = r),
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        color: selected == r
                            ? mc.brandTint
                            : mc.bg2,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                            color: selected == r
                                ? GColors.brand.withValues(alpha: 0.4)
                                : mc.border),
                      ),
                      child: Row(children: [
                        Expanded(
                            child: Text(r,
                                style: GoogleFonts.inter(
                                    fontSize: 13,
                                    fontWeight: selected == r
                                        ? FontWeight.w700
                                        : FontWeight.w500,
                                    color: selected == r
                                        ? GColors.brand
                                        : mc.text0))),
                        if (selected == r)
                          const Icon(Icons.check_circle_rounded,
                              size: 16, color: GColors.brand),
                      ]),
                    ),
                  )),
              if (selected == 'Other') ...[
                const Gap(8),
                TextField(
                  controller: textCtrl,
                  maxLines: 2,
                  style: GoogleFonts.inter(
                      fontSize: 13, color: mc.text0),
                  decoration: InputDecoration(
                    hintText: 'Tell us more…',
                    hintStyle: GoogleFonts.inter(
                        fontSize: 13, color: mc.text2),
                    filled: true,
                    fillColor: mc.bg2,
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: mc.border)),
                    enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: mc.border)),
                    focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(
                            color: GColors.brand, width: 1.5)),
                    contentPadding:
                        const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                  ),
                ),
                const Gap(8),
              ],
              const Gap(8),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: selected == null
                      ? null
                      : () {
                          Navigator.pop(ctx);
                          final reason = selected == 'Other'
                              ? (textCtrl.text.trim().isNotEmpty
                                  ? textCtrl.text.trim()
                                  : 'Other')
                              : selected!;
                          _cancelOrder(reason);
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: GColors.rose,
                    foregroundColor: Colors.white,
                    minimumSize: const Size.fromHeight(48),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  child: Text('Cancel Order',
                      style: GoogleFonts.inter(
                          fontWeight: FontWeight.w700)),
                ),
              ),
            ],
          ),
        );
      }),
    );
  }

  // ── Delivery date modal ──────────────────────────────────────────────────────
  Future<void> _showDeliveryDateModal() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 3)),
      firstDate: now.add(const Duration(days: 1)),
      lastDate: now.add(const Duration(days: 60)),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx),
        child: child!,
      ),
    );
    if (picked != null) _requestDeliveryDate(picked);
  }

  @override
  Widget build(BuildContext context) {
    final c          = GColors.of(context);
    final orderAsync = ref.watch(_orderDetailProvider(widget.orderId));

    return Scaffold(
      backgroundColor: c.bg0,
      appBar: AppBar(
        backgroundColor: c.bg0,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded,
              size: 18, color: c.text0),
          onPressed: () => context.pop(),
        ),
        title: Text('Order Details',
            style: GoogleFonts.inter(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: c.text0)),
        actions: [
          IconButton(
            icon: Icon(Icons.headset_mic_outlined,
                size: 20, color: c.text1),
            tooltip: 'Help',
            onPressed: () => context.push('/help'),
          ),
        ],
      ),
      body: orderAsync.when(
        loading: () => _buildBody(context,
            widget.orderCache.isNotEmpty ? widget.orderCache : null,
            isLoading: true),
        error: (_, __) => widget.orderCache.isNotEmpty
            ? _buildBody(context, widget.orderCache)
            : _ErrorView(
                onRetry: () => ref
                    .invalidate(_orderDetailProvider(widget.orderId))),
        data: (order) => _buildBody(context, order),
      ),
    );
  }

  Widget _buildBody(BuildContext context, Map<String, dynamic>? order,
      {bool isLoading = false}) {
    final c = GColors.of(context);
    if (order == null) {
      return Center(
        child: CircularProgressIndicator(
            color: GColors.brand, strokeWidth: 2),
      );
    }

    // ── Parse fields ──────────────────────────────────────────────────────────
    final orderNumber = order['orderNumber'] as String? ??
        order['number'] as String? ??
        order['id'] as String? ??
        '—';
    final status      = (order['status'] as String? ?? 'pending').toLowerCase();
    final createdAt   = order['createdAt'] as String? ??
        order['created_at'] as String?;
    final total       = _amt(order['grandTotal'] ?? order['total'] ??
        order['totalAmount'] ?? order['amount'] ?? order['totalLabel']);
    final subtotal    = _amt(order['subtotal']);
    final discountTotal = _amt(order['discountTotal']);
    final shippingTotal = _amt(order['shippingTotal']);
    final taxTotal    = _amt(order['taxTotal']);
    final hasBreakdown = subtotal > 0 || shippingTotal > 0 ||
        discountTotal > 0 || taxTotal > 0;
    final paymentMethod  = order['paymentMethod'] as String?;
    final paymentStatus  = (order['paymentStatus'] as String? ??
        order['payment_status'] as String? ?? '').toLowerCase();
    final items       = (order['items'] as List?) ??
        (order['orderItems'] as List?) ??
        [];
    final address     = order['shippingAddress'] as Map? ??
        order['deliveryAddress'] as Map? ??
        order['address'] as Map?;
    final billingAddr = order['billingAddress'] as Map?;
    final shipments   = (order['shipments'] as List?) ?? [];
    final tracking    = order['tracking'] as Map?;
    final trackingId  = tracking?['id'] as String? ??
        order['trackingId'] as String?;
    final trackingUrl = tracking?['url'] as String?;
    final requestedDate =
        (order['metadata'] as Map?)?['requestedDeliveryDate'] as String?;

    final canCancel   = _editableStatuses.contains(status);
    final canPostpone = _postponeStatuses.contains(status);
    final isCancelled = status == 'cancelled';
    final stepIndex   = isCancelled ? -1 : _stepForStatus(status);

    final date = createdAt != null
        ? DateFormat('d MMM yyyy, h:mm a').format(
            DateTime.tryParse(createdAt)?.toLocal() ?? DateTime.now())
        : '';

    final children = <Widget>[
      // ── 1. Header card ─────────────────────────────────────────────────────
      _Card(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('#$orderNumber',
                    style: GoogleFonts.inter(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                        color: c.text0,
                        letterSpacing: 0.3)),
                if (date.isNotEmpty) ...[
                  const Gap(3),
                  Text(date,
                      style: GoogleFonts.inter(
                          fontSize: 12, color: c.text2)),
                ],
              ]),
            ),
            _StatusBadge(status: status),
          ]),
          const Gap(14),
          Divider(color: c.border, height: 1),
          const Gap(14),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Order Total',
                  style: GoogleFonts.inter(
                      fontSize: 13, color: c.text1)),
              Text('₹${total.round()}',
                  style: GoogleFonts.inter(
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      color: c.text0)),
            ],
          ),
        ]),
      ).animate().fadeIn(duration: 350.ms).slideY(begin: 0.04, end: 0),

      const Gap(12),

      // ── 2. Progress stepper ────────────────────────────────────────────────
      if (!isCancelled)
        _Card(
          child: _ProgressStepper(currentStep: stepIndex, c: c),
        ).animate(delay: 50.ms).fadeIn(duration: 350.ms),

      if (isCancelled)
        _Card(
          child: Row(children: [
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: GColors.rose.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.cancel_outlined,
                    size: 16, color: GColors.rose),
                const Gap(6),
                Text('Order Cancelled',
                    style: GoogleFonts.inter(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: GColors.rose)),
              ]),
            ),
          ]),
        ).animate(delay: 50.ms).fadeIn(duration: 350.ms),

      const Gap(12),

      // ── 3. Action buttons ──────────────────────────────────────────────────
      // Cancelled / returned orders have no live shipment, so Track Order
      // would 404 — collapse the action row to "Get Help" instead.
      Row(children: [
        if (status != 'cancelled' && status != 'returned')
          Expanded(
            child: _ActionBtn(
              icon: Icons.local_shipping_outlined,
              label: 'Track Order',
              onTap: () async {
                // Prefer the carrier's URL if backend has stored one;
                // otherwise show an inline status sheet built from the order
                // data we already have (no separate /track screen needed).
                final url = trackingUrl;
                if (url != null && url.isNotEmpty) {
                  final uri = Uri.tryParse(url);
                  if (uri != null && await canLaunchUrl(uri)) {
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                    return;
                  }
                }
                if (!context.mounted) return;
                _showTrackSheet(
                  context: context,
                  status: status,
                  trackingId: trackingId,
                  shipments: shipments,
                );
              },
              c: c,
            ),
          ),
        if (status != 'cancelled' && status != 'returned') const Gap(8),
        // Cancel (conditional)
        if (canCancel) ...[
          Expanded(
            child: _ActionBtn(
              icon: Icons.cancel_outlined,
              label: _cancelling ? '…' : 'Cancel',
              color: GColors.rose,
              onTap: _cancelling ? null : _showCancelModal,
              c: c,
            ),
          ),
          const Gap(8),
        ],
        // Request later delivery (conditional)
        if (canPostpone)
          Expanded(
            child: _ActionBtn(
              icon: Icons.event_outlined,
              label: _requestingDelivery ? '…' : 'Change Date',
              onTap: _requestingDelivery ? null : _showDeliveryDateModal,
              c: c,
            ),
          ),
        if (!canCancel && !canPostpone)
          Expanded(
            child: _ActionBtn(
              icon: Icons.headset_mic_outlined,
              label: 'Get Help',
              onTap: () => context.push('/help'),
              c: c,
            ),
          ),
      ]).animate(delay: 100.ms).fadeIn(duration: 350.ms),

      // Requested delivery date chip — hidden once the order is cancelled
      // or returned since the date no longer applies.
      if (requestedDate != null &&
          status != 'cancelled' &&
          status != 'returned') ...[
        const Gap(8),
        Container(
          padding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: GColors.sky.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
                color: GColors.sky.withValues(alpha: 0.3)),
          ),
          child: Row(children: [
            const Icon(Icons.event_available_rounded,
                size: 14, color: GColors.sky),
            const Gap(8),
            Expanded(
              child: Text(
                'Requested delivery: ${DateFormat('d MMM yyyy').format(DateTime.tryParse(requestedDate)?.toLocal() ?? DateTime.now())}',
                style: GoogleFonts.inter(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: GColors.sky),
              ),
            ),
          ]),
        ),
      ],

      const Gap(12),

      // ── 4. Items ───────────────────────────────────────────────────────────
      if (items.isNotEmpty)
        _Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Items (${items.length})',
                  style: GoogleFonts.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: c.text0)),
              const Gap(12),
              ...items.asMap().entries.map((e) {
                final i        = e.key;
                final item     = e.value as Map;
                final snapshot = (item['snapshot'] as Map?) ?? const {};
                final product  = (item['product'] as Map?) ??
                    (item['productData'] as Map?) ??
                    const {};

                final name = (snapshot['title'] ??
                        snapshot['name'] ??
                        item['productTitle'] ??
                        item['productName'] ??
                        item['name'] ??
                        item['title'] ??
                        product['title'] ??
                        product['name'] ??
                        'Gift')
                    .toString();

                final qty = (item['qty'] ?? item['quantity'] ?? 1) as num;
                final price = _amt(item['price'] ??
                    item['unitPrice'] ??
                    item['salePrice'] ??
                    product['basePrice'] ??
                    product['price']);

                // Images — raw entry (Map or String), GiftImage resolves it
                final snapImgs = snapshot['images'] as List?;
                final prodImgs = product['images'] as List?;
                final itemImgs = item['images'] as List?;
                final imgs     = snapImgs ?? prodImgs ?? itemImgs;
                final imgSrc   = (imgs != null && imgs.isNotEmpty)
                    ? imgs.first
                    : (snapshot['imageUrl'] ??
                        snapshot['thumbnail'] ??
                        product['imageUrl'] ??
                        product['thumbnail'] ??
                        item['imageUrl']);

                final slug = (product['slug'] ??
                        snapshot['slug'] ??
                        item['productSlug'] ??
                        '')
                    .toString();

                final customization = item['customization'];
                final hasCustom =
                    customization != null && slug.isNotEmpty && canCancel;

                return Padding(
                  padding: EdgeInsets.only(
                      top: i == 0 ? 0 : 12,
                      bottom: i == items.length - 1 ? 0 : 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: slug.isNotEmpty
                            ? () => context.push('/shop/$slug')
                            : null,
                        child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: GiftImage(
                                src: imgSrc, width: 64, height: 64),
                          ),
                          const Gap(12),
                          Expanded(
                              child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(name,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: GoogleFonts.inter(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                      color: c.text0,
                                      height: 1.4)),
                              const Gap(4),
                              Row(children: [
                                Text('Qty: ${qty.toInt()}',
                                    style: GoogleFonts.inter(
                                        fontSize: 11, color: c.text2)),
                                if (price > 0) ...[
                                  const Gap(6),
                                  Text('·',
                                      style: GoogleFonts.inter(
                                          fontSize: 11, color: c.text2)),
                                  const Gap(6),
                                  Text(
                                      '₹${(price * qty).round()}',
                                      style: GoogleFonts.inter(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w700,
                                          color: GColors.brand)),
                                ],
                              ]),
                            ],
                          )),
                          if (slug.isNotEmpty)
                            Icon(Icons.chevron_right_rounded,
                                size: 16, color: c.text2),
                        ]),
                      ),
                      if (hasCustom) ...[
                        const Gap(8),
                        GestureDetector(
                          onTap: () {
                            // Use top-level /customize (not /shop/:slug/customize)
                            // so it works correctly from outside the shell navigator.
                            context.push('/customize',
                                extra: <String, dynamic>{
                              ...Map<String, dynamic>.from(
                                  product.isNotEmpty
                                      ? product
                                      : snapshot),
                              '__existingCustomization': customization,
                            });
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 7),
                            decoration: BoxDecoration(
                              color: c.brandTint,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                  color: GColors.brand
                                      .withValues(alpha: 0.3)),
                            ),
                            child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                              const Icon(Icons.edit_outlined,
                                  size: 13, color: GColors.brand),
                              const Gap(5),
                              Text('Edit design',
                                  style: GoogleFonts.inter(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: GColors.brand)),
                            ]),
                          ),
                        ),
                      ],
                      if (i < items.length - 1)
                        Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Divider(height: 1, color: c.border),
                        ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ).animate(delay: 150.ms).fadeIn(duration: 350.ms),

      if (items.isNotEmpty) const Gap(12),

      // ── 5. Price Summary ───────────────────────────────────────────────────
      if (hasBreakdown)
        _Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Price Summary',
                  style: GoogleFonts.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: c.text0)),
              const Gap(12),
              if (subtotal > 0)
                _PriceRow(
                    label: 'Subtotal',
                    value: '₹${subtotal.round()}',
                    c: c),
              if (shippingTotal == 0 && subtotal > 0)
                _PriceRow(
                    label: 'Shipping',
                    value: 'Free',
                    valueColor: GColors.emerald,
                    c: c),
              if (shippingTotal > 0)
                _PriceRow(
                    label: 'Shipping',
                    value: '₹${shippingTotal.round()}',
                    c: c),
              if (discountTotal > 0)
                _PriceRow(
                    label: 'Discount',
                    value: '−₹${discountTotal.round()}',
                    valueColor: GColors.emerald,
                    c: c),
              if (taxTotal > 0)
                _PriceRow(
                    label: 'GST',
                    value: '₹${taxTotal.round()}',
                    c: c),
              Divider(color: c.border, height: 20),
              _PriceRow(
                  label: 'Total',
                  value: '₹${total.round()}',
                  bold: true,
                  c: c),
            ],
          ),
        ).animate(delay: 200.ms).fadeIn(duration: 350.ms),

      if (hasBreakdown) const Gap(12),

      // ── 6. Payment ─────────────────────────────────────────────────────────
      if (paymentMethod != null)
        _Card(
          child: Row(children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: c.bg2,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                paymentMethod.toLowerCase() == 'cod'
                    ? Icons.money_outlined
                    : Icons.payment_outlined,
                size: 20,
                color: c.text1,
              ),
            ),
            const Gap(12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Payment',
                      style: GoogleFonts.inter(
                          fontSize: 11, color: c.text2)),
                  const Gap(2),
                  Text(_paymentLabel(paymentMethod),
                      style: GoogleFonts.inter(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: c.text0)),
                ],
              ),
            ),
            if (paymentStatus.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: (paymentStatus == 'paid'
                          ? GColors.emerald
                          : GColors.gold)
                      .withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  paymentStatus == 'paid'
                      ? '✓ Paid'
                      : _capitalize(
                          paymentStatus.replaceAll('_', ' ')),
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: paymentStatus == 'paid'
                        ? GColors.emerald
                        : GColors.gold,
                  ),
                ),
              ),
          ]),
        ).animate(delay: 220.ms).fadeIn(duration: 350.ms),

      if (paymentMethod != null) const Gap(12),

      // ── 7. Shipping address ────────────────────────────────────────────────
      if (address != null && address.isNotEmpty)
        _Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                const Text('📍', style: TextStyle(fontSize: 15)),
                const Gap(8),
                Text('Shipping Address',
                    style: GoogleFonts.inter(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: c.text0)),
              ]),
              const Gap(10),
              Text(
                _formatAddress(address),
                style: GoogleFonts.inter(
                    fontSize: 13, color: c.text1, height: 1.5),
              ),
              if (address['phone'] != null) ...[
                const Gap(4),
                Text(address['phone'].toString(),
                    style: GoogleFonts.inter(
                        fontSize: 12,
                        color: c.text2,
                        fontWeight: FontWeight.w500)),
              ],
            ],
          ),
        ).animate(delay: 240.ms).fadeIn(duration: 350.ms),

      if (address != null && address.isNotEmpty) const Gap(12),

      // ── 8. Billing address ─────────────────────────────────────────────────
      if (billingAddr != null && billingAddr.isNotEmpty)
        _Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                const Text('🧾', style: TextStyle(fontSize: 15)),
                const Gap(8),
                Text('Billing Address',
                    style: GoogleFonts.inter(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: c.text0)),
              ]),
              const Gap(10),
              Text(
                _formatAddress(billingAddr),
                style: GoogleFonts.inter(
                    fontSize: 13, color: c.text1, height: 1.5),
              ),
              if (billingAddr['phone'] != null) ...[
                const Gap(4),
                Text(billingAddr['phone'].toString(),
                    style: GoogleFonts.inter(
                        fontSize: 12,
                        color: c.text2,
                        fontWeight: FontWeight.w500)),
              ],
            ],
          ),
        ).animate(delay: 260.ms).fadeIn(duration: 350.ms),

      if (billingAddr != null && billingAddr.isNotEmpty) const Gap(12),

      // ── 9. Shipments / tracking ────────────────────────────────────────────
      if (shipments.isNotEmpty)
        ...shipments.asMap().entries.map((e) {
          final s       = e.value as Map;
          // Field names from the API schema
          final carrier = s['courier']?.toString() ??
              s['provider']?.toString() ??
              s['carrier']?.toString() ??
              'Tracking';
          final awb     = s['awb']?.toString() ??
              s['trackingNumber']?.toString();
          final shipUrl = s['trackingUrl']?.toString();
          return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _Card(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Row(children: [
                    const Text('🚚', style: TextStyle(fontSize: 15)),
                    const Gap(8),
                    Text(carrier,
                      style: GoogleFonts.inter(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: c.text0),
                    ),
                  ]),
                  const Gap(10),
                  Row(children: [
                    Expanded(
                      child: Text(
                        awb ?? 'Tracking ID pending',
                        style: GoogleFonts.inter(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: c.text1),
                      ),
                    ),
                    if (awb != null)
                      GestureDetector(
                        onTap: () => Clipboard.setData(
                            ClipboardData(text: awb)),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: c.bg2,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text('Copy',
                              style: GoogleFonts.inter(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: c.text1)),
                        ),
                      ),
                  ]),
                  if (shipUrl != null) ...[
                    const Gap(10),
                    GestureDetector(
                      onTap: () => launchUrl(
                          Uri.parse(shipUrl),
                          mode: LaunchMode.externalApplication),
                      child: Container(
                        width: double.infinity,
                        padding:
                            const EdgeInsets.symmetric(vertical: 11),
                        decoration: BoxDecoration(
                          color:
                              GColors.brand.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                              color: GColors.brand
                                  .withValues(alpha: 0.2)),
                        ),
                        child: Center(
                          child: Text(
                              'Track on courier website →',
                              style: GoogleFonts.inter(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: GColors.brand)),
                        ),
                      ),
                    ),
                  ],
                ]),
              ).animate(delay: 270.ms).fadeIn(duration: 350.ms),
            );
        }),

      // Fallback single tracking (old API format)
      if (shipments.isEmpty && (trackingId != null || trackingUrl != null))
        _Card(
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
            Row(children: [
              const Text('🚚', style: TextStyle(fontSize: 15)),
              const Gap(8),
              Text('Tracking',
                  style: GoogleFonts.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: c.text0)),
            ]),
            if (trackingId != null) ...[
              const Gap(10),
              Row(children: [
                Expanded(
                  child: Text(trackingId,
                      style: GoogleFonts.inter(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: c.text1)),
                ),
                GestureDetector(
                  onTap: () => Clipboard.setData(
                      ClipboardData(text: trackingId)),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: c.bg2,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text('Copy',
                        style: GoogleFonts.inter(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: c.text1)),
                  ),
                ),
              ]),
            ],
            if (trackingUrl != null) ...[
              const Gap(10),
              GestureDetector(
                onTap: () => launchUrl(Uri.parse(trackingUrl),
                    mode: LaunchMode.externalApplication),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 11),
                  decoration: BoxDecoration(
                    color: GColors.brand.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                        color: GColors.brand.withValues(alpha: 0.2)),
                  ),
                  child: Center(
                    child: Text('Track on courier website →',
                        style: GoogleFonts.inter(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: GColors.brand)),
                  ),
                ),
              ),
            ],
          ]),
        ).animate(delay: 270.ms).fadeIn(duration: 350.ms),

      if (shipments.isNotEmpty ||
          trackingId != null ||
          trackingUrl != null)
        const Gap(12),

      // ── 10. Help CTA ──────────────────────────────────────────────────────
      GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          context.push('/help');
        },
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: c.bg1,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: c.border),
          ),
          child: Row(children: [
            const Text('🎧', style: TextStyle(fontSize: 22)),
            const Gap(12),
            Expanded(
                child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Need help with this order?',
                    style: GoogleFonts.inter(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: c.text0)),
                const Gap(2),
                Text('Contact support',
                    style: GoogleFonts.inter(
                        fontSize: 12,
                        color: GColors.brand,
                        fontWeight: FontWeight.w600)),
              ],
            )),
            Icon(Icons.chevron_right_rounded,
                size: 18, color: c.text2),
          ]),
        ),
      ).animate(delay: 300.ms).fadeIn(duration: 350.ms),

      const Gap(32),
    ];

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      children: children,
    );
  }

  String _paymentLabel(String method) {
    switch (method.toLowerCase()) {
      case 'cod':       return 'Cash on Delivery';
      case 'razorpay':  return 'Online Payment';
      case 'wallet':    return 'Gifteeng Wallet';
      default:          return _capitalize(method.replaceAll('_', ' '));
    }
  }

  String _capitalize(String s) =>
      s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';

  String _formatAddress(Map addr) {
    return [
      addr['fullName'],
      addr['line1'],
      addr['line2'],
      addr['city'],
      addr['state'],
      addr['pincode'],
      addr['country'] ?? 'India',
    ].where((s) => s != null && s.toString().isNotEmpty).join(', ');
  }
}

// ─── Progress Stepper ─────────────────────────────────────────────────────────

class _ProgressStepper extends StatelessWidget {
  final int currentStep;
  final GColorsPalette c;

  const _ProgressStepper({required this.currentStep, required this.c});

  static const _steps = [
    ('📦', 'Ordered'),
    ('✅', 'Confirmed'),
    ('🏭', 'In Production'),
    ('🚚', 'Shipped'),
    ('🎉', 'Delivered'),
  ];

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      // Step dots + connecting lines
      Row(
        children: List.generate(_steps.length * 2 - 1, (i) {
          if (i.isOdd) {
            // Connecting line
            final stepIdx = i ~/ 2;
            final filled  = stepIdx < currentStep;
            return Expanded(
              child: Container(
                height: 2,
                color: filled ? GColors.brand : c.border,
              ),
            );
          }
          final idx   = i ~/ 2;
          final done  = idx < currentStep;
          final active= idx == currentStep;
          return Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: done
                  ? GColors.brand
                  : active
                      ? GColors.brand.withValues(alpha: 0.15)
                      : c.bg2,
              border: Border.all(
                color: (done || active) ? GColors.brand : c.border,
                width: active ? 2 : 1,
              ),
            ),
            child: Center(
              child: done
                  ? const Icon(Icons.check_rounded,
                      size: 14, color: Colors.white)
                  : Text(_steps[idx].$1,
                      style: const TextStyle(fontSize: 13)),
            ),
          );
        }),
      ),
      const Gap(8),
      // Labels
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: List.generate(_steps.length, (idx) {
          final done   = idx < currentStep;
          final active = idx == currentStep;
          return SizedBox(
            width: 52,
            child: Text(
              _steps[idx].$2,
              textAlign: TextAlign.center,
              maxLines: 2,
              style: GoogleFonts.inter(
                fontSize: 9,
                fontWeight:
                    active ? FontWeight.w700 : FontWeight.w500,
                color: done || active ? GColors.brand : c.text2,
                height: 1.3,
              ),
            ),
          );
        }),
      ),
    ]);
  }
}

// ─── Action button ────────────────────────────────────────────────────────────

class _ActionBtn extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final Color? color;
  final GColorsPalette c;

  const _ActionBtn({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.c,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final col = color ?? c.text0;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding:
            const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
        decoration: BoxDecoration(
          color: c.bg1,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: c.border),
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 20, color: col),
          const Gap(4),
          Text(label,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.inter(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: col)),
        ]),
      ),
    );
  }
}

// ─── Price row ────────────────────────────────────────────────────────────────

class _PriceRow extends StatelessWidget {
  final String label, value;
  final bool bold;
  final Color? valueColor;
  final GColorsPalette c;

  const _PriceRow({
    required this.label,
    required this.value,
    required this.c,
    this.bold = false,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label,
                style: GoogleFonts.inter(
                    fontSize: 13,
                    color: bold ? c.text0 : c.text1,
                    fontWeight: bold
                        ? FontWeight.w800
                        : FontWeight.w500)),
            Text(value,
                style: GoogleFonts.inter(
                    fontSize: bold ? 16 : 13,
                    fontWeight: bold
                        ? FontWeight.w900
                        : FontWeight.w600,
                    color:
                        valueColor ?? (bold ? c.text0 : c.text1))),
          ],
        ),
      );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

class _Card extends StatelessWidget {
  final Widget child;
  const _Card({required this.child});

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: c.bg1,
        borderRadius: BorderRadius.circular(16),
      ),
      child: child,
    );
  }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    final (label, bg, fg) = switch (status.toLowerCase()) {
      'delivered'         => ('Delivered',    const Color(0xFF166534), const Color(0xFF4ADE80)),
      'shipped' ||
      'out_for_delivery'  => ('Shipped',      const Color(0xFF1E3A5F), const Color(0xFF60A5FA)),
      'in_production' ||
      'processing'        => ('In Production',const Color(0xFF3B2800), const Color(0xFFFBBF24)),
      'confirmed'         => ('Confirmed',    const Color(0xFF14532D), const Color(0xFF86EFAC)),
      'cancelled'         => ('Cancelled',    const Color(0xFF450A0A), const Color(0xFFF87171)),
      'new_order'         => ('New Order',    const Color(0xFF1E1B4B), const Color(0xFFA5B4FC)),
      _                   => ('Pending',      const Color(0xFF1C1917), const Color(0xFFD6D3D1)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
          color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(label,
          style: GoogleFonts.inter(
              fontSize: 11, fontWeight: FontWeight.w700, color: fg)),
    );
  }
}

// ─── Error view ───────────────────────────────────────────────────────────────

class _ErrorView extends StatelessWidget {
  final VoidCallback onRetry;
  const _ErrorView({required this.onRetry});

  @override
  Widget build(BuildContext context) => Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('😕', style: TextStyle(fontSize: 48)),
          const Gap(12),
          Text('Could not load order',
              style: GoogleFonts.inter(color: GColors.text1)),
          const Gap(12),
          TextButton(
              onPressed: onRetry,
              child: Text('Retry',
                  style: GoogleFonts.inter(color: GColors.brand))),
        ]),
      );
}
