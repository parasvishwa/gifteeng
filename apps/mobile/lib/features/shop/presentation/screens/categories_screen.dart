import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shimmer/shimmer.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';

// ─── Provider ─────────────────────────────────────────────────────────────────

final _categoriesScreenProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final dio = ref.watch(dioProvider);
  try {
    final res = await dio.get('/categories', queryParameters: {
      'pageSize': '200',
      'withPreviews': 'true',
      'previewsPerCategory': '1',
    });
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

// ─── Emoji mapping ────────────────────────────────────────────────────────────

String _emojiFor(String name) {
  final n = name.toLowerCase();
  if (n.contains('birthday') || n.contains('cake')) return '🎂';
  if (n.contains('anniversary') || n.contains('couple')) return '💍';
  if (n.contains('flower') || n.contains('bouquet')) return '💐';
  if (n.contains('personaliz') || n.contains('custom') || n.contains('photo')) return '🎁';
  if (n.contains('home') || n.contains('decor')) return '🏡';
  if (n.contains('stationary') || n.contains('stationery') || n.contains('journal')) return '📝';
  if (n.contains('kid') || n.contains('child') || n.contains('toy')) return '🧸';
  if (n.contains('corporate') || n.contains('office') || n.contains('business')) return '💼';
  if (n.contains('return') || n.contains('wedding') || n.contains('hamper')) return '🎀';
  if (n.contains('plant') || n.contains('garden') || n.contains('nature')) return '🌿';
  if (n.contains('candle') || n.contains('spa') || n.contains('wellness')) return '🕯️';
  if (n.contains('tech') || n.contains('gadget') || n.contains('electronic')) return '📱';
  if (n.contains('book') || n.contains('reading')) return '📚';
  if (n.contains('food') || n.contains('chocolate') || n.contains('sweet')) return '🍫';
  if (n.contains('festival') || n.contains('diwali') || n.contains('holi')) return '🪔';
  return '🎁';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class CategoriesScreen extends ConsumerWidget {
  const CategoriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_categoriesScreenProvider);
    final c = GColors.of(context);

    return Scaffold(
      backgroundColor: c.bg0,
      body: CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          // ── App bar ────────────────────────────────────────────────────────
          SliverAppBar(
            pinned: true,
            floating: true,
            backgroundColor: c.bg0,
            surfaceTintColor: Colors.transparent,
            leading: IconButton(
              icon: Icon(Icons.arrow_back_ios_new_rounded,
                  size: 18, color: c.text0),
              onPressed: () => context.pop(),
            ),
            titleSpacing: 4,
            title: Text(
              'Shop by Category',
              style: GoogleFonts.inter(
                fontSize: 22,
                fontWeight: FontWeight.w900,
                color: c.text0,
              ),
            ),
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(1),
              child: Container(height: 1, color: c.border),
            ),
          ),

          // ── Content ────────────────────────────────────────────────────────
          ...async.when(
            loading: () => _buildShimmer(c),
            error: (_, __) => _buildError(context, c, ref),
            data: (items) {
              if (items.isEmpty) return _buildEmpty(context, c);
              return _buildContent(context, c, items);
            },
          ),

          const SliverToBoxAdapter(child: SizedBox(height: 100)),
        ],
      ),
    );
  }

  // ── Shimmer ────────────────────────────────────────────────────────────────

  List<Widget> _buildShimmer(GColorsPalette c) {
    return [
      SliverToBoxAdapter(
        child: Shimmer.fromColors(
          baseColor: const Color(0xFF1A1B24),
          highlightColor: const Color(0xFF252636),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
            child: GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 1,
              ),
              itemCount: 12,
              itemBuilder: (_, __) => Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ),
      ),
    ];
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  List<Widget> _buildError(
      BuildContext context, GColorsPalette c, WidgetRef ref) {
    return [
      SliverFillRemaining(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('😕', style: TextStyle(fontSize: 48)),
                const Gap(16),
                Text(
                  'Could not load categories',
                  style: GoogleFonts.inter(
                    fontSize: 15,
                    color: c.text1,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const Gap(16),
                TextButton(
                  onPressed: () => ref.invalidate(_categoriesScreenProvider),
                  child: Text(
                    'Retry',
                    style: GoogleFonts.inter(color: c.brand),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ];
  }

  // ── Empty ──────────────────────────────────────────────────────────────────

  List<Widget> _buildEmpty(BuildContext context, GColorsPalette c) {
    return [
      SliverFillRemaining(
        child: Center(
          child: Text(
            'No categories yet',
            style: GoogleFonts.inter(
              fontSize: 15,
              color: c.text2,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ),
    ];
  }

  // ── Content ────────────────────────────────────────────────────────────────

  List<Widget> _buildContent(
      BuildContext context,
      GColorsPalette c,
      List<Map<String, dynamic>> items) {
    final parents =
        items.where((x) => x['parent_id'] == null).toList();
    final children =
        items.where((x) => x['parent_id'] != null).toList();

    final hasHierarchy = children.isNotEmpty;

    if (!hasHierarchy) {
      // Flat 3-col grid — no parent/child structure
      return [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 1,
            ),
            delegate: SliverChildBuilderDelegate(
              (ctx, i) {
                final cat = items[i];
                return _CategoryChip(
                  cat: cat,
                  animDelay: (i * 45).ms,
                );
              },
              childCount: items.length,
            ),
          ),
        ),
      ];
    }

    // Hierarchical layout — parent as section header, children in 3-col grid
    final slivers = <Widget>[];
    var sectionIndex = 0;

    for (final parent in parents) {
      final parentId = parent['id'];
      final subs = children
          .where((x) => x['parent_id'] == parentId)
          .toList()
        ..sort((a, b) =>
            ((a['sort_order'] as num?)?.toInt() ?? 999)
                .compareTo((b['sort_order'] as num?)?.toInt() ?? 999));

      // Section header (parent chip, full-width)
      slivers.add(
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.fromLTRB(
                16, sectionIndex == 0 ? 24 : 28, 16, 12),
            child: _ParentHeader(
              cat: parent,
              animDelay: (sectionIndex * 80).ms,
            ),
          ),
        ),
      );

      if (subs.isEmpty) {
        // No children — render the parent itself as a single chip row
        slivers.add(
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            sliver: SliverGrid(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 1,
              ),
              delegate: SliverChildBuilderDelegate(
                (ctx, i) => _CategoryChip(
                  cat: parent,
                  animDelay: (sectionIndex * 80 + 40).ms,
                ),
                childCount: 1,
              ),
            ),
          ),
        );
      } else {
        // Subcategory chips in 3-col grid
        slivers.add(
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            sliver: SliverGrid(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 1,
              ),
              delegate: SliverChildBuilderDelegate(
                (ctx, i) {
                  final sub = subs[i];
                  return _CategoryChip(
                    cat: sub,
                    animDelay: (sectionIndex * 60 + i * 40).ms,
                  );
                },
                childCount: subs.length,
              ),
            ),
          ),
        );
      }

      sectionIndex++;
    }

    // Orphaned children (parent not in parents list) — show flat at the end
    final knownParentIds = parents.map((p) => p['id']).toSet();
    final orphans = children
        .where((x) => !knownParentIds.contains(x['parent_id']))
        .toList();

    if (orphans.isNotEmpty) {
      slivers.add(
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 28, 16, 12),
            child: Text(
              'More',
              style: GoogleFonts.inter(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: GColors.of(context).text0,
              ),
            ),
          ),
        ),
      );
      slivers.add(
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 1,
            ),
            delegate: SliverChildBuilderDelegate(
              (ctx, i) => _CategoryChip(
                cat: orphans[i],
                animDelay: (sectionIndex * 60 + i * 40).ms,
              ),
              childCount: orphans.length,
            ),
          ),
        ),
      );
    }

    return slivers;
  }
}

// ─── Parent section header ────────────────────────────────────────────────────

class _ParentHeader extends StatelessWidget {
  final Map<String, dynamic> cat;
  final Duration animDelay;

  const _ParentHeader({required this.cat, required this.animDelay});

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final name = cat['name'] as String? ?? '';
    final count = (cat['product_count'] as num?)?.toInt() ?? 0;

    return Row(
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: c.brand.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Center(
            child: Text(
              _emojiFor(name),
              style: const TextStyle(fontSize: 16),
            ),
          ),
        ),
        const Gap(10),
        Expanded(
          child: Text(
            name,
            style: GoogleFonts.inter(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: c.text0,
            ),
          ),
        ),
        if (count > 0)
          Text(
            '$count items',
            style: GoogleFonts.inter(
              fontSize: 12,
              color: c.text2,
              fontWeight: FontWeight.w500,
            ),
          ),
      ],
    )
        .animate(delay: animDelay)
        .fadeIn(duration: 280.ms)
        .slideX(begin: -0.04, end: 0, duration: 280.ms, curve: Curves.easeOut);
  }
}

// ─── Category chip ────────────────────────────────────────────────────────────

class _CategoryChip extends StatelessWidget {
  final Map<String, dynamic> cat;
  final Duration animDelay;

  const _CategoryChip({required this.cat, required this.animDelay});

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final name = cat['name'] as String? ?? '';
    final imageUrl = _previewImage(cat);

    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        context.go('/shop?cat=${Uri.encodeComponent(name)}');
      },
      child: Container(
        decoration: BoxDecoration(
          color: c.bg2,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: c.border, width: 1),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // ── Image or emoji ─────────────────────────────────────────────
            if (imageUrl != null && imageUrl.isNotEmpty)
              ClipOval(
                child: CachedNetworkImage(
                  imageUrl: imageUrl,
                  width: 48,
                  height: 48,
                  fit: BoxFit.cover,
                  placeholder: (_, __) => _EmojiCircle(name: name, c: c),
                  errorWidget: (_, __, ___) => _EmojiCircle(name: name, c: c),
                ),
              )
            else
              _EmojiCircle(name: name, c: c),

            const Gap(8),

            // ── Name ───────────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Text(
                name,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.inter(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: c.text0,
                  height: 1.25,
                ),
              ),
            ),
          ],
        ),
      ),
    )
        .animate(delay: animDelay)
        .fadeIn(duration: 280.ms)
        .slideY(begin: 0.07, end: 0, duration: 280.ms, curve: Curves.easeOut);
  }

  String? _previewImage(Map<String, dynamic> cat) {
    // Try `image` field first
    final img = cat['image'] as String?;
    if (img != null && img.isNotEmpty) return img;

    // Fall back to previews[0].url
    final previews = cat['previews'];
    if (previews is List && previews.isNotEmpty) {
      final first = previews.first;
      if (first is Map) return first['url'] as String?;
    }
    return null;
  }
}

// ─── Emoji circle fallback ────────────────────────────────────────────────────

class _EmojiCircle extends StatelessWidget {
  final String name;
  final GColorsPalette c;

  const _EmojiCircle({required this.name, required this.c});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: c.bg1,
        shape: BoxShape.circle,
        border: Border.all(color: c.border),
      ),
      child: Center(
        child: Text(
          _emojiFor(name),
          style: const TextStyle(fontSize: 22),
        ),
      ),
    );
  }
}
