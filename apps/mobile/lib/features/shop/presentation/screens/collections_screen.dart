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
        child: Builder(builder: (context) {
          final c = GColors.of(context);
          return Shimmer.fromColors(
            baseColor: c.bg2,
            highlightColor: c.bg1,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Fake group header
                  Container(
                    width: 140,
                    height: 18,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(6),
                    ),
                  ),
                  const SizedBox(height: 12),
                  // 3-col 4:5 grid (matches the data state)
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 3,
                      crossAxisSpacing: 10,
                      mainAxisSpacing: 10,
                      childAspectRatio: 0.62, // close to 4:5 + label
                    ),
                    itemCount: 6,
                    itemBuilder: (_, __) => Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        AspectRatio(
                          aspectRatio: 4 / 5,
                          child: Container(
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Container(
                          width: 48,
                          height: 9,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
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

    // Compute the 4:5 portrait card height so we can use mainAxisExtent
    // (avoids the pixel-rounding crop that the categories screen had).
    final screenW = MediaQuery.sizeOf(context).width;
    const int    cols       = 3;
    const double hPad       = 16 * 2;
    const double hSpacing   = 10 * 2;
    final double cardW      = (screenW - hPad - hSpacing) / cols;
    final double imageH     = cardW * 5 / 4;
    const double nameAreaH  = 34.0;
    final double cellH      = imageH + nameAreaH;

    var groupIndex = 0;
    groups.forEach((groupName, collections) {
      // Section header (just typography — no heavy banner)
      slivers.add(
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.fromLTRB(16, groupIndex == 0 ? 20 : 28, 16, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: Text(
                    groupName,
                    style: GoogleFonts.inter(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: c.text0,
                      letterSpacing: -0.3,
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Text(
                    '${collections.length} ${collections.length == 1 ? 'collection' : 'collections'}',
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: c.text2,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );

      // 3-column 4:5 portrait grid (matches Shop by Category)
      slivers.add(
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          sliver: SliverGrid(
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount:   cols,
              crossAxisSpacing: 10,
              mainAxisSpacing:  10,
              mainAxisExtent:   cellH,
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

// ─── Collection card — 4:5 portrait image + name below ───────────────────────
// Matches the Shop by Category card style: clean image-first card with the
// name as a separate label underneath, no overlay text.
// Emil: AnimatedScale(0.96) on press — every touchable element must feel
// responsive. Scale origin stays center, so the card "sinks" in place.

class _CollectionCard extends StatefulWidget {
  final Map<String, dynamic> collection;
  final Duration animDelay;

  const _CollectionCard({
    required this.collection,
    required this.animDelay,
  });

  @override
  State<_CollectionCard> createState() => _CollectionCardState();
}

class _CollectionCardState extends State<_CollectionCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final c    = GColors.of(context);
    final name = widget.collection['name'] as String? ?? '';
    final image = widget.collection['image'] as String?;

    return GestureDetector(
      onTapDown:   (_) => setState(() => _pressed = true),
      onTapUp:     (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      onTap: () {
        HapticFeedback.selectionClick();
        context.push('/shop?cat=${Uri.encodeComponent(name)}');
      },
      child: AnimatedScale(
        scale:    _pressed ? 0.96 : 1.0,
        duration: const Duration(milliseconds: 110),
        curve:    Curves.easeOut,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            // ── 4:5 portrait image area ─────────────────────────────────
            AspectRatio(
              aspectRatio: 4 / 5,
              child: Container(
                decoration: BoxDecoration(
                  color: c.bg1,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: c.border, width: 1),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(13),
                  child: (image != null && image.isNotEmpty)
                      ? CachedNetworkImage(
                          imageUrl: image,
                          fit: BoxFit.cover,
                          placeholder: (_, __) =>
                              _GradientPlaceholder(name: name),
                          errorWidget: (_, __, ___) =>
                              _GradientPlaceholder(name: name),
                        )
                      : _GradientPlaceholder(name: name),
                ),
              ),
            ),
            const Gap(7),
            // ── Name label below the image ──────────────────────────────
            // SizedBox forces full-column width so textAlign:center actually
            // centers within the available space (not just within the text).
            SizedBox(
              width: double.infinity,
              child: Text(
                name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: c.text0,
                  height: 1.2,
                ),
              ),
            ),
          ],
        ),
      ),
    )
        .animate(delay: widget.animDelay)
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
