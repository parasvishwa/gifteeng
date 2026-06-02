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

// "Stories" — Instagram-style story carousel for the shop screen.
// Pulls videos with placement="shop_story" from the admin and renders them
// as circular thumbnails. Tapping a story:
//   - If tagged with a productId, navigates to that product detail screen.
//   - Otherwise, opens the video URL in the system browser.
// Hidden when no active stories exist.

final _shopStoriesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/videos', queryParameters: {
      'placement': 'shop_story',
      'isActive': 'true',
      'pageSize': '30',
    });
    final data = res.data;
    final list = (data is Map) ? (data['items'] as List? ?? []) : (data as List? ?? []);
    return List<Map<String, dynamic>>.from(list)
        .where((m) => (m['isActive'] ?? true) == true && (m['url'] as String?)?.isNotEmpty == true)
        .toList()
      ..sort((a, b) =>
          ((a['sortOrder'] ?? 0) as int).compareTo((b['sortOrder'] ?? 0) as int));
  } catch (_) {
    return [];
  }
});

// Bulk-fetch product slugs for stories tagged with productId
final _productSlugMapProvider =
    FutureProvider.autoDispose<Map<String, String>>((ref) async {
  final stories = await ref.watch(_shopStoriesProvider.future);
  final ids = stories
      .map((s) => s['productId'] as String?)
      .where((id) => id != null && id.isNotEmpty)
      .toSet()
      .toList();
  if (ids.isEmpty) return {};

  final dio = ref.watch(dioProvider);
  final results = await Future.wait(ids.map((id) async {
    try {
      final res = await dio.get('/products/$id');
      if (res.data is Map) {
        final m = res.data as Map;
        return MapEntry(id!, (m['slug'] ?? id) as String);
      }
    } catch (_) {}
    return MapEntry(id!, id);
  }));
  return Map.fromEntries(results);
});

class VideoStoriesSection extends ConsumerWidget {
  const VideoStoriesSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = GColors.of(context);
    final async = ref.watch(_shopStoriesProvider);
    final slugMap = ref.watch(_productSlugMapProvider).valueOrNull ?? const {};

    return async.maybeWhen(
      data: (stories) {
        if (stories.isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(children: [
                  const Icon(Icons.play_circle_filled_rounded,
                      size: 18, color: GColors.brand),
                  const Gap(6),
                  Text('Stories', style: GoogleFonts.inter(
                      fontSize: 15, fontWeight: FontWeight.w900, color: c.text0)),
                  const Gap(6),
                  Text('· tap to watch', style: GoogleFonts.inter(
                      fontSize: 11, color: c.text2)),
                ]),
              ),
              const Gap(10),
              // SingleChildScrollView + Row instead of ListView.separated to
              // avoid the nested-viewport + virtualisation pattern that
              // triggered the _deactivateRecursively assertion at
              // framework.dart:2134. All thumbs are laid out eagerly.
              SizedBox(
                height: 110,
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  physics: const BouncingScrollPhysics(),
                  child: Row(
                    children: [
                      for (int i = 0; i < stories.length; i++) ...[
                        if (i > 0) const Gap(12),
                        _StoryThumb(
                          story:   stories[i],
                          slugMap: slugMap,
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}

class _StoryThumb extends StatelessWidget {
  final Map<String, dynamic> story;
  final Map<String, String> slugMap;
  const _StoryThumb({required this.story, required this.slugMap});

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final title    = (story['title'] ?? '') as String;
    final thumbUrl = (story['thumbnailUrl'] ?? story['thumbnail_url']) as String?;
    final productId= (story['productId'] ?? story['product_id']) as String?;
    final videoUrl = (story['url'] ?? '') as String;

    return GestureDetector(
      onTap: () async {
        HapticFeedback.selectionClick();
        // Prefer navigating to the tagged product if available
        if (productId != null && productId.isNotEmpty) {
          final slug = slugMap[productId] ?? productId;
          context.push('/shop/$slug');
          return;
        }
        // Otherwise just open the video URL externally
        if (videoUrl.isNotEmpty) {
          final uri = Uri.parse(videoUrl);
          if (await canLaunchUrl(uri)) {
            await launchUrl(uri, mode: LaunchMode.externalApplication);
          }
        }
      },
      child: SizedBox(
        width: 76,
        child: Column(
          children: [
            // Gradient ring + thumbnail
            Container(
              width: 72, height: 72,
              padding: const EdgeInsets.all(2),
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  begin: Alignment.topRight,
                  end:   Alignment.bottomLeft,
                  colors: [
                    Color(0xFFEF3752), // brand
                    Color(0xFFF59E0B), // amber
                    Color(0xFF8B5CF6), // purple
                  ],
                ),
              ),
              child: Container(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: c.bg0,
                  border: Border.all(color: c.bg0, width: 2),
                ),
                clipBehavior: Clip.antiAlias,
                child: thumbUrl != null && thumbUrl.isNotEmpty
                    ? CachedNetworkImage(
                        imageUrl: thumbUrl,
                        fit: BoxFit.cover,
                        placeholder: (_, __) => Container(color: c.bg2),
                        errorWidget: (_, __, ___) => Container(
                          color: c.bg2,
                          child: Icon(Icons.play_arrow_rounded, color: c.text2),
                        ),
                      )
                    : Container(
                        color: c.bg2,
                        child: Icon(Icons.play_arrow_rounded, color: c.text2),
                      ),
              ),
            ),
            const Gap(6),
            Text(title, maxLines: 1, overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                    fontSize: 10, fontWeight: FontWeight.w700, color: c.text0)),
          ],
        ),
      ),
    );
  }
}
