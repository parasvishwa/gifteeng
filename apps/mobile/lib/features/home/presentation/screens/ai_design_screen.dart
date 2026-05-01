import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:gap/gap.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/gift_image.dart';

// ─── Provider ─────────────────────────────────────────────────────────────────

/// Family key: '<occasionSlug>|<recipientSlug>|<budgetSlug>'
final _aiProductsProvider = FutureProvider.autoDispose
    .family<List<Map<String, dynamic>>, String>((ref, key) async {
  final parts     = key.split('|');
  final occasion  = parts.isNotEmpty ? parts[0] : '';
  final recipient = parts.length > 1  ? parts[1] : '';
  final budget    = parts.length > 2  ? parts[2] : '';

  final qp = <String, String>{'pageSize': '20', 'status': 'active'};
  if (occasion.isNotEmpty)  qp['tag']      = 'occasion:$occasion';
  if (recipient.isNotEmpty) qp['tag']      = 'recipient:$recipient';
  if (budget == 'under199') { qp['maxPrice'] = '199'; }
  else if (budget == '199to499') { qp['minPrice'] = '199'; qp['maxPrice'] = '499'; }
  else if (budget == 'above499')  { qp['minPrice'] = '499'; }

  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/products', queryParameters: qp);
    final data = res.data;
    if (data is List) return List<Map<String, dynamic>>.from(data);
    if (data is Map) {
      return List<Map<String, dynamic>>.from(
          data['items'] ?? data['data'] ?? data['products'] ?? []);
    }
  } catch (_) {}
  return [];
});

// ─── Screen ───────────────────────────────────────────────────────────────────

class AiDesignScreen extends ConsumerStatefulWidget {
  const AiDesignScreen({super.key});
  @override
  ConsumerState<AiDesignScreen> createState() => _AiDesignScreenState();
}

class _AiDesignScreenState extends ConsumerState<AiDesignScreen> {
  String _occasion  = '';
  String _recipient = '';
  String _budget    = '';
  bool   _searched  = false;

  String get _key => '$_occasion|$_recipient|$_budget';

  bool get _hasFilter =>
      _occasion.isNotEmpty || _recipient.isNotEmpty || _budget.isNotEmpty;

  void _search() {
    if (!_hasFilter) return;
    HapticFeedback.mediumImpact();
    setState(() => _searched = true);
  }

  void _reset() {
    HapticFeedback.selectionClick();
    setState(() {
      _occasion = '';
      _recipient = '';
      _budget = '';
      _searched = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: GColors.of(context).bg0,
      appBar: AppBar(
        backgroundColor: GColors.of(context).bg0,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded,
              size: 18, color: GColors.of(context).text0),
          onPressed: () => context.pop(),
        ),
        title: Text('Gift Finder', style: GoogleFonts.inter(
          fontSize: 18, fontWeight: FontWeight.w800, color: GColors.of(context).text0)),
        actions: [
          if (_searched)
            TextButton(
              onPressed: _reset,
              child: Text('Reset', style: GoogleFonts.inter(
                fontSize: 13, color: GColors.brand, fontWeight: FontWeight.w600)),
            ),
        ],
      ),
      body: _searched ? _ResultsBody(filterKey: _key) : _QuizBody(
        occasion:  _occasion,
        recipient: _recipient,
        budget:    _budget,
        onOccasion:  (v) => setState(() => _occasion  = _occasion  == v ? '' : v),
        onRecipient: (v) => setState(() => _recipient = _recipient == v ? '' : v),
        onBudget:    (v) => setState(() => _budget    = _budget    == v ? '' : v),
        hasFilter:   _hasFilter,
        onSearch:    _search,
      ),
    );
  }
}

// ─── Quiz step ────────────────────────────────────────────────────────────────

class _QuizBody extends StatelessWidget {
  final String occasion, recipient, budget;
  final ValueChanged<String> onOccasion, onRecipient, onBudget;
  final bool hasFilter;
  final VoidCallback onSearch;

  const _QuizBody({
    required this.occasion,  required this.recipient,  required this.budget,
    required this.onOccasion, required this.onRecipient, required this.onBudget,
    required this.hasFilter,  required this.onSearch,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      children: [
        // Hero
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                GColors.brand.withValues(alpha: 0.12),
                GColors.brand.withValues(alpha: 0.04),
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: GColors.brand.withValues(alpha: 0.15)),
          ),
          child: Row(children: [
            const Text('✨', style: TextStyle(fontSize: 36)),
            const Gap(16),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('AI Gift Finder',
                  style: GoogleFonts.inter(
                    fontSize: 18, fontWeight: FontWeight.w900,
                    color: GColors.of(context).text0)),
                const Gap(4),
                Text('Answer a few questions and we\'ll suggest the perfect gift.',
                  style: GoogleFonts.inter(
                    fontSize: 12, color: GColors.of(context).text2, height: 1.4)),
              ],
            )),
          ]),
        ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.05, end: 0),

        const Gap(28),

        // ── Occasion ────────────────────────────────────────────────────────
        _QuizSection(
          label: "What's the occasion?",
          emoji: '🎉',
          chips: const [
            ('birthday',     '🎂 Birthday'),
            ('anniversary',  '💍 Anniversary'),
            ('wedding',      '💒 Wedding'),
            ('graduation',   '🎓 Graduation'),
            ('housewarming', '🏠 Housewarming'),
            ('corporate',    '💼 Corporate'),
            ('festival',     '🪔 Festival'),
            ('just-because', '💝 Just Because'),
          ],
          selected: occasion,
          onSelect: onOccasion,
        ),

        const Gap(24),

        // ── Recipient ────────────────────────────────────────────────────────
        _QuizSection(
          label: 'Who is it for?',
          emoji: '🎁',
          chips: const [
            ('him',    '👨 For Him'),
            ('her',    '👩 For Her'),
            ('couple', '👫 For Couple'),
            ('kids',   '🧒 For Kids'),
            ('parent', '👴 For Parents'),
            ('friend', '🤝 For Friend'),
            ('boss',   '💼 For Boss'),
            ('team',   '🏆 For Team'),
          ],
          selected: recipient,
          onSelect: onRecipient,
        ),

        const Gap(24),

        // ── Budget ────────────────────────────────────────────────────────
        _QuizSection(
          label: 'What\'s your budget?',
          emoji: '💰',
          chips: const [
            ('under199',  '💸 Under ₹199'),
            ('199to499',  '🪙 ₹199 – ₹499'),
            ('above499',  '✨ ₹499+'),
          ],
          selected: budget,
          onSelect: onBudget,
        ),

        const Gap(32),

        // CTA
        GestureDetector(
          onTap: hasFilter ? onSearch : null,
          child: AnimatedContainer(
            duration: 200.ms,
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 16),
            decoration: BoxDecoration(
              color: hasFilter
                  ? GColors.brand
                  : GColors.brand.withValues(alpha: 0.35),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Center(
              child: Text('Find Gifts →',
                style: GoogleFonts.inter(
                  fontSize: 15, fontWeight: FontWeight.w800,
                  color: Colors.white)),
            ),
          ),
        ).animate(delay: 200.ms).fadeIn(duration: 300.ms),

        const Gap(12),

        Center(
          child: Text('or browse all gifts',
            style: GoogleFonts.inter(fontSize: 12, color: GColors.of(context).text2)),
        ),
        const Gap(4),
        GestureDetector(
          onTap: () => context.go('/shop'),
          child: Center(
            child: Text('Shop All →',
              style: GoogleFonts.inter(
                fontSize: 13, fontWeight: FontWeight.w700,
                color: GColors.brand)),
          ),
        ),
      ],
    );
  }
}

class _QuizSection extends StatelessWidget {
  final String label, emoji, selected;
  final List<(String, String)> chips;
  final ValueChanged<String> onSelect;
  const _QuizSection({
    required this.label, required this.emoji, required this.selected,
    required this.chips, required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Text(emoji, style: const TextStyle(fontSize: 16)),
          const Gap(8),
          Text(label, style: GoogleFonts.inter(
            fontSize: 14, fontWeight: FontWeight.w800, color: GColors.of(context).text0)),
        ]),
        const Gap(12),
        Wrap(spacing: 8, runSpacing: 8,
          children: chips.map((c) {
            final sel = selected == c.$1;
            return GestureDetector(
              onTap: () { HapticFeedback.selectionClick(); onSelect(c.$1); },
              child: AnimatedContainer(
                duration: 150.ms,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: sel ? GColors.brand : GColors.of(context).bg1,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: sel ? GColors.brand : GColors.of(context).border,
                    width: 1.5,
                  ),
                ),
                child: Text(c.$2, style: GoogleFonts.inter(
                  fontSize: 12, fontWeight: FontWeight.w600,
                  color: sel ? Colors.white : GColors.of(context).text1)),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }
}

// ─── Results ──────────────────────────────────────────────────────────────────

class _ResultsBody extends ConsumerWidget {
  final String filterKey;
  const _ResultsBody({required this.filterKey});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_aiProductsProvider(filterKey));
    return async.when(
      loading: () => const Center(
          child: CircularProgressIndicator(color: GColors.brand, strokeWidth: 2)),
      error: (_, __) => Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('😕', style: TextStyle(fontSize: 48)),
          const Gap(12),
          Text('Could not load suggestions',
            style: GoogleFonts.inter(color: GColors.of(context).text1)),
          const Gap(12),
          TextButton(
            onPressed: () => ref.invalidate(_aiProductsProvider(filterKey)),
            child: Text('Retry',
              style: GoogleFonts.inter(color: GColors.brand)),
          ),
        ]),
      ),
      data: (products) {
        if (products.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text('🔍', style: TextStyle(fontSize: 48)),
                const Gap(16),
                Text('No gifts found for your selection',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(
                    fontSize: 16, fontWeight: FontWeight.w700,
                    color: GColors.of(context).text0)),
                const Gap(8),
                Text('Try adjusting your filters or browse all gifts.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(
                    fontSize: 13, color: GColors.of(context).text2)),
                const Gap(24),
                GestureDetector(
                  onTap: () => context.go('/shop'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 24, vertical: 12),
                    decoration: BoxDecoration(
                      color: GColors.brand,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text('Browse All Gifts',
                      style: GoogleFonts.inter(
                        fontSize: 14, fontWeight: FontWeight.w700,
                        color: Colors.white)),
                  ),
                ),
              ]),
            ),
          );
        }
        return Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: Row(children: [
              const Text('✨', style: TextStyle(fontSize: 14)),
              const Gap(6),
              Text('${products.length} gift suggestions found',
                style: GoogleFonts.inter(
                  fontSize: 13, fontWeight: FontWeight.w700,
                  color: GColors.of(context).text0)),
            ]),
          ),
          Expanded(
            child: GridView.builder(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 0.72,
              ),
              itemCount: products.length,
              itemBuilder: (_, i) => _ProductCard(
                product: products[i], index: i),
            ),
          ),
        ]);
      },
    );
  }
}

class _ProductCard extends StatelessWidget {
  final Map<String, dynamic> product;
  final int index;
  const _ProductCard({required this.product, required this.index});

  @override
  Widget build(BuildContext context) {
    final title = (product['title'] ?? product['name'] ?? 'Gift').toString();
    final slug  = (product['slug']  ?? '').toString();
    final price = (product['basePrice'] ?? product['price'] ?? '').toString();
    final imgs  = product['images'];
    dynamic firstImg;
    if (imgs is List && imgs.isNotEmpty) firstImg = imgs.first;
    final isCustomizable = product['isCustomizable'] as bool? ?? false;

    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        if (slug.isNotEmpty) context.push('/shop/$slug');
      },
      child: Container(
        decoration: BoxDecoration(
          color: GColors.of(context).bg1,
          borderRadius: BorderRadius.circular(14),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Stack(children: [
                SizedBox.expand(
                  child: GiftImage(src: firstImg, fit: BoxFit.cover),
                ),
                if (isCustomizable)
                  Positioned(
                    top: 8, left: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 3),
                      decoration: BoxDecoration(
                        color: GColors.brand,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text('✨ Personalize',
                        style: GoogleFonts.inter(
                          fontSize: 8, fontWeight: FontWeight.w800,
                          color: Colors.white)),
                    ),
                  ),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                    maxLines: 2, overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(
                      fontSize: 12, fontWeight: FontWeight.w700,
                      color: GColors.of(context).text0, height: 1.3)),
                  const Gap(4),
                  if (price.isNotEmpty)
                    Text('₹$price', style: GoogleFonts.inter(
                      fontSize: 13, fontWeight: FontWeight.w800,
                      color: GColors.of(context).text0)),
                ],
              ),
            ),
          ],
        ),
      ).animate(delay: (index * 40).ms).fadeIn(duration: 250.ms),
    );
  }
}
