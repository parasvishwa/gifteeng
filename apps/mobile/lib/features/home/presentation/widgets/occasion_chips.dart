// ─── Shop by Occasion chip rail ───────────────────────────────────────────────
//
// Horizontal scrollable rail of occasion chips. Intent-first discovery:
// users don't think "I need a flower category product" — they think "it's my
// wife's anniversary." Each chip has emoji + label, flat neutral style.
//
// Tap → sets shopOccasionFilterProvider, navigates to /shop.
//
// Backend contract (same for web & mobile):
//   GET /products?tag=occasion:birthday&pageSize=…
// Admin tags products with occasion:<slug>. If no tag exists yet, the shop
// screen can fall back to all products so the chip still works.
//
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/state/app_state.dart';
import '../../../../core/analytics/analytics_service.dart';

class OccasionSpec {
  final String slug;
  final String label;
  final String emoji;
  const OccasionSpec({
    required this.slug,
    required this.label,
    required this.emoji,
  });
}

// Flat neutral chip list per the premium-minimal design system. Visual
// hierarchy comes from typography + whitespace, and the sole coral accent
// line appears only on press to reinforce brand.
const _kOccasions = <OccasionSpec>[
  OccasionSpec(slug: 'birthday',     label: 'Birthday',     emoji: '🎂'),
  OccasionSpec(slug: 'anniversary',  label: 'Anniversary',  emoji: '💍'),
  OccasionSpec(slug: 'corporate',    label: 'Corporate',    emoji: '💼'),
  OccasionSpec(slug: 'festival',     label: 'Festival',     emoji: '🪔'),
  OccasionSpec(slug: 'housewarming', label: 'Housewarming', emoji: '🏠'),
  OccasionSpec(slug: 'just-because', label: 'Just Because', emoji: '💝'),
];

class OccasionChips extends ConsumerWidget {
  const OccasionChips({super.key});

  void _tap(BuildContext context, WidgetRef ref, OccasionSpec o) {
    HapticFeedback.selectionClick();
    Analytics.track('occasion_tap', {'slug': o.slug, 'label': o.label});
    ref.read(shopOccasionFilterProvider.notifier).state = o.slug;
    // Reset any stale category filter so we don't double-scope.
    ref.read(shopCategoryFilterProvider.notifier).state = 'all';
    context.go('/shop');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 28, 0, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: Row(
              children: [
                const Text('🎁', style: TextStyle(fontSize: 20)),
                const Gap(8),
                Text('Shop by Occasion', style: GoogleFonts.inter(
                  fontSize: 18, fontWeight: FontWeight.w800,
                  color: GColors.of(context).text0,
                )),
                const Spacer(),
                GestureDetector(
                  onTap: () => context.push('/categories'),
                  child: Text('View all', style: GoogleFonts.inter(
                    fontSize: 12, fontWeight: FontWeight.w600,
                    color: GColors.brand,
                  )),
                ),
              ],
            ),
          ),
          SizedBox(
            // Icon-on-top + 2-line label = circle 56 + gap 6 + 2 lines ≈ 95.
            height: 96,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _kOccasions.length,
              separatorBuilder: (_, __) => const Gap(14),
              itemBuilder: (ctx, i) {
                final o = _kOccasions[i];
                return _OccasionChip(
                  spec: o,
                  onTap: () => _tap(context, ref, o),
                ).animate()
                  .fadeIn(delay: (i * 60).ms, duration: 320.ms)
                  .slideX(begin: 0.15, end: 0);
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _OccasionChip extends StatefulWidget {
  final OccasionSpec spec;
  final VoidCallback onTap;
  const _OccasionChip({required this.spec, required this.onTap});

  @override
  State<_OccasionChip> createState() => _OccasionChipState();
}

class _OccasionChipState extends State<_OccasionChip> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp:   (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        duration: const Duration(milliseconds: 120),
        scale: _pressed ? 0.95 : 1.0,
        // Icon-on-top + label-below to match the Browse Categories /
        // Shop pill style. Earlier this was a tall rectangular card
        // with the emoji top-left and text bottom-left — out of step
        // with the rest of the app's category visual language.
        child: SizedBox(
          width: 72,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 56, height: 56,
                decoration: BoxDecoration(
                  color: c.bg1,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: _pressed
                        ? GColors.brand.withValues(alpha: 0.45)
                        : c.border,
                    width: _pressed ? 1.5 : 1,
                  ),
                ),
                alignment: Alignment.center,
                child: Text(widget.spec.emoji,
                    style: const TextStyle(fontSize: 24)),
              ),
              const SizedBox(height: 6),
              Text(
                widget.spec.label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                  fontSize: 10.5,
                  height: 1.15,
                  fontWeight: FontWeight.w700,
                  color: _pressed ? GColors.brand : c.text1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
