import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';

// "Visit Our Marketplace Stores" — pulls active marketplace links from the
// admin-managed table and renders them as horizontally scrolling cards.
// Hidden when no active links exist.

final _marketplaceLinksProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/marketplace-links');
    final data = res.data;
    if (data is List) {
      return List<Map<String, dynamic>>.from(data)
          .where((m) => (m['isActive'] ?? m['is_active'] ?? false) == true)
          .toList()
        ..sort((a, b) {
          final sa = (a['sortOrder'] ?? a['sort_order'] ?? 0) as int;
          final sb = (b['sortOrder'] ?? b['sort_order'] ?? 0) as int;
          return sa.compareTo(sb);
        });
    }
  } catch (_) {}
  return [];
});

(Color, Color, String) _brandStyle(String name) {
  final n = name.toLowerCase();
  if (n.contains('amazon'))   return (const Color(0xFFF59E0B).withValues(alpha: 0.15), const Color(0xFFB45309), '📦');
  if (n.contains('flipkart')) return (const Color(0xFF3B82F6).withValues(alpha: 0.15), const Color(0xFF1D4ED8), '🛒');
  if (n.contains('meesho'))   return (const Color(0xFFEC4899).withValues(alpha: 0.15), const Color(0xFFBE185D), '🛍️');
  if (n.contains('myntra'))   return (const Color(0xFFE11D48).withValues(alpha: 0.15), const Color(0xFFBE123C), '👗');
  if (n.contains('ajio'))     return (const Color(0xFF8B5CF6).withValues(alpha: 0.15), const Color(0xFF6D28D9), '🛒');
  return (const Color(0xFF64748B).withValues(alpha: 0.15), const Color(0xFF475569), '🏪');
}

class MarketplaceStoresSection extends ConsumerWidget {
  const MarketplaceStoresSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = GColors.of(context);
    final async = ref.watch(_marketplaceLinksProvider);

    return async.maybeWhen(
      data: (links) {
        if (links.isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(children: [
                  const Icon(Icons.storefront_rounded, size: 18, color: GColors.brand),
                  const Gap(6),
                  Text('Visit Our Marketplace Stores', style: GoogleFonts.inter(
                      fontSize: 15, fontWeight: FontWeight.w900, color: c.text0)),
                ]),
              ),
              const Gap(2),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text('Find Gifteeng on your favourite shopping platforms.',
                    style: GoogleFonts.inter(fontSize: 11, color: c.text2)),
              ),
              const Gap(12),
              SizedBox(
                height: 110,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  separatorBuilder: (_, __) => const Gap(10),
                  itemCount: links.length,
                  itemBuilder: (_, i) => _StoreCard(link: links[i]),
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

class _StoreCard extends StatelessWidget {
  final Map<String, dynamic> link;
  const _StoreCard({required this.link});

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final name    = (link['name'] ?? '') as String;
    final iconUrl = (link['iconUrl'] ?? link['icon_url']) as String?;
    final url     = (link['storeUrl'] ?? link['store_url'] ?? '') as String;
    final (bg, fg, emoji) = _brandStyle(name);

    return GestureDetector(
      onTap: () async {
        HapticFeedback.selectionClick();
        if (url.isEmpty) return;
        final uri = Uri.parse(url);
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      },
      child: Container(
        width: 130,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: c.bg1,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: c.border),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 44, height: 44,
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.circular(10),
              ),
              clipBehavior: Clip.antiAlias,
              child: iconUrl != null && iconUrl.isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: iconUrl,
                      fit: BoxFit.contain,
                      errorWidget: (_, __, ___) => Center(
                        child: Text(emoji, style: const TextStyle(fontSize: 22))),
                    )
                  : Center(child: Text(emoji, style: const TextStyle(fontSize: 22))),
            ),
            const Gap(8),
            Text(name, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: GoogleFonts.inter(
                    fontSize: 12, fontWeight: FontWeight.w800, color: fg)),
            const Gap(2),
            Text('Visit store →', style: GoogleFonts.inter(
                fontSize: 9, color: c.text2)),
          ],
        ),
      ),
    );
  }
}
