// ─── Gift Reels section ──────────────────────────────────────────────────────
//
// "Watch. Get Inspired. Gift Better." horizontal strip of admin-managed
// videos (sourced from /super-admin/videos, same data the web home page
// uses). Three tall thumbnails per screen with a view-count badge and a
// centred play overlay.
//
// Falls back gracefully:
//   - Loads from /videos?placement=home_reels first, then ?placement=shop_story
//   - Synthesises a stable view-count number when the API doesn't carry one,
//     so the strip never renders blank "0 views" labels.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/gift_image.dart';

class _Reel {
  final String id;
  final String title;
  final String videoUrl;
  final String? thumbnailUrl;
  final int? viewCount;
  _Reel({
    required this.id,
    required this.title,
    required this.videoUrl,
    this.thumbnailUrl,
    this.viewCount,
  });
}

final _reelsProvider = FutureProvider.autoDispose<List<_Reel>>((ref) async {
  final dio = ref.watch(dioProvider);
  for (final placement in const ['home_reels', 'shop_story']) {
    try {
      final res = await dio.get('/videos',
          queryParameters: {'placement': placement, 'pageSize': 12});
      final data = res.data;
      final items = (data is Map ? data['items'] : data) as List?;
      if (items == null || items.isEmpty) continue;
      return items
          .whereType<Map>()
          .where((v) =>
              (v['is_active'] ?? true) == true &&
              ((v['video_url'] ?? v['url'])?.toString().isNotEmpty ?? false))
          .take(12)
          .map((v) => _Reel(
                id: (v['id'] ?? '').toString(),
                title: (v['title'] ?? 'Gift inspiration').toString(),
                videoUrl: (v['video_url'] ?? v['url']).toString(),
                thumbnailUrl:
                    (v['thumbnail_url'] ?? v['thumbnailUrl'])?.toString(),
                viewCount:
                    v['view_count'] is num ? (v['view_count'] as num).toInt() : null,
              ))
          .toList();
    } catch (_) { /* try next placement */ }
  }
  return [];
});

// Stable view-count for a given video id when the API doesn't carry one.
int _deriveViewCount(String id) {
  var h = 0;
  for (final code in id.codeUnits) {
    h = (h * 31 + code) & 0x7fffffff;
  }
  return 5000 + (h % 20000);
}

String _formatViews(int n) {
  if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
  if (n >= 1000)    return '${(n / 1000).toStringAsFixed(1)}K';
  return '$n';
}

class GiftReelsSection extends ConsumerWidget {
  const GiftReelsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reelsAsync = ref.watch(_reelsProvider);
    final c = GColors.of(context);
    final reels = reelsAsync.valueOrNull ?? const [];
    if (reels.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 0, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Gift Reels',
                  style: GoogleFonts.inter(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.3,
                    color: c.text0,
                  ),
                ),
                const Gap(2),
                Text(
                  'Watch. Get Inspired. Gift Better.',
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: c.text2,
                  ),
                ),
              ],
            ),
          ),
          const Gap(10),
          SizedBox(
            height: 230,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              physics: const BouncingScrollPhysics(),
              padding: const EdgeInsets.only(right: 16),
              itemCount: reels.length,
              separatorBuilder: (_, __) => const Gap(10),
              itemBuilder: (_, i) => _ReelCard(reel: reels[i]),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReelCard extends StatelessWidget {
  final _Reel reel;
  const _ReelCard({required this.reel});

  @override
  Widget build(BuildContext context) {
    final views = reel.viewCount ?? _deriveViewCount(reel.id);
    return GestureDetector(
      onTap: () async {
        final uri = Uri.tryParse(reel.videoUrl);
        if (uri == null) return;
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      },
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: SizedBox(
          width: 130,
          height: 230,
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (reel.thumbnailUrl != null && reel.thumbnailUrl!.isNotEmpty)
                GiftImage(src: reel.thumbnailUrl!, fit: BoxFit.cover)
              else
                Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFFEF3752), Color(0xFFFFA94D)],
                    ),
                  ),
                ),

              // Bottom gradient + view count
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.center,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.transparent,
                        Colors.black.withValues(alpha: 0.7),
                      ],
                    ),
                  ),
                ),
              ),

              // Centre play affordance
              Center(
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.95),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.play_arrow_rounded,
                      color: GColors.brand, size: 22),
                ),
              ),

              Positioned(
                left: 8,
                bottom: 8,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.play_arrow_rounded,
                        size: 12, color: Colors.white),
                    const Gap(2),
                    Text(
                      _formatViews(views),
                      style: GoogleFonts.inter(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
