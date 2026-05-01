import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:gap/gap.dart';
import 'package:intl/intl.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/api/api_client.dart';

// ─── Provider ─────────────────────────────────────────────────────────────────

final _ordersProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get('/orders/b2c/mine', queryParameters: {'pageSize': 100});
  final data = res.data;
  if (data is List) return List<Map<String, dynamic>>.from(data);
  if (data is Map) return List<Map<String, dynamic>>.from(data['items'] ?? data['orders'] ?? []);
  return [];
});

// ─── Screen ───────────────────────────────────────────────────────────────────

class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = GColors.of(context);
    final ordersAsync = ref.watch(_ordersProvider);

    return Scaffold(
      backgroundColor: c.bg0,
      appBar: AppBar(
        backgroundColor: c.bg0,
        title: Text('My Orders', style: GoogleFonts.inter(
          fontSize: 22, fontWeight: FontWeight.w900, color: c.text0,
        )),
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: c.text0),
          onPressed: () => context.pop(),
        ),
      ),
      body: ordersAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: GColors.brand)),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('😕', style: TextStyle(fontSize: 48)),
              const Gap(12),
              Text('Could not load orders', style: GoogleFonts.inter(color: GColors.text1)),
              const Gap(12),
              TextButton(
                onPressed: () => ref.invalidate(_ordersProvider),
                child: Text('Retry', style: GoogleFonts.inter(color: GColors.brand)),
              ),
            ],
          ),
        ),
        data: (orders) {
          if (orders.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('📦', style: TextStyle(fontSize: 64)),
                  const Gap(16),
                  Text('No orders yet', style: GoogleFonts.inter(
                    fontSize: 18, fontWeight: FontWeight.w700, color: GColors.text0,
                  )),
                  const Gap(8),
                  Text('Your orders will appear here', style: GoogleFonts.inter(
                    fontSize: 14, color: GColors.text1,
                  )),
                  const Gap(24),
                  ElevatedButton(
                    onPressed: () => context.go('/shop'),
                    child: const Text('Browse Gifts'),
                  ),
                ],
              ),
            );
          }
          return RefreshIndicator(
            color: GColors.brand,
            onRefresh: () async {
              ref.invalidate(_ordersProvider);
              await ref.read(_ordersProvider.future);
            },
            child: ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              separatorBuilder: (_, __) => const Gap(12),
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/// Safely coerces any numeric-ish API value (num, String, null) to double.
double _parseAmount(dynamic v) {
  if (v == null) return 0.0;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? 0.0;
}

// ─── Order card ───────────────────────────────────────────────────────────────

class _OrderCard extends StatelessWidget {
  final Map<String, dynamic> order;
  const _OrderCard({required this.order});

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final orderNumber = order['orderNumber'] as String?
        ?? order['id'] as String?
        ?? '—';
    final status = order['status'] as String? ?? 'pending';
    // grandTotal is the canonical field (Decimal → serialized as string)
    final total  = _parseAmount(
        order['grandTotal'] ?? order['total'] ?? order['totalAmount'] ??
        order['amount'] ?? order['finalAmount']);
    final createdAt   = order['createdAt']  as String?
        ?? order['created_at'] as String?;
    final items       = (order['items'] as List?)
        ?? (order['orderItems'] as List?)
        ?? [];
    final itemCount   = items.length;

    final date = createdAt != null
        ? _formatDate(createdAt)
        : '';

    return GestureDetector(
      onTap: () {
        final id = (order['id'] ?? order['_id'] ?? '').toString();
        if (id.isNotEmpty) context.push('/orders/$id', extra: order);
      },
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: c.bg1,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header row ────────────────────────────────────────────────
            Row(
              children: [
                Text('#$orderNumber', style: GoogleFonts.inter(
                  fontSize: 15, fontWeight: FontWeight.w800, color: c.text0,
                )),
                const Spacer(),
                _StatusBadge(status: status),
              ],
            ),
            const Gap(8),

            // ── Item summary ─────────────────────────────────────────────
            if (itemCount > 0) ...[
              Text(
                itemCount == 1 ? '1 item' : '$itemCount items',
                style: GoogleFonts.inter(fontSize: 13, color: c.text1),
              ),
              const Gap(4),
            ],

            // ── Item names ────────────────────────────────────────────────
            // Name lives in item.snapshot.title (product snapshot at order time).
            // Fallback chain covers older orders and any API shape variations.
            ...items.take(2).map((item) {
              final m        = item as Map;
              final snapshot = (m['snapshot'] as Map?) ?? const {};
              final product  = (m['product']  as Map?) ?? const {};
              final name = (snapshot['title']
                  ?? snapshot['name']
                  ?? m['productTitle']
                  ?? m['productName']
                  ?? m['name']
                  ?? m['title']
                  ?? product['title']
                  ?? product['name']
                  ?? 'Gift').toString();
              return Padding(
                padding: const EdgeInsets.only(bottom: 2),
                child: Row(
                  children: [
                    Text('•  ', style: TextStyle(color: c.text2, fontSize: 12)),
                    Expanded(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.inter(fontSize: 12, color: c.text1))),
                  ],
                ),
              );
            }),
            if (itemCount > 2)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text('+${itemCount - 2} more', style: GoogleFonts.inter(
                  fontSize: 11, color: c.text2,
                )),
              ),

            const Gap(12),
            Divider(color: c.border, height: 1),
            const Gap(12),

            // ── Footer ───────────────────────────────────────────────────
            Row(
              children: [
                if (date.isNotEmpty)
                  Text(date, style: GoogleFonts.inter(
                    fontSize: 12, color: c.text2,
                  )),
                const Spacer(),
                // Use round() to match web display (avoids ₹1 off-by-one from Decimal truncation)
                Text('₹${total.round()}', style: GoogleFonts.inter(
                  fontSize: 17, fontWeight: FontWeight.w800, color: c.text0,
                )),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      return DateFormat('d MMM yyyy').format(dt);
    } catch (_) {
      return '';
    }
  }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

class _StatusBadge extends StatelessWidget {
  final String status;
  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (status.toLowerCase()) {
      'pending'    => (GColors.text1,   'Pending'),
      'confirmed'  => (GColors.emerald, 'Confirmed'),
      'processing' => (GColors.sky,     'Processing'),
      'shipped'    => (GColors.sky,     'Shipped'),
      'delivered'  => (GColors.emerald, 'Delivered'),
      'cancelled'  => (GColors.rose,    'Cancelled'),
      'refunded'   => (GColors.rose,    'Refunded'),
      _            => (GColors.text2,   status),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(label, style: GoogleFonts.inter(
        fontSize: 11, fontWeight: FontWeight.w700, color: color,
      )),
    );
  }
}
