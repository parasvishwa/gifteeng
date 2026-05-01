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

final _collectionsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final dio = ref.watch(dioProvider);
  try {
    final res = await dio.get('/collections',
        queryParameters: {'pageSize': '100'});
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

// ─── Group ordering ───────────────────────────────────────────────────────────

const _kGroupOrder = [
  'By Relation',
  'By Occasion',
  'By Theme',
  'By Profession',
  'By Use Case',
];

Map<String, List<Map<String, dynamic>>> _groupCollections(
    List<Map<String, dynamic>> items) {
  final map = <String, List<Map<String, dynamic>>>{};
  for (final item in items) {
    final desc = (item['description'] as String?)?.trim() ?? 'Other';
    map.putIfAbsent(desc, () => []).add(item);
  }

  // Sort groups: known order first, then "Other" at the end.
  final ordered = <String, List<Map<String, dynamic>>>{};
  for (final key in _kGroupOrder) {
    if (map.containsKey(key)) ordered[key] = map[key]!;
  }
  map.forEach((key, value) {
    if (!_kGroupOrder.contains(key)) ordered[key] = value;
  });
  return ordered;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class CollectionsScreen extends ConsumerWidget {
  const CollectionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_collectionsProvider);
    final c = GColors.of(context);

    return Scaffold(
      backgroundColor: c.bg0,
      body: CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          // ── App bar ────────────────────────────────────────────────────────
          SliverAppBar(
            pinned: true,
            backgroundColor: c.bg0,
            surfaceTintColor: Colors.transparent,
            leading: IconButton(
              icon: Icon(Icons.arrow_back_ios_new_rounded,
                  size: 18, color: c.text0),
              onPressed: () => context.pop(),
            ),
            titleSpacing: 4,
            title: Text(
              'Collections',
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
            loading: () => _buildShimmer(),
            error: (_, __) => _buildError(context, c, ref),
            data: (items) {
              if (items.isEmpty) return _buildEmpty(context, c);
              return _buildGroups(context, c, items);
            },
          ),

          const SliverToBoxAdapter(child: SizedBox(height: 100)),
        ],
      ),
    );
  }

  // ── Shimmer ────────────────────────────────────────────────────────────────

  List<Widget> _buildShimmer() {
    return [
      SliverToBoxAdapter(
        child: Shimmer.fromColors(
          baseColor: const Color(0xFF1A1B24),
          highlightColor: const Color(0xFF252636),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Fake group header
                Container(
                  width: 120,
                  height: 18,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(6),
                  ),
                ),
                const SizedBox(height: 12),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 4 / 3,
                  ),
                  itemCount: 6,
                  itemBuilder: (_, __) => Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ],
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
                  'Could not load collections',
                  style: GoogleFonts.inter(
                    fontSize: 15,
                    color: c.text1,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const Gap(16),
                TextButton(
                  onPressed: () => ref.invalidate(_collectionsProvider),
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
            'No collections yet',
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

  // ── Groups + grid ──────────────────────────────────────────────────────────

  List<Widget> _buildGroups(
      BuildContext context,
      GColorsPalette c,
      List<Map<String, dynamic>> items) {
    final groups = _groupCollections(items);
    final slivers = <Widget>[];

    var groupIndex = 0;
    groups.forEach((groupName, collections) {
      // Section header
      slivers.add(
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.fromLTRB(16, groupIndex == 0 ? 24 : 32, 16, 12),
            child: Text(
              groupName,
              style: GoogleFonts.inter(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: c.text0,
              ),
            ),
          ),
        ),
      );

      // 2-column grid
      slivers.add(
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 4 / 3,
            ),
            delegate: SliverChildBuilderDelegate(
              (ctx, i) {
                final col = collections[i];
                final delay = (groupIndex * 100 + i * 60).ms;
                return _CollectionCard(collection: col, animDelay: delay);
              },
              childCount: collections.length,
            ),
          ),
        ),
      );

      groupIndex++;
    });

    return slivers;
  }
}

// ─── Collection card ──────────────────────────────────────────────────────────

class _CollectionCard extends StatelessWidget {
  final Map<String, dynamic> collection;
  final Duration animDelay;

  const _CollectionCard({
    required this.collection,
    required this.animDelay,
  });

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final name = collection['name'] as String? ?? '';
    final image = collection['image'] as String?;
    final count = collection['product_count'] as int? ??
        (collection['product_count'] as num?)?.toInt() ?? 0;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {
          HapticFeedback.selectionClick();
          context.push('/shop?cat=${Uri.encodeComponent(name)}');
        },
        borderRadius: BorderRadius.circular(12),
        child: Ink(
          decoration: BoxDecoration(
            color: c.bg2,
            borderRadius: BorderRadius.circular(12),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Stack(
              fit: StackFit.expand,
              children: [
                // ── Hero image / gradient placeholder ──────────────────────
                if (image != null && image.isNotEmpty)
                  CachedNetworkImage(
                    imageUrl: image,
                    fit: BoxFit.cover,
                    placeholder: (_, __) => _GradientPlaceholder(name: name),
                    errorWidget: (_, __, ___) =>
                        _GradientPlaceholder(name: name),
                  )
                else
                  _GradientPlaceholder(name: name),

                // ── Bottom gradient overlay ─────────────────────────────────
                Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          Colors.transparent,
                          Colors.black.withValues(alpha: 0.55),
                        ],
                        stops: const [0.0, 0.45, 1.0],
                      ),
                    ),
                  ),
                ),

                // ── Name + product count ───────────────────────────────────
                Positioned(
                  left: 10,
                  right: 10,
                  bottom: 10,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: Text(
                          name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                            height: 1.25,
                          ),
                        ),
                      ),
                      if (count > 0) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 7, vertical: 3),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.55),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.2),
                            ),
                          ),
                          child: Text(
                            '$count',
                            style: GoogleFonts.inter(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    )
        .animate(delay: animDelay)
        .fadeIn(duration: 300.ms)
        .slideY(begin: 0.06, end: 0, duration: 300.ms, curve: Curves.easeOut);
  }
}

// ─── Gradient placeholder ─────────────────────────────────────────────────────

class _GradientPlaceholder extends StatelessWidget {
  final String name;
  const _GradientPlaceholder({required this.name});

  static const _palettes = [
    [Color(0xFF6366F1), Color(0xFFEC4899)],
    [Color(0xFFEF3752), Color(0xFFF59E0B)],
    [Color(0xFF10B981), Color(0xFF0EA5E9)],
    [Color(0xFF7C3AED), Color(0xFF6366F1)],
    [Color(0xFFF59E0B), Color(0xFF10B981)],
  ];

  @override
  Widget build(BuildContext context) {
    final idx = name.isEmpty ? 0 : name.codeUnitAt(0) % _palettes.length;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: _palettes[idx],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Center(
        child: Text(
          name.isNotEmpty ? name[0].toUpperCase() : '?',
          style: const TextStyle(
            fontSize: 36,
            fontWeight: FontWeight.w900,
            color: Colors.white,
          ),
        ),
      ),
    );
  }
}
