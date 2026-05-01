// ─── Post-purchase upsell rail ───────────────────────────────────────────────
//
// Shows "Customers also love…" on the order-success screen. Consumes the
// backend endpoint:
//
//   GET /api/orders/:id/recommendations?limit=8
//   → Product[] (same shape as /products list)
//
// Web mirrors this widget on the order detail page. Backend computes recs
// by unioning the order's item categories + excluding those same items.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shimmer/shimmer.dart';

import '../../../../core/analytics/analytics_service.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/gift_image.dart';

final _orderRecsProvider = FutureProvider.autoDispose
    .family<List<Map<String, dynamic>>, String>((ref, orderId) async {
  if (orderId.isEmpty) return [];
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/orders/$orderId/recommendations',
        queryParameters: {'limit': 8});
    final data = res.data;
    if (data is List) return List<Map<String, dynamic>>.from(data);
    if (data is Map) {
      return List<Map<String, dynamic>>.from(
          data['items'] ?? data['data'] ?? []);
    }
    return [];
  } catch (_) {
    return [];
  }
});

class PostPurchaseUpsell extends ConsumerWidget {
  final String orderId;
  const PostPurchaseUpsell({super.key, required this.orderId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (orderId.isEmpty) return const SizedBox.shrink();
    final async = ref.watch(_orderRecsProvider(orderId));

    return async.when(
      loading: () => _loading(context),
      error:   (_, __) => const SizedBox.shrink(),
      data:    (list) {
        if (list.isEmpty) return const SizedBox.shrink();
        return _content(context, list);
      },
    );
  }

  Widget _content(BuildContext context, List<Map<String, dynamic>> items) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(
            children: [
              const Text('💖', style: TextStyle(fontSize: 18)),
              const Gap(8),
              Text('People also love', style: GoogleFonts.inter(
                fontSize: 16, fontWeight: FontWeight.w800,
                color: GColors.of(context).text0,
                letterSpacing: -0.2,
              )),
            ],
          ),
        ),
        const Gap(12),
        SizedBox(
          height: 200,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: items.length,
            separatorBuilder: (_, __) => const Gap(10),
            itemBuilder: (_, i) {
              final p = items[i];
              return _UpsellCard(product: p, index: i);
            },
          ),
        ),
      ],
    ).animate(delay: 850.ms).fadeIn(duration: 500.ms).slideY(begin: 0.1, end: 0);
  }

  Widget _loading(BuildContext context) {
    final c = GColors.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Shimmer.fromColors(
        baseColor: c.bg1,
        highlightColor: c.border,
        child: Row(
          children: List.generate(3, (_) => Expanded(
            child: Padding(
              padding: const EdgeInsets.only(right: 10),
              child: Container(
                height: 200,
                decoration: BoxDecoration(
                  color: c.bg1,
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            ),
          )),
        ),
      ),
    );
  }
}

class _UpsellCard extends StatelessWidget {
  final Map<String, dynamic> product;
  final int index;
  const _UpsellCard({required this.product, required this.index});

  @override
  Widget build(BuildContext context) {
    final c     = GColors.of(context);
    final title = (product['title'] ?? product['name'] ?? 'Gift').toString();
    final slug  = (product['slug']  ?? '').toString();
    final price = product['basePrice'] ?? product['price'] ?? '';
    final imgs  = product['images'];
    dynamic firstImg;
    if (imgs is List && imgs.isNotEmpty) firstImg = imgs.first;

    return GestureDetector(
      onTap: () {
        if (slug.isEmpty) return;
        HapticFeedback.selectionClick();
        Analytics.track('post_purchase_upsell_tap', {
          'slug': slug,
          'position': index,
        });
        context.push('/shop/$slug');
      },
      child: Container(
        width: 140,
        decoration: BoxDecoration(
          color: c.bg1,
          borderRadius: BorderRadius.circular(16),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(
              aspectRatio: 1,
              child: firstImg != null
                  ? GiftImage(src: firstImg, fit: BoxFit.cover)
                  : Container(
                      color: c.bg2,
                      alignment: Alignment.center,
                      child: Icon(Icons.card_giftcard_outlined,
                          color: c.text2, size: 28),
                    ),
            ),
            Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                    maxLines: 2, overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(
                      fontSize: 12, fontWeight: FontWeight.w700,
                      color: c.text0, height: 1.25,
                    )),
                  const Gap(4),
                  if (price.toString().isNotEmpty)
                    Text('₹$price', style: GoogleFonts.inter(
                      fontSize: 13, fontWeight: FontWeight.w800,
                      color: c.text0,
                    )),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
