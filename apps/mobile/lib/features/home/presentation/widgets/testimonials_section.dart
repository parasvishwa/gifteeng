import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/gift_image.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Testimonials — admin-driven, shared with web
//
// Endpoint (standard REST, when admin ships it):
//   GET /testimonials?status=approved&pageSize=10[&featured=true]
//
// Expected item shape (web + app consume the same):
//   {
//     "id": "...",
//     "name": "Priya Sharma",
//     "avatar": "https://...",              // optional — falls back to initial
//     "rating": 5,
//     "text": "The personalised cake topper was stunning...",
//     "productId":    "optional",
//     "productTitle": "Custom Acrylic Cake Topper",
//     "productImage": "https://...",
//     "productSlug":  "custom-acrylic-cake-topper",
//     "verified": true,                     // verified purchase badge
//     "location": "Mumbai",
//     "createdAt": "2025-03-20T10:30:00Z",
//     "featured": true                      // pin to top
//   }
//
// Widget is tolerant of missing fields — each piece renders conditionally.
// ─────────────────────────────────────────────────────────────────────────────

final testimonialsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/testimonials', queryParameters: {
      'status': 'approved',
      'pageSize': 10,
    });
    final data = res.data;
    List<Map<String, dynamic>> list;
    if (data is List) {
      list = List<Map<String, dynamic>>.from(data);
    } else if (data is Map) {
      list = List<Map<String, dynamic>>.from(
          data['items'] ?? data['testimonials'] ?? data['data'] ?? []);
    } else {
      return _fallbackTestimonials;
    }
    if (list.isEmpty) return _fallbackTestimonials;
    // Featured items sort to the top
    list.sort((a, b) {
      final af = a['featured'] == true ? 0 : 1;
      final bf = b['featured'] == true ? 0 : 1;
      return af.compareTo(bf);
    });
    return list;
  } catch (_) {
    return _fallbackTestimonials;
  }
});

/// Realistic fallback reviews — shown only until admin populates real ones.
/// Mirrors web fallback so both platforms look identical in empty state.
const _fallbackTestimonials = <Map<String, dynamic>>[
  {
    'name': 'Priya Sharma',
    'rating': 5,
    'text': 'The personalised cake topper was absolutely stunning! '
        'Delivery was on time and packaging was beautiful. '
        'Everyone at the party asked where I got it.',
    'productTitle': 'Custom Acrylic Cake Topper',
    'verified': true,
    'location': 'Mumbai',
    'createdAt': '2025-03-22T10:30:00Z',
  },
  {
    'name': 'Arjun Mehta',
    'rating': 5,
    'text': 'Gifteeng made my wife\'s birthday so special. '
        'The customiser is incredibly easy to use, and the final '
        'product exceeded my expectations.',
    'productTitle': 'Personalised Photo Frame',
    'verified': true,
    'location': 'Delhi',
    'createdAt': '2025-03-18T14:22:00Z',
  },
  {
    'name': 'Neha Kapoor',
    'rating': 5,
    'text': 'I love how I can earn Goins while shopping. Used them '
        'for a discount on my next order! The gifts are always unique.',
    'productTitle': 'Engraved Keychain Set',
    'verified': true,
    'location': 'Bangalore',
    'createdAt': '2025-03-15T09:12:00Z',
  },
  {
    'name': 'Rohan Desai',
    'rating': 4,
    'text': 'Ordered corporate hampers for 50 employees. Great quality, '
        'bulk discount was fair, and delivery was dispatched the same day.',
    'productTitle': 'Corporate Gift Hamper',
    'verified': true,
    'location': 'Pune',
    'createdAt': '2025-03-10T16:45:00Z',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Widget
// ─────────────────────────────────────────────────────────────────────────────

class TestimonialsSection extends ConsumerStatefulWidget {
  const TestimonialsSection({super.key});
  @override
  ConsumerState<TestimonialsSection> createState() =>
      _TestimonialsSectionState();
}

class _TestimonialsSectionState extends ConsumerState<TestimonialsSection> {
  final _ctrl = PageController(viewportFraction: 0.92);
  int _page = 0;
  Timer? _autoScroll;
  bool _userTouched = false;

  @override
  void initState() {
    super.initState();
    _startAutoScroll();
  }

  @override
  void dispose() {
    _autoScroll?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  void _startAutoScroll() {
    _autoScroll = Timer.periodic(const Duration(seconds: 6), (_) {
      if (!mounted || _userTouched || !_ctrl.hasClients) return;
      final max = (ref.read(testimonialsProvider).value?.length ?? 0);
      if (max <= 1) return;
      final next = (_page + 1) % max;
      _ctrl.animateToPage(next,
          duration: const Duration(milliseconds: 450),
          curve: Curves.easeOutCubic);
    });
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(testimonialsProvider);
    return async.when(
      loading: () => const _SkeletonCarousel(),
      error: (_, __) => const SizedBox.shrink(),
      data: (reviews) {
        if (reviews.isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.fromLTRB(0, 28, 0, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: Row(children: [
                  const Text('💬', style: TextStyle(fontSize: 20)),
                  const Gap(8),
                  Text('Loved by thousands', style: GoogleFonts.inter(
                    fontSize: 19, fontWeight: FontWeight.w800,
                    color: GColors.of(context).text0)),
                  const Spacer(),
                  _OverallRating(reviews: reviews),
                ]),
              ),

              // Carousel — height tightened from 230 → 180 to remove the
              // dead band below the quote that was visible whenever the
              // review text was shorter than 4 lines.
              Listener(
                onPointerDown: (_) => _userTouched = true,
                child: SizedBox(
                  height: 180,
                  child: PageView.builder(
                    controller: _ctrl,
                    onPageChanged: (p) => setState(() => _page = p),
                    itemCount: reviews.length,
                    itemBuilder: (_, i) => Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: _TestimonialCard(review: reviews[i])
                          .animate()
                          .fadeIn(duration: 300.ms),
                    ),
                  ),
                ),
              ),

              const Gap(12),

              // Dots
              Center(child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: List.generate(reviews.length, (i) {
                  final active = _page == i;
                  return AnimatedContainer(
                    duration: 220.ms,
                    width: active ? 20 : 5,
                    height: 5,
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    decoration: BoxDecoration(
                      color: active ? GColors.gold
                          : GColors.gold.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(3),
                    ),
                  );
                }),
              )),
            ],
          ),
        );
      },
    );
  }
}

// ─── Rating pill in the header ───────────────────────────────────────────────

class _OverallRating extends StatelessWidget {
  final List<Map<String, dynamic>> reviews;
  const _OverallRating({required this.reviews});
  @override
  Widget build(BuildContext context) {
    if (reviews.isEmpty) return const SizedBox.shrink();
    final avg = reviews.fold<double>(
      0, (sum, r) => sum + ((r['rating'] as num?)?.toDouble() ?? 5),
    ) / reviews.length;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: GColors.gold.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: GColors.gold.withValues(alpha: 0.25)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.star_rounded, size: 13, color: GColors.gold),
        const Gap(3),
        Text('${avg.toStringAsFixed(1)}',
          style: GoogleFonts.inter(
            fontSize: 12, fontWeight: FontWeight.w800, color: GColors.gold)),
        const Gap(5),
        Text('${reviews.length}+ reviews',
          style: GoogleFonts.inter(
            fontSize: 10, fontWeight: FontWeight.w600,
            color: GColors.of(context).text2)),
      ]),
    );
  }
}

// ─── Individual testimonial card ─────────────────────────────────────────────

class _TestimonialCard extends StatelessWidget {
  final Map<String, dynamic> review;
  const _TestimonialCard({required this.review});

  @override
  Widget build(BuildContext context) {
    final name = (review['name']
        ?? review['userName']
        ?? review['author']
        ?? 'Customer') as String;
    final avatar = review['avatar']
        ?? review['photo']
        ?? review['user']?['avatar'];
    final rating = (review['rating'] as num?)?.toInt() ?? 5;
    final text = (review['text']
        ?? review['comment']
        ?? review['review']
        ?? '') as String;
    final verified = review['verified'] == true
        || review['verifiedPurchase'] == true;
    final location = review['location']
        ?? review['city'] as String?;
    final created = review['createdAt'] ?? review['date'];
    final productTitle = review['productTitle']
        ?? review['product']?['title']
        ?? review['productName'] as String?;
    final productImage = review['productImage']
        ?? review['product']?['image']
        ?? review['product']?['images']?[0];
    final productSlug  = review['productSlug']
        ?? review['product']?['slug'] as String?;

    final c = GColors.of(context);
    return Container(
      decoration: BoxDecoration(
        color: c.bg1,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(
          color: const Color(0x14000000),
          blurRadius: 12, offset: const Offset(0, 4),
        )],
        border: Border.all(color: c.border),
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        // Shrink-wrap content so a short review doesn't stretch the card.
        mainAxisSize: MainAxisSize.min,
        children: [
          // Top row — avatar + name/meta + rating
          Row(children: [
            _Avatar(name: name, avatar: avatar),
            const Gap(10),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Flexible(child: Text(name,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(
                      fontSize: 13, fontWeight: FontWeight.w800,
                      color: c.text0))),
                  if (verified) ...[
                    const Gap(4),
                    const Icon(Icons.verified_rounded,
                        size: 13, color: GColors.gold),
                  ],
                ]),
                Row(children: [
                  Row(children: List.generate(5, (i) => Icon(
                    i < rating ? Icons.star_rounded
                               : Icons.star_outline_rounded,
                    size: 12, color: GColors.gold,
                  ))),
                  if (location != null && (location as String).isNotEmpty) ...[
                    const Gap(6),
                    Icon(Icons.place_rounded,
                        size: 10, color: c.text2),
                    const Gap(2),
                    Text(location, style: GoogleFonts.inter(
                      fontSize: 10, color: c.text2)),
                  ],
                  if (created != null) ...[
                    const Spacer(),
                    Text(_formatDate(created),
                      style: GoogleFonts.inter(
                        fontSize: 10, color: c.text2)),
                  ],
                ]),
              ],
            )),
          ]),

          const Gap(10),

          // Quoted text — sized to content (was Expanded which created a
          // dead band when the review was short).
          Stack(children: [
            Positioned(
              top: -4, left: 0,
              child: Text('"', style: GoogleFonts.playfairDisplay(
                fontSize: 36, color: GColors.gold.withValues(alpha: 0.3),
                height: 1, fontWeight: FontWeight.w900)),
            ),
            Padding(
              padding: const EdgeInsets.only(left: 18, top: 2),
              child: Text(text,
                maxLines: 3, overflow: TextOverflow.ellipsis,
                style: GoogleFonts.inter(
                  fontSize: 13, color: c.text1,
                  height: 1.45, fontStyle: FontStyle.italic)),
            ),
          ]),

          // Product context footer (if review references a specific product)
          if (productTitle != null && (productTitle as String).isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: GestureDetector(
                onTap: productSlug != null && (productSlug as String).isNotEmpty
                    ? () {
                        HapticFeedback.selectionClick();
                        context.push('/shop/$productSlug');
                      }
                    : null,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(8, 6, 10, 6),
                  decoration: BoxDecoration(
                    color: c.bg2,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: c.border),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(5),
                      child: SizedBox(
                        width: 28, height: 28,
                        child: productImage != null
                            ? GiftImage(src: productImage, fit: BoxFit.cover)
                            : Container(
                                color: c.bg1,
                                child: const Center(child: Text('🎁',
                                    style: TextStyle(fontSize: 14)))),
                      ),
                    ),
                    const Gap(8),
                    Flexible(child: Text(productTitle,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.inter(
                        fontSize: 11, fontWeight: FontWeight.w700,
                        color: c.text0))),
                    if (productSlug != null) ...[
                      const Gap(4),
                      Icon(Icons.arrow_forward_ios_rounded,
                          size: 9, color: c.text2),
                    ],
                  ]),
                ),
              ),
            ),
        ],
      ),
    );
  }

  static String _formatDate(dynamic raw) {
    try {
      final d = raw is DateTime ? raw : DateTime.parse(raw.toString());
      final days = DateTime.now().difference(d).inDays;
      if (days < 7) return '${days}d ago';
      if (days < 30) return '${(days / 7).round()}w ago';
      if (days < 365) return DateFormat('d MMM').format(d);
      return DateFormat('MMM yyyy').format(d);
    } catch (_) {
      return '';
    }
  }
}

// ─── Avatar with initials fallback ───────────────────────────────────────────

class _Avatar extends StatelessWidget {
  final String name;
  final dynamic avatar;
  const _Avatar({required this.name, this.avatar});

  static const _palette = [
    Color(0xFF8B5CF6), Color(0xFFEC4899), Color(0xFF10B981),
    Color(0xFFF59E0B), Color(0xFF3B82F6), Color(0xFFEF4444),
  ];

  @override
  Widget build(BuildContext context) {
    final color = _palette[name.hashCode.abs() % _palette.length];
    final initials = name.isEmpty
        ? '?'
        : name.split(' ')
            .where((p) => p.isNotEmpty)
            .map((p) => p[0])
            .take(2).join();
    return Container(
      width: 38, height: 38,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: GColors.of(context).bg2,
      ),
      clipBehavior: Clip.antiAlias,
      child: (avatar is String && avatar.isNotEmpty)
          ? GiftImage(src: avatar, fit: BoxFit.cover)
          : Center(
              child: Text(initials.toUpperCase(),
                style: GoogleFonts.inter(
                  fontSize: 13, fontWeight: FontWeight.w800, color: color))),
    );
  }
}

// ─── Skeleton carousel while loading ─────────────────────────────────────────

class _SkeletonCarousel extends StatelessWidget {
  const _SkeletonCarousel();
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 28, 16, 0),
      child: Builder(builder: (context) {
        final c = GColors.of(context);
        return Container(
          height: 220,
          decoration: BoxDecoration(
            color: c.bg1,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: c.border),
          ),
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(width: 38, height: 38, decoration: BoxDecoration(
                shape: BoxShape.circle, color: c.bg2)),
              const Gap(10),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Container(height: 10, width: 120, color: c.bg2),
                  const Gap(6),
                  Container(height: 8, width: 80, color: c.bg2),
                ],
              )),
            ]),
            const Gap(16),
            Container(height: 10, width: double.infinity, color: c.bg2),
            const Gap(6),
            Container(height: 10, width: double.infinity, color: c.bg2),
            const Gap(6),
            Container(height: 10, width: 200, color: c.bg2),
          ]),
        );
      }),
    );
  }
}
