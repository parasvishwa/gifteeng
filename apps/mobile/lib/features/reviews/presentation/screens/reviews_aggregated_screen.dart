import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';

// ─────────────────────────────────────────────────────────────────────────────
// /reviews — dedicated aggregated reviews screen.
//
// UNIONs Gifteeng-native reviews with external marketplace reviews
// (Amazon, Flipkart, Myntra, Google, etc.). Each card carries a
// source-logo chip and an optional product tag. Filter: rating >= 4
// (server-enforced, surfaced as a small note).
// ─────────────────────────────────────────────────────────────────────────────

final _aggregatedReviewsProvider =
    FutureProvider.autoDispose.family<Map<String, dynamic>, String>(
        (ref, query) async {
  try {
    final dio = ref.watch(dioProvider);
    final qp  = <String, dynamic>{'page': '1', 'pageSize': '50'};
    if (query.isNotEmpty) qp['source'] = query;
    final res = await dio.get('/reviews/aggregated', queryParameters: qp);
    if (res.data is Map) return Map<String, dynamic>.from(res.data as Map);
  } catch (_) {}
  return {'items': [], 'total': 0};
});

final _reviewStatsProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  try {
    final res = await ref.watch(dioProvider).get('/reviews/stats');
    if (res.data is Map) return Map<String, dynamic>.from(res.data as Map);
  } catch (_) {}
  return {'totalReviews': 0, 'averageRating': 0.0, 'minVisibleRating': 4, 'sources': []};
});

// Built-in source meta (matches web)
const Map<String, _SourceMeta> _sourceMeta = {
  'gifteeng':   _SourceMeta('Gifteeng',   '🎁', Color(0xFFEF3752)),
  'amazon':     _SourceMeta('Amazon',     '📦', Color(0xFFB45309)),
  'flipkart':   _SourceMeta('Flipkart',   '🛒', Color(0xFF1D4ED8)),
  'myntra':     _SourceMeta('Myntra',     '👗', Color(0xFFBE123C)),
  'google':     _SourceMeta('Google',     'G',  Color(0xFF2563EB)),
  'meesho':     _SourceMeta('Meesho',     '🛍', Color(0xFFBE185D)),
  'ajio':       _SourceMeta('Ajio',       '🛒', Color(0xFF6D28D9)),
  'trustpilot': _SourceMeta('Trustpilot', '★',  Color(0xFF047857)),
  'manual':     _SourceMeta('Verified',   '✓',  Color(0xFF475569)),
};

class _SourceMeta {
  final String label;
  final String emoji;
  final Color color;
  const _SourceMeta(this.label, this.emoji, this.color);
}

_SourceMeta _metaFor(String s) => _sourceMeta[s] ?? const _SourceMeta('★', '★', Color(0xFF475569));

class ReviewsAggregatedScreen extends ConsumerStatefulWidget {
  const ReviewsAggregatedScreen({super.key});

  @override
  ConsumerState<ReviewsAggregatedScreen> createState() => _ReviewsAggregatedScreenState();
}

class _ReviewsAggregatedScreenState extends ConsumerState<ReviewsAggregatedScreen> {
  String _sourceFilter = '';

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final reviewsAsync = ref.watch(_aggregatedReviewsProvider(_sourceFilter));
    final statsAsync   = ref.watch(_reviewStatsProvider);

    return Scaffold(
      backgroundColor: c.bg0,
      appBar: AppBar(
        backgroundColor: c.bg0,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: c.text0),
          onPressed: () => context.pop(),
        ),
        title: Text('⭐  Reviews', style: GoogleFonts.inter(
            fontSize: 18, fontWeight: FontWeight.w800, color: c.text0)),
      ),
      body: RefreshIndicator(
        color: GColors.brand,
        onRefresh: () async {
          ref.invalidate(_aggregatedReviewsProvider(_sourceFilter));
          ref.invalidate(_reviewStatsProvider);
          await ref.read(_aggregatedReviewsProvider(_sourceFilter).future);
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            // Hero stats
            statsAsync.when(
              data: (stats) {
                final total = (stats['totalReviews'] as num?)?.toInt() ?? 0;
                if (total == 0) {
                  return Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: c.bg1,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: c.border),
                    ),
                    child: Center(child: Text('No reviews yet',
                        style: GoogleFonts.inter(fontSize: 14, color: c.text2))),
                  );
                }
                final avg = (stats['averageRating'] as num?)?.toDouble() ?? 0.0;
                final sources = (stats['sources'] as List?) ?? const [];
                return Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: c.bg1,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: c.border),
                  ),
                  child: Column(
                    children: [
                      Row(children: List.generate(5, (i) => Icon(
                          i < avg.round() ? Icons.star_rounded : Icons.star_outline_rounded,
                          size: 22, color: const Color(0xFFF59E0B)))),
                      const Gap(6),
                      Text(avg.toStringAsFixed(1),
                          style: GoogleFonts.inter(
                              fontSize: 28, fontWeight: FontWeight.w900, color: c.text0)),
                      Text('${total.toString()} reviews',
                          style: GoogleFonts.inter(fontSize: 11, color: c.text2)),
                      const Gap(14),
                      Wrap(
                        alignment: WrapAlignment.center,
                        spacing: 6, runSpacing: 6,
                        children: sources.whereType<Map>().map<Widget>((raw) {
                          final s = Map<String, dynamic>.from(raw);
                          final src = (s['source'] as String?) ?? '';
                          final cnt = (s['count'] as num?)?.toInt() ?? 0;
                          final m   = _metaFor(src);
                          final on  = _sourceFilter == src;
                          return GestureDetector(
                            onTap: () => setState(() => _sourceFilter = on ? '' : src),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: m.color.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                  color: on ? m.color : m.color.withValues(alpha: 0.3),
                                  width: on ? 1.5 : 1,
                                ),
                              ),
                              child: Row(mainAxisSize: MainAxisSize.min, children: [
                                Text(m.emoji, style: const TextStyle(fontSize: 11)),
                                const Gap(4),
                                Text(m.label, style: GoogleFonts.inter(
                                    fontSize: 11, fontWeight: FontWeight.w800, color: m.color)),
                                Text(' · $cnt', style: GoogleFonts.inter(
                                    fontSize: 10, color: m.color.withValues(alpha: 0.7))),
                              ]),
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  ),
                );
              },
              loading: () => const SizedBox(height: 100, child: Center(child: CircularProgressIndicator(color: GColors.brand))),
              error: (_, __) => const SizedBox.shrink(),
            ),
            const Gap(12),

            // Visibility note
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFF3B82F6).withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFF3B82F6).withValues(alpha: 0.2)),
              ),
              child: Row(children: [
                const Icon(Icons.filter_alt_rounded, size: 13, color: Color(0xFF3B82F6)),
                const Gap(6),
                Expanded(child: RichText(
                  text: TextSpan(
                    style: GoogleFonts.inter(fontSize: 11, color: const Color(0xFF3B82F6)),
                    children: [
                      const TextSpan(text: 'Showing only reviews rated '),
                      TextSpan(text: '4 stars or higher',
                          style: GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.w800, color: const Color(0xFF1D4ED8))),
                      const TextSpan(text: ' · genuine voices, no inflated noise'),
                    ],
                  ),
                )),
              ]),
            ),
            const Gap(14),

            // Reviews list
            reviewsAsync.when(
              data: (data) {
                final items = (data['items'] as List?) ?? const [];
                if (items.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.all(40),
                    child: Center(child: Text(
                      _sourceFilter.isEmpty ? 'No reviews yet' : 'No reviews from this source',
                      style: GoogleFonts.inter(fontSize: 13, color: c.text2),
                    )),
                  );
                }
                return Column(
                  children: items.whereType<Map>().map((m) =>
                    _ReviewCard(review: Map<String, dynamic>.from(m))
                  ).toList(),
                );
              },
              loading: () => const Padding(
                padding: EdgeInsets.all(40),
                child: Center(child: CircularProgressIndicator(color: GColors.brand)),
              ),
              error: (_, __) => Padding(
                padding: const EdgeInsets.all(40),
                child: Center(child: Text('Could not load reviews',
                    style: GoogleFonts.inter(fontSize: 13, color: c.text2))),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReviewCard extends StatelessWidget {
  final Map<String, dynamic> review;
  const _ReviewCard({required this.review});

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final source     = (review['source']     as String?) ?? 'manual';
    final author     = (review['author']     as String?) ?? 'Verified buyer';
    final rating     = (review['rating']     as num?)?.toInt() ?? 5;
    final title      = (review['title']      as String?) ?? '';
    final body       = (review['body']       as String?) ?? '';
    final dateStr    = (review['reviewDate'] as String?) ?? (review['createdAt'] as String?);
    final isNative   = (review['isNative']   as bool?) ?? false;
    final sourceUrl  = review['sourceUrl']    as String?;
    final avatar     = review['authorAvatar'] as String?;
    final product    = (review['product']     as Map?)?.cast<String, dynamic>();
    final m = _metaFor(source);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.bg1,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: c.bg2, shape: BoxShape.circle,
              ),
              clipBehavior: Clip.antiAlias,
              child: avatar != null && avatar.isNotEmpty
                  ? CachedNetworkImage(imageUrl: avatar, fit: BoxFit.cover)
                  : Center(child: Text(author.characters.first.toUpperCase(),
                      style: GoogleFonts.inter(
                          fontSize: 14, fontWeight: FontWeight.w800, color: c.text2))),
            ),
            const Gap(10),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  Text(author, style: GoogleFonts.inter(
                      fontSize: 13, fontWeight: FontWeight.w800, color: c.text0)),
                  // Source chip
                  GestureDetector(
                    onTap: sourceUrl != null && sourceUrl.isNotEmpty
                        ? () => launchUrl(Uri.parse(sourceUrl), mode: LaunchMode.externalApplication)
                        : null,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: m.color.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Text(m.emoji, style: const TextStyle(fontSize: 9)),
                        const Gap(3),
                        Text(m.label.toUpperCase(), style: GoogleFonts.inter(
                            fontSize: 8, fontWeight: FontWeight.w900,
                            color: m.color, letterSpacing: 0.4)),
                      ]),
                    ),
                  ),
                  if (isNative)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                      decoration: BoxDecoration(
                        color: GColors.emerald.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text('✓ VERIFIED PURCHASE', style: GoogleFonts.inter(
                          fontSize: 7, fontWeight: FontWeight.w900,
                          color: GColors.emerald, letterSpacing: 0.4)),
                    ),
                ]),
                const Gap(2),
                Row(children: [
                  ...List.generate(5, (i) => Icon(
                      i < rating ? Icons.star_rounded : Icons.star_outline_rounded,
                      size: 13, color: const Color(0xFFF59E0B))),
                  if (dateStr != null) ...[
                    const Gap(6),
                    Text(_formatDate(dateStr), style: GoogleFonts.inter(
                        fontSize: 10, color: c.text2)),
                  ],
                ]),
              ],
            )),
          ]),

          if (title.isNotEmpty) ...[
            const Gap(8),
            Text(title, style: GoogleFonts.inter(
                fontSize: 13, fontWeight: FontWeight.w800, color: c.text0)),
          ],
          const Gap(6),
          Text(body, style: GoogleFonts.inter(
              fontSize: 12.5, color: c.text1, height: 1.45)),

          // Reviewer-attached media (photos + optional video link)
          () {
            final photoUrls = (review['photoUrls'] as List?)
                ?.whereType<String>()
                .where((u) => u.startsWith('http'))
                .toList()
                ?? const <String>[];
            final videoUrl = review['videoUrl'] as String?;
            if (photoUrls.isEmpty && (videoUrl == null || videoUrl.isEmpty)) {
              return const SizedBox.shrink();
            }
            return Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Wrap(
                spacing: 6, runSpacing: 6,
                children: [
                  ...photoUrls.take(6).map((url) => GestureDetector(
                    onTap: () => launchUrl(Uri.parse(url),
                        mode: LaunchMode.externalApplication),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: CachedNetworkImage(
                        imageUrl: url,
                        width: 60, height: 60, fit: BoxFit.cover,
                        placeholder: (_, __) => Container(
                            width: 60, height: 60, color: c.bg2),
                        errorWidget: (_, __, ___) => Container(
                            width: 60, height: 60, color: c.bg2,
                            child: Icon(Icons.broken_image_rounded,
                                size: 18, color: c.text2)),
                      ),
                    ),
                  )),
                  if (videoUrl != null && videoUrl.isNotEmpty)
                    GestureDetector(
                      onTap: () => launchUrl(Uri.parse(videoUrl),
                          mode: LaunchMode.externalApplication),
                      child: Container(
                        width: 60, height: 60,
                        decoration: BoxDecoration(
                          color: Colors.black,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Center(
                          child: Icon(Icons.play_arrow_rounded,
                              color: Colors.white, size: 26)),
                      ),
                    ),
                  if (photoUrls.length > 6)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 22),
                      child: Text('+${photoUrls.length - 6} more',
                          style: GoogleFonts.inter(
                              fontSize: 10, color: c.text2)),
                    ),
                ],
              ),
            );
          }(),

          if (product != null) ...[
            const Gap(10),
            GestureDetector(
              onTap: () {
                final slug = product['slug'] as String?;
                if (slug != null && slug.isNotEmpty) context.push('/shop/$slug');
              },
              child: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: c.bg2,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(children: [
                  if ((product['imageUrl'] as String?)?.isNotEmpty == true) ...[
                    ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: CachedNetworkImage(
                        imageUrl: product['imageUrl'] as String,
                        width: 36, height: 36, fit: BoxFit.cover),
                    ),
                    const Gap(8),
                  ],
                  Expanded(child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('REVIEWED PRODUCT', style: GoogleFonts.inter(
                          fontSize: 9, fontWeight: FontWeight.w900,
                          color: c.text2, letterSpacing: 0.6)),
                      Text((product['title'] as String?) ?? 'Product',
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(
                              fontSize: 12, fontWeight: FontWeight.w700, color: c.text0)),
                    ],
                  )),
                  Icon(Icons.chevron_right_rounded, size: 16, color: c.text2),
                ]),
              ),
            ),
          ],

          if (!isNative && sourceUrl != null && sourceUrl.isNotEmpty) ...[
            const Gap(8),
            GestureDetector(
              onTap: () {
                HapticFeedback.selectionClick();
                launchUrl(Uri.parse(sourceUrl), mode: LaunchMode.externalApplication);
              },
              child: Text('View original on ${m.label} ↗',
                  style: GoogleFonts.inter(
                      fontSize: 10, color: c.text2, decoration: TextDecoration.underline)),
            ),
          ],
        ],
      ),
    );
  }

  String _formatDate(String iso) {
    try {
      final d = DateTime.parse(iso);
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return '${d.day} ${months[d.month - 1]} ${d.year}';
    } catch (_) { return ''; }
  }
}
