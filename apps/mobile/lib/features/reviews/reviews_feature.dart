import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/analytics/analytics_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/g_button.dart';
import '../../core/widgets/gift_image.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────────────────────────────────────

/// Fetches the unified review list for a product — combines native Gifteeng
/// reviews with external imports from Amazon/Flipkart/Myntra/Google so the
/// product detail page shows the full picture.
///
/// Backend: `/reviews/aggregated?productId=…&pageSize=50` returns
/// `{ items: [...], total, page, pageSize }`. Each item carries `photoUrls`
/// (string[]) and `videoUrl` so the existing `_ReviewTile` only needs the
/// keys to be aliased.
final productReviewsProvider = FutureProvider.autoDispose
    .family<List<Map<String, dynamic>>, String>((ref, productId) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/reviews/aggregated', queryParameters: {
      'productId': productId,
      'pageSize':  50,
    });
    final data = res.data;
    final List raw = data is List
        ? data
        : (data is Map ? (data['items'] ?? data['reviews'] ?? data['data'] ?? []) as List : const []);
    return raw.cast<Map>().map((m) {
      final r = Map<String, dynamic>.from(m);
      // The tile reads `images`, `text`, `verified`. Aggregated rows already
      // have `body` + `photoUrls` + `isNative` — alias them in-place so the
      // existing UI keeps working without touching the renderer.
      r['text']     = r['body'] ?? r['text'];
      r['images']   = r['photoUrls'] ?? r['images'] ?? const [];
      r['video']    = r['videoUrl']  ?? r['video'];
      r['verified'] = r['isNative']  ?? r['verified'] ?? false;
      r['authorName'] = r['author'] ?? r['authorName'];
      return r;
    }).toList();
  } catch (_) {}
  return [];
});

/// Computed aggregate stats (avg + per-star counts). Pure function over
/// the review list — invalidating the list invalidates this.
class ReviewStats {
  final double avg;
  final int total;
  final Map<int, int> breakdown; // {5: n, 4: n, …, 1: n}
  ReviewStats({required this.avg, required this.total, required this.breakdown});

  static ReviewStats compute(List<Map<String, dynamic>> reviews) {
    if (reviews.isEmpty) {
      return ReviewStats(avg: 0, total: 0,
          breakdown: {5:0, 4:0, 3:0, 2:0, 1:0});
    }
    final b = {5:0, 4:0, 3:0, 2:0, 1:0};
    double sum = 0;
    for (final r in reviews) {
      final rating = (r['rating'] as num?)?.toInt() ?? 5;
      final clamped = rating.clamp(1, 5);
      b[clamped] = (b[clamped] ?? 0) + 1;
      sum += clamped;
    }
    return ReviewStats(
      avg: sum / reviews.length,
      total: reviews.length,
      breakdown: b,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Photo lightbox — fullscreen viewer with pinch-zoom + swipe between photos.
// Used for review photo thumbnails.
// ─────────────────────────────────────────────────────────────────────────────

void _openPhotoLightbox(
  BuildContext context, List<dynamic> images, int initialIndex,
) {
  showDialog<void>(
    context: context,
    barrierColor: Colors.black,
    builder: (ctx) {
      final controller = PageController(initialPage: initialIndex);
      return Stack(children: [
        PageView.builder(
          controller: controller,
          itemCount: images.length,
          itemBuilder: (_, i) => InteractiveViewer(
            minScale: 1, maxScale: 5,
            child: Center(
              child: GiftImage(
                src: images[i].toString(),
                fit: BoxFit.contain,
              ),
            ),
          ),
        ),
        Positioned(
          top: 40, right: 12,
          child: SafeArea(
            child: GestureDetector(
              onTap: () => Navigator.of(ctx).pop(),
              child: Container(
                width: 40, height: 40,
                decoration: const BoxDecoration(
                  color: Colors.white24, shape: BoxShape.circle),
                child: const Icon(Icons.close_rounded, color: Colors.white),
              ),
            ),
          ),
        ),
        if (images.length > 1)
          Positioned(
            bottom: 40, left: 0, right: 0,
            child: SafeArea(
              child: AnimatedBuilder(
                animation: controller,
                builder: (_, __) {
                  final idx = controller.hasClients
                      ? (controller.page?.round() ?? initialIndex)
                      : initialIndex;
                  return Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.white24,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '${idx + 1} / ${images.length}',
                        style: GoogleFonts.inter(
                          fontSize: 12, color: Colors.white,
                          fontWeight: FontWeight.w700),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
      ]);
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reviews section on product detail
// ─────────────────────────────────────────────────────────────────────────────

class ReviewsSection extends ConsumerWidget {
  final String productId;
  final String productSlug;
  final String productTitle;
  /// Dark-theme surface colors — kept minimal so this widget drops into the
  /// existing product detail page without clashes.
  final Color bgCard;
  final Color bgElevated;
  final Color textPrimary;
  final Color textSecondary;
  final Color textMuted;
  final Color border;
  final Color accent; // star + CTA colour

  const ReviewsSection({
    super.key,
    required this.productId,
    required this.productSlug,
    required this.productTitle,
    this.bgCard        = const Color(0xFF0E1018),
    this.bgElevated    = const Color(0xFF0B0D14),
    this.textPrimary   = const Color(0xFFF0F0F5),
    this.textSecondary = const Color(0xFF7A7A90),
    this.textMuted     = const Color(0xFF4A4A60),
    this.border        = const Color(0xFF1A1C26),
    this.accent        = const Color(0xFFF59E0B),
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Always resolve from active theme so the card looks correct in both
    // dark and light mode. Constructor color params preserved for API compat
    // but are no longer used to prevent the hardcoded-dark problem.
    final _c                   = GColors.of(context);
    final effectiveBgCard      = _c.bg1;
    final effectiveBgElevated  = _c.bg2;
    final effectiveBorder      = _c.border;
    final effectiveTextPrimary    = _c.text0;
    final effectiveTextSecondary  = _c.text1;
    final effectiveTextMuted      = _c.text2;
    final effectiveAccent         = GColors.gold; // always gold regardless of theme

    final async = ref.watch(productReviewsProvider(productId));
    return async.when(
      loading: () => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: effectiveBgCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: effectiveBorder),
        ),
        child: const Center(child: CircularProgressIndicator(
          color: GColors.gold, strokeWidth: 2)),
      ),
      error: (_, __) => const SizedBox.shrink(),
      data: (reviews) {
        final stats = ReviewStats.compute(reviews);
        return Container(
          decoration: BoxDecoration(
            color: effectiveBgCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: effectiveBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
                child: Row(children: [
                  const Text('⭐', style: TextStyle(fontSize: 16)),
                  const Gap(8),
                  Text('Ratings & Reviews',
                    style: GoogleFonts.inter(
                      fontSize: 14, fontWeight: FontWeight.w700,
                      color: effectiveTextPrimary)),
                  if (stats.total > 0) ...[
                    const Spacer(),
                    GestureDetector(
                      onTap: () => context.push(
                        '/shop/$productSlug/reviews',
                        extra: {
                          'productId': productId,
                          'productTitle': productTitle,
                        },
                      ),
                      child: Row(children: [
                        Text('See all',
                          style: GoogleFonts.inter(
                            fontSize: 12, fontWeight: FontWeight.w700,
                            color: effectiveAccent)),
                        const Gap(2),
                        Icon(Icons.chevron_right_rounded,
                            size: 16, color: effectiveAccent),
                      ]),
                    ),
                  ],
                ]),
              ),

              if (stats.total == 0)
                _EmptyReviews(
                  accent: effectiveAccent,
                  textSecondary: effectiveTextSecondary,
                  onWrite: () => _openWriteSheet(context, ref),
                )
              else ...[
                _StatsRow(
                  stats: stats,
                  accent: effectiveAccent,
                  textPrimary: effectiveTextPrimary,
                  textSecondary: effectiveTextSecondary,
                  textMuted: effectiveTextMuted,
                  bgElevated: effectiveBgElevated,
                ),
                const SizedBox(height: 6),
                Divider(color: effectiveBorder, height: 1),
                // Show all approved reviews inline (was capped at 3 — the
                // dedicated /reviews screen is now redundant for browsing
                // since users could only ever see 3 here).
                ...reviews.map((r) => Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                  child: _ReviewTile(
                    review: r,
                    accent: effectiveAccent,
                    textPrimary: effectiveTextPrimary,
                    textSecondary: effectiveTextSecondary,
                    textMuted: effectiveTextMuted,
                    border: effectiveBorder,
                  ),
                )),
                // Compact secondary CTA — earlier we shipped a full-width
                // primary button which dominated the screen. The reviews
                // section's main action is to READ reviews; writing one is
                // a small affordance.
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  child: Center(
                    child: TextButton.icon(
                      onPressed: () => _openWriteSheet(context, ref),
                      icon: const Icon(Icons.edit_outlined, size: 14),
                      label: Text('Write a review', style: GoogleFonts.inter(
                          fontSize: 12, fontWeight: FontWeight.w700)),
                      style: TextButton.styleFrom(
                        foregroundColor: GColors.brand,
                        backgroundColor: GColors.brand.withValues(alpha: 0.08),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 8),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20),
                          side: BorderSide(
                              color: GColors.brand.withValues(alpha: 0.3)),
                        ),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  void _openWriteSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: bgCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(8)),
      ),
      builder: (_) => WriteReviewSheet(
        productId: productId,
        productTitle: productTitle,
        onSubmitted: () {
          ref.invalidate(productReviewsProvider(productId));
        },
      ),
    );
  }
}

// ─── Stats row: big avg + 5-bar breakdown ────────────────────────────────────

class _StatsRow extends StatelessWidget {
  final ReviewStats stats;
  final Color accent, textPrimary, textSecondary, textMuted, bgElevated;
  const _StatsRow({
    required this.stats,
    required this.accent,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.bgElevated,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Big avg on the left
          SizedBox(
            width: 96,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Text(stats.avg.toStringAsFixed(1),
                    style: GoogleFonts.inter(
                      fontSize: 38, fontWeight: FontWeight.w900,
                      color: textPrimary, height: 1)),
                  const Gap(4),
                  Text('/5', style: GoogleFonts.inter(
                    fontSize: 13, color: textSecondary)),
                ]),
                const Gap(4),
                Row(children: List.generate(5, (i) => Icon(
                  i < stats.avg.round()
                      ? Icons.star_rounded
                      : Icons.star_outline_rounded,
                  size: 14, color: accent,
                ))),
                const Gap(4),
                Text('${stats.total} review${stats.total == 1 ? '' : 's'}',
                  style: GoogleFonts.inter(
                    fontSize: 11, color: textMuted)),
              ],
            ),
          ),
          const Gap(12),
          // Bars on the right
          Expanded(
            child: Column(
              children: List.generate(5, (i) {
                final rating = 5 - i;
                final count = stats.breakdown[rating] ?? 0;
                final ratio = stats.total == 0 ? 0.0 : count / stats.total;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(children: [
                    Text('$rating',
                      style: GoogleFonts.inter(
                        fontSize: 11, fontWeight: FontWeight.w600,
                        color: textSecondary)),
                    const Gap(3),
                    Icon(Icons.star_rounded, size: 11, color: accent),
                    const Gap(6),
                    Expanded(
                      child: Container(
                        height: 6,
                        decoration: BoxDecoration(
                          color: bgElevated,
                          borderRadius: BorderRadius.circular(3),
                        ),
                        child: FractionallySizedBox(
                          alignment: Alignment.centerLeft,
                          widthFactor: ratio,
                          child: Container(
                            decoration: BoxDecoration(
                              color: accent,
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                        ),
                      ),
                    ),
                    const Gap(6),
                    SizedBox(
                      width: 22,
                      child: Text('$count', textAlign: TextAlign.end,
                        style: GoogleFonts.inter(
                          fontSize: 10, color: textMuted)),
                    ),
                  ]),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Empty state when no reviews yet ──────────────────────────────────────────

class _EmptyReviews extends StatelessWidget {
  final Color accent, textSecondary;
  final VoidCallback onWrite;
  const _EmptyReviews({
    required this.accent,
    required this.textSecondary,
    required this.onWrite,
  });
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(children: [
        const Text('✨', style: TextStyle(fontSize: 40)),
        const Gap(8),
        Text('Be the first to review this gift',
          style: GoogleFonts.inter(
            fontSize: 13, fontWeight: FontWeight.w600, color: textSecondary)),
        const Gap(12),
        GestureDetector(
          onTap: onWrite,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
            decoration: BoxDecoration(
              color: GColors.brand,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.edit_outlined, size: 16, color: Colors.white),
              const Gap(6),
              Text('Write a Review', style: GoogleFonts.inter(
                fontSize: 13, fontWeight: FontWeight.w800, color: Colors.white)),
            ]),
          ),
        ),
      ]),
    );
  }
}

// ─── Individual review card ───────────────────────────────────────────────────

class _ReviewTile extends StatelessWidget {
  final Map<String, dynamic> review;
  final Color accent, textPrimary, textSecondary, textMuted, border;
  const _ReviewTile({
    required this.review,
    required this.accent,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.border,
  });

  @override
  Widget build(BuildContext context) {
    final rating = (review['rating'] as num?)?.toInt() ?? 5;
    final text   = (review['text'] ?? review['comment']
        ?? review['review'] ?? '') as String;
    final title  = (review['title'] ?? '') as String;
    // New API surfaces a `reviewer.{name, avatarUrl, isOwn}` block. Fall back
    // to legacy fields for any older response shape we might still see.
    final reviewer = (review['reviewer'] as Map?)?.cast<String, dynamic>();
    final name   = (reviewer?['name']
        ?? review['authorName']
        ?? review['userName']
        ?? review['user']?['name']
        ?? review['name']
        ?? 'Verified buyer') as String;
    final avatar = reviewer?['avatarUrl']
        ?? review['avatar']
        ?? review['authorAvatar']
        ?? review['user']?['avatar'];
    final verified = review['verified'] == true
        || review['verifiedPurchase'] == true
        || review['isVerified'] == true;
    // Prefer the *original* review date (Amazon import + admin override)
    // over the row's `createdAt` (which is the import timestamp). Field
    // priority: reviewDate (Amazon) > review_date > publishedAt > date >
    // createdAt fallback.
    final created = review['reviewDate']
        ?? review['review_date']
        ?? review['publishedAt']
        ?? review['date']
        ?? review['createdAt']
        ?? review['created_at'];
    final images = (review['images'] as List?)
        ?? (review['photos'] as List?)
        ?? const [];

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row
          Row(children: [
            // Avatar
            Container(
              width: 32, height: 32,
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.15),
                shape: BoxShape.circle,
                border: Border.all(color: accent.withValues(alpha: 0.3)),
              ),
              clipBehavior: Clip.antiAlias,
              child: avatar != null
                  ? GiftImage(src: avatar, fit: BoxFit.cover)
                  : Center(
                      child: Text(
                        name.isEmpty ? '?' : name[0].toUpperCase(),
                        style: GoogleFonts.inter(
                          fontSize: 13, fontWeight: FontWeight.w800,
                          color: accent))),
            ),
            const Gap(10),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Flexible(child: Text(name,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(
                      fontSize: 13, fontWeight: FontWeight.w700, color: textPrimary))),
                  if (verified) ...[
                    const Gap(6),
                    Icon(Icons.verified_rounded,
                        size: 13, color: accent),
                  ],
                ]),
                Row(children: [
                  Row(children: List.generate(5, (i) => Icon(
                    i < rating
                        ? Icons.star_rounded
                        : Icons.star_outline_rounded,
                    size: 12, color: accent,
                  ))),
                  const Gap(6),
                  if (created != null)
                    Text(_formatDate(created),
                      style: GoogleFonts.inter(fontSize: 10, color: textMuted)),
                ]),
              ],
            )),
          ]),
          if (title.isNotEmpty) ...[
            const Gap(8),
            Text(title, style: GoogleFonts.inter(
              fontSize: 13, fontWeight: FontWeight.w700, color: textPrimary)),
          ],
          if (text.isNotEmpty) ...[
            const Gap(4),
            Text(text, maxLines: 4, overflow: TextOverflow.ellipsis,
              style: GoogleFonts.inter(
                fontSize: 12, color: textSecondary, height: 1.5)),
          ],
          if (images.isNotEmpty) ...[
            const Gap(10),
            SizedBox(
              height: 72,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: images.length,
                separatorBuilder: (_, __) => const Gap(6),
                itemBuilder: (_, i) {
                  final src = images[i].toString();
                  return GestureDetector(
                    onTap: () {
                      HapticFeedback.selectionClick();
                      _openPhotoLightbox(context, images.cast(), i);
                    },
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: SizedBox(
                        width: 72, height: 72,
                        child: GiftImage(src: src, fit: BoxFit.cover),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ],
      ),
    );
  }

  static String _formatDate(dynamic raw) {
    try {
      final d = raw is DateTime ? raw : DateTime.parse(raw.toString());
      final days = DateTime.now().difference(d).inDays;
      if (days == 0) return 'Today';
      if (days == 1) return 'Yesterday';
      if (days < 7) return '${days}d ago';
      if (days < 30) return '${(days / 7).round()}w ago';
      return DateFormat('d MMM yyyy').format(d);
    } catch (_) {
      return '';
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Full reviews screen
// ─────────────────────────────────────────────────────────────────────────────

class ReviewsScreen extends ConsumerStatefulWidget {
  final String productId;
  final String productTitle;
  const ReviewsScreen({
    super.key,
    required this.productId,
    required this.productTitle,
  });

  @override
  ConsumerState<ReviewsScreen> createState() => _ReviewsScreenState();
}

class _ReviewsScreenState extends ConsumerState<ReviewsScreen> {
  int? _filterStar; // null = all
  String _sort = 'recent'; // 'recent' | 'helpful' | 'rating_high' | 'rating_low'

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(productReviewsProvider(widget.productId));
    return Scaffold(
      backgroundColor: GColors.bg0,
      appBar: AppBar(
        backgroundColor: GColors.bg0,
        title: Text('Ratings & Reviews', style: GoogleFonts.inter(
          fontSize: 17, fontWeight: FontWeight.w800, color: GColors.text0)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded,
              size: 18, color: GColors.text0),
          onPressed: () => context.pop(),
        ),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(
          color: GColors.brand, strokeWidth: 2)),
        error: (_, __) => Center(child: Text('Could not load reviews',
          style: GoogleFonts.inter(color: GColors.text2))),
        data: (reviews) {
          final stats = ReviewStats.compute(reviews);
          final filtered = _applyFilters(reviews);

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
            children: [
              // Stats card
              Container(
                decoration: BoxDecoration(
                  color: GColors.bg1,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: GColors.border),
                ),
                child: _StatsRow(
                  stats: stats,
                  accent: GColors.brand,
                  textPrimary: GColors.text0,
                  textSecondary: GColors.text1,
                  textMuted: GColors.text2,
                  bgElevated: GColors.bg2,
                ),
              ),
              const Gap(14),

              // Filter + sort row
              Row(children: [
                Expanded(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(children: [
                      _FilterChip(label: 'All',
                        active: _filterStar == null,
                        onTap: () => setState(() => _filterStar = null)),
                      const Gap(6),
                      for (var i = 5; i >= 1; i--) ...[
                        _FilterChip(
                          label: '$i ★',
                          active: _filterStar == i,
                          onTap: () => setState(() => _filterStar = i),
                        ),
                        const Gap(6),
                      ],
                    ]),
                  ),
                ),
                const Gap(8),
                GestureDetector(
                  onTap: _showSortSheet,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: GColors.bg1,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: GColors.border),
                    ),
                    child: Row(children: [
                      const Icon(Icons.sort_rounded, size: 14,
                          color: GColors.text1),
                      const Gap(4),
                      Text(_sortLabel, style: GoogleFonts.inter(
                        fontSize: 11, fontWeight: FontWeight.w700,
                        color: GColors.text0)),
                    ]),
                  ),
                ),
              ]),
              const Gap(12),

              if (filtered.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 40),
                  child: Center(child: Text(
                    _filterStar != null
                        ? 'No $_filterStar-star reviews yet'
                        : 'No reviews yet — be the first!',
                    style: GoogleFonts.inter(
                      fontSize: 13, color: GColors.text2))),
                )
              else
                for (var i = 0; i < filtered.length; i++)
                  Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: GColors.bg1,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: GColors.border),
                    ),
                    child: _ReviewTile(
                      review: filtered[i], accent: GColors.brand,
                      textPrimary: GColors.text0, textSecondary: GColors.text1,
                      textMuted: GColors.text2, border: GColors.border,
                    ),
                  ).animate(delay: (i * 40).ms).fadeIn(duration: 200.ms),
            ],
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: GColors.brand,
        foregroundColor: Colors.white,
        onPressed: () {
          HapticFeedback.selectionClick();
          showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            backgroundColor: GColors.bg1,
            shape: const RoundedRectangleBorder(
              borderRadius: BorderRadius.vertical(top: Radius.circular(8)),
            ),
            builder: (_) => WriteReviewSheet(
              productId: widget.productId,
              productTitle: widget.productTitle,
              onSubmitted: () => ref.invalidate(
                  productReviewsProvider(widget.productId)),
            ),
          );
        },
        icon: const Icon(Icons.edit_outlined),
        label: Text('Write a Review', style: GoogleFonts.inter(
          fontWeight: FontWeight.w800)),
      ),
    );
  }

  List<Map<String, dynamic>> _applyFilters(List<Map<String, dynamic>> reviews) {
    var list = reviews.toList();
    if (_filterStar != null) {
      list = list.where((r) =>
          ((r['rating'] as num?)?.toInt() ?? 5) == _filterStar).toList();
    }
    switch (_sort) {
      case 'helpful':
        list.sort((a, b) => ((b['helpful'] as num?) ?? 0)
            .compareTo((a['helpful'] as num?) ?? 0));
        break;
      case 'rating_high':
        list.sort((a, b) => ((b['rating'] as num?) ?? 0)
            .compareTo((a['rating'] as num?) ?? 0));
        break;
      case 'rating_low':
        list.sort((a, b) => ((a['rating'] as num?) ?? 0)
            .compareTo((b['rating'] as num?) ?? 0));
        break;
      case 'recent':
      default:
        list.sort((a, b) {
          final da = DateTime.tryParse(a['createdAt']?.toString() ?? '')
              ?? DateTime.fromMillisecondsSinceEpoch(0);
          final db = DateTime.tryParse(b['createdAt']?.toString() ?? '')
              ?? DateTime.fromMillisecondsSinceEpoch(0);
          return db.compareTo(da);
        });
    }
    return list;
  }

  String get _sortLabel => switch (_sort) {
    'helpful'     => 'Most helpful',
    'rating_high' => 'Highest',
    'rating_low'  => 'Lowest',
    _             => 'Most recent',
  };

  void _showSortSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: GColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(8)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(16),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          for (final opt in const [
            ('recent',      'Most recent',  Icons.schedule_rounded),
            ('helpful',     'Most helpful', Icons.thumb_up_outlined),
            ('rating_high', 'Highest rating', Icons.arrow_upward_rounded),
            ('rating_low',  'Lowest rating',  Icons.arrow_downward_rounded),
          ])
            ListTile(
              leading: Icon(opt.$3, color: GColors.text0, size: 18),
              title: Text(opt.$2, style: GoogleFonts.inter(
                fontSize: 14, color: GColors.text0, fontWeight: FontWeight.w600)),
              trailing: _sort == opt.$1
                  ? const Icon(Icons.check_rounded, color: GColors.emerald)
                  : null,
              onTap: () {
                setState(() => _sort = opt.$1);
                Navigator.pop(ctx);
              },
            ),
        ]),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _FilterChip({
    required this.label, required this.active, required this.onTap,
  });
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () { HapticFeedback.selectionClick(); onTap(); },
      child: AnimatedContainer(
        duration: 180.ms,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: active
              ? GColors.gold.withValues(alpha: 0.15) : GColors.bg1,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: active ? GColors.brand : GColors.border,
            width: active ? 1.5 : 1,
          ),
        ),
        child: Text(label, style: GoogleFonts.inter(
          fontSize: 12, fontWeight: FontWeight.w700,
          color: active ? GColors.brand : GColors.text1)),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Write-a-Review bottom sheet
// ─────────────────────────────────────────────────────────────────────────────

class WriteReviewSheet extends ConsumerStatefulWidget {
  final String productId;
  final String productTitle;
  final VoidCallback onSubmitted;
  const WriteReviewSheet({
    super.key,
    required this.productId,
    required this.productTitle,
    required this.onSubmitted,
  });

  @override
  ConsumerState<WriteReviewSheet> createState() => _WriteReviewSheetState();
}

class _WriteReviewSheetState extends ConsumerState<WriteReviewSheet> {
  // Default to 5 stars filled — customer can lower if their experience was different.
  int _rating = 5;
  final _titleCtrl = TextEditingController();
  final _textCtrl  = TextEditingController();
  final List<Uint8List> _photos = [];
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _titleCtrl.dispose();
    _textCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto() async {
    HapticFeedback.selectionClick();
    try {
      final xf = await ImagePicker()
          .pickImage(source: ImageSource.gallery, imageQuality: 80);
      if (xf == null) return;
      final bytes = await xf.readAsBytes();
      if (!mounted) return;
      setState(() => _photos.add(bytes));
    } catch (_) {}
  }

  /// Upload every picked photo to /files/upload (multipart) in parallel.
  /// Returns the hosted URLs. Skips any failed uploads so a single network
  /// blip doesn't block the whole review.
  Future<List<String>> _uploadPhotos(Dio dio) async {
    if (_photos.isEmpty) return const [];
    final futures = _photos.asMap().entries.map((entry) async {
      final idx = entry.key;
      final bytes = entry.value;
      try {
        final form = FormData.fromMap({
          'ownerType': 'review',
          // Content type is inferred from the .jpg extension server-side.
          'file': MultipartFile.fromBytes(
            bytes,
            filename: 'review_${DateTime.now().millisecondsSinceEpoch}_$idx.jpg',
          ),
        });
        final res = await dio.post('/files/upload', data: form);
        final data = res.data;
        if (data is Map) {
          final url = (data['url'] ?? data['path'])?.toString();
          if (url != null && url.isNotEmpty) return url;
        }
      } catch (_) {}
      return null;
    });
    final results = await Future.wait(futures);
    return results.whereType<String>().toList();
  }

  Future<void> _submit() async {
    if (_rating == 0) {
      setState(() => _error = 'Please select a rating');
      return;
    }
    if (_textCtrl.text.trim().length < 10) {
      setState(() => _error = 'Review must be at least 10 characters');
      return;
    }
    setState(() { _submitting = true; _error = null; });
    HapticFeedback.mediumImpact();
    try {
      final dio = ref.read(dioProvider);

      // ── 1. Upload photos first → collect hosted URLs ────────────────────
      // Old path sent everything as base64 inside the review body (big
      // payload, killed the DB for anything >2 photos). Now we POST each
      // photo to /files/upload in parallel, which returns a permanent
      // signed URL. The review body only carries URLs.
      final List<String> photoUrls = await _uploadPhotos(dio);

      // ── 2. POST the review with URLs, not base64 ────────────────────────
      await dio.post('/reviews', data: {
        'productId': widget.productId,
        'rating': _rating,
        if (_titleCtrl.text.trim().isNotEmpty) 'title': _titleCtrl.text.trim(),
        'text':   _textCtrl.text.trim(),
        if (photoUrls.isNotEmpty) 'photoUrls': photoUrls,
      });
      // Activity-feed event so the admin sees who submitted what.
      Analytics.track('review_submitted', {
        'productId': widget.productId,
        'rating':    _rating,
        'hasPhotos': photoUrls.isNotEmpty,
        'titleLen':  _titleCtrl.text.trim().length,
        'bodyLen':   _textCtrl.text.trim().length,
      });
      if (mounted) {
        Navigator.pop(context);
        widget.onSubmitted();
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('✨ Thanks for your review!',
            style: GoogleFonts.inter(fontWeight: FontWeight.w500)),
          backgroundColor: GColors.emerald,
          behavior: SnackBarBehavior.floating,
        ));
      }
    } on DioException catch (e) {
      var msg = 'Could not submit review';
      final data = e.response?.data;
      if (data is Map) msg = (data['message'] ?? msg).toString();
      if (e.response?.statusCode == 401) {
        msg = 'Please sign in to write a review';
      }
      setState(() { _submitting = false; _error = msg; });
    } catch (_) {
      setState(() { _submitting = false; _error = 'Something went wrong'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20, right: 20, top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Center(child: Container(
              width: 42, height: 4,
              decoration: BoxDecoration(
                color: GColors.border,
                borderRadius: BorderRadius.circular(2)),
            )),
            const Gap(14),
            Text('Write a Review', style: GoogleFonts.inter(
              fontSize: 20, fontWeight: FontWeight.w800, color: GColors.text0)),
            const Gap(2),
            Text(widget.productTitle,
              maxLines: 2, overflow: TextOverflow.ellipsis,
              style: GoogleFonts.inter(
                fontSize: 12, color: GColors.text2)),

            const Gap(22),
            // Rating stars
            Text('How would you rate it?', style: GoogleFonts.inter(
              fontSize: 12, fontWeight: FontWeight.w700, color: GColors.text1)),
            const Gap(10),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              for (var i = 1; i <= 5; i++)
                GestureDetector(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    setState(() => _rating = i);
                  },
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: AnimatedScale(
                      scale: _rating == i ? 1.15 : 1.0,
                      duration: 150.ms,
                      child: Icon(
                        _rating >= i
                            ? Icons.star_rounded
                            : Icons.star_outline_rounded,
                        size: 42,
                        color: _rating >= i ? GColors.gold : GColors.text2,
                      ),
                    ),
                  ),
                ),
            ]),
            const Gap(2),
            if (_rating > 0)
              Center(child: Text(_ratingLabel,
                style: GoogleFonts.inter(
                  fontSize: 13, fontWeight: FontWeight.w700, color: GColors.gold))),

            const Gap(20),
            // Title
            Text('Title (optional)', style: GoogleFonts.inter(
              fontSize: 12, fontWeight: FontWeight.w700, color: GColors.text1)),
            const Gap(6),
            TextField(
              controller: _titleCtrl,
              maxLength: 60,
              style: GoogleFonts.inter(fontSize: 14, color: GColors.text0),
              decoration: _inputDecoration('Summarise your experience'),
            ),
            const Gap(10),
            // Text
            Text('Your review *', style: GoogleFonts.inter(
              fontSize: 12, fontWeight: FontWeight.w700, color: GColors.text1)),
            const Gap(6),
            TextField(
              controller: _textCtrl,
              maxLines: 5, minLines: 3,
              maxLength: 500,
              style: GoogleFonts.inter(fontSize: 14, color: GColors.text0),
              decoration: _inputDecoration(
                'Tell others what you liked or didn\'t…'),
            ),
            const Gap(10),

            // Photo row
            Text('Add photos (optional)', style: GoogleFonts.inter(
              fontSize: 12, fontWeight: FontWeight.w700, color: GColors.text1)),
            const Gap(6),
            SizedBox(
              height: 70,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _photos.length + 1,
                separatorBuilder: (_, __) => const Gap(8),
                itemBuilder: (_, i) {
                  if (i == _photos.length) {
                    return GestureDetector(
                      onTap: _pickPhoto,
                      child: Container(
                        width: 70,
                        decoration: BoxDecoration(
                          color: GColors.bg2,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: GColors.border,
                            style: BorderStyle.solid,
                          ),
                        ),
                        child: const Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.add_a_photo_outlined,
                                size: 20, color: GColors.text2),
                            Gap(4),
                            Text('Add',
                              style: TextStyle(fontSize: 10, color: GColors.text2)),
                          ],
                        ),
                      ),
                    );
                  }
                  return Stack(children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.memory(_photos[i], width: 70, height: 70,
                          fit: BoxFit.cover),
                    ),
                    Positioned(
                      top: -4, right: -4,
                      child: GestureDetector(
                        onTap: () => setState(() => _photos.removeAt(i)),
                        child: Container(
                          width: 20, height: 20,
                          decoration: const BoxDecoration(
                            color: Colors.black87, shape: BoxShape.circle),
                          child: const Icon(Icons.close_rounded,
                              size: 12, color: Colors.white),
                        ),
                      ),
                    ),
                  ]);
                },
              ),
            ),

            if (_error != null) ...[
              const Gap(12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: GColors.rose.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: GColors.rose.withValues(alpha: 0.3)),
                ),
                child: Row(children: [
                  const Icon(Icons.error_outline_rounded,
                      size: 14, color: GColors.rose),
                  const Gap(8),
                  Expanded(child: Text(_error!, style: GoogleFonts.inter(
                    fontSize: 12, color: GColors.rose))),
                ]),
              ),
            ],

            const Gap(18),
            GButton(
              label: _submitting ? '' : 'Submit Review',
              loading: _submitting,
              onPressed: _submitting ? null : _submit,
            ),
            const Gap(6),
          ],
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(String hint) => InputDecoration(
    hintText: hint,
    counterStyle: GoogleFonts.inter(fontSize: 10, color: GColors.text2),
    hintStyle: GoogleFonts.inter(fontSize: 13, color: GColors.text2),
    filled: true, fillColor: GColors.bg2,
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: GColors.border)),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: GColors.border)),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: GColors.brand, width: 1.5)),
    contentPadding: const EdgeInsets.all(12),
  );

  String get _ratingLabel => switch (_rating) {
    5 => 'Excellent!',
    4 => 'Great!',
    3 => 'Okay',
    2 => 'Could be better',
    1 => 'Disappointing',
    _ => '',
  };
}
