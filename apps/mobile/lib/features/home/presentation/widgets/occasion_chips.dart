// ─── Shop by Occasion ──────────────────────────────────────────────────────────
// Hardcoded emotional occasions — Birthday, Anniversary, Wedding, etc.
// Card layout: square coloured image box (emoji) on top + label below.
// The last item in the row is a "View All →" button card.
// Tapping a card sets shopOccasionFilterProvider and navigates to /shop.

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

// ── Occasion data ─────────────────────────────────────────────────────────────

class OccasionSpec {
  final String slug;
  final String label;
  final String emoji;
  final Color  ringColor;
  final Color  bgColor;
  const OccasionSpec({
    required this.slug,
    required this.label,
    required this.emoji,
    required this.ringColor,
    required this.bgColor,
  });
}

const _kOccasions = <OccasionSpec>[
  OccasionSpec(slug: 'birthday',     label: 'Birthday',     emoji: '🎂', ringColor: Color(0xFFef4444), bgColor: Color(0xFFfef2f2)),
  OccasionSpec(slug: 'anniversary',  label: 'Anniversary',  emoji: '💍', ringColor: Color(0xFFa855f7), bgColor: Color(0xFFfaf5ff)),
  OccasionSpec(slug: 'wedding',      label: 'Wedding',      emoji: '💒', ringColor: Color(0xFFf97316), bgColor: Color(0xFFfff7ed)),
  OccasionSpec(slug: 'graduation',   label: 'Graduation',   emoji: '🎓', ringColor: Color(0xFF3b82f6), bgColor: Color(0xFFeff6ff)),
  OccasionSpec(slug: 'mothers-day',  label: "Mom's Day",    emoji: '🌸', ringColor: Color(0xFFec4899), bgColor: Color(0xFFfdf2f8)),
  OccasionSpec(slug: 'fathers-day',  label: "Dad's Day",    emoji: '👨', ringColor: Color(0xFF0ea5e9), bgColor: Color(0xFFf0f9ff)),
  OccasionSpec(slug: 'housewarming', label: 'Housewarming', emoji: '🏠', ringColor: Color(0xFF10b981), bgColor: Color(0xFFf0fdf4)),
  OccasionSpec(slug: 'baby',         label: 'Baby Shower',  emoji: '🍼', ringColor: Color(0xFF06b6d4), bgColor: Color(0xFFecfeff)),
  OccasionSpec(slug: 'diwali',       label: 'Diwali',       emoji: '🪔', ringColor: Color(0xFFf59e0b), bgColor: Color(0xFFfffbeb)),
  OccasionSpec(slug: 'corporate',    label: 'Corporate',    emoji: '💼', ringColor: Color(0xFF6366f1), bgColor: Color(0xFFeef2ff)),
  OccasionSpec(slug: 'just-because', label: 'Just Because', emoji: '💝', ringColor: Color(0xFFef3752), bgColor: Color(0xFFfef2f2)),
  OccasionSpec(slug: 'christmas',    label: 'Christmas',    emoji: '🎅', ringColor: Color(0xFF22c55e), bgColor: Color(0xFFf0fdf4)),
];

// ── Main widget ───────────────────────────────────────────────────────────────

class OccasionChips extends ConsumerWidget {
  const OccasionChips({super.key});

  void _tap(BuildContext context, WidgetRef ref, String slug, String label) {
    HapticFeedback.selectionClick();
    Analytics.track('occasion_tap', {'slug': slug, 'label': label});
    ref.read(shopOccasionFilterProvider.notifier).state = slug;
    ref.read(shopCategoryFilterProvider.notifier).state = 'all';
    context.go('/shop');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = GColors.of(context);
    return Padding(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header — "View all" moved to end of the scroll list as a card
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
            child: Text(
              'Shop by Occasion',
              style: GoogleFonts.inter(
                fontSize: 18, fontWeight: FontWeight.w800, color: c.text0,
              ),
            ),
          ),

          // Horizontal scroll: occasion cards + "View All" card at end
          // Height = 76 (square image) + 6 (gap) + 28 (2-line text) = 110
          SizedBox(
            height: 110,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _kOccasions.length + 1, // +1 for View All
              itemBuilder: (ctx, i) {
                if (i == _kOccasions.length) {
                  return Padding(
                    padding: const EdgeInsets.only(left: 4),
                    child: _ViewAllCard(
                      onTap: () {
                        HapticFeedback.selectionClick();
                        ctx.go('/shop');
                      },
                    ),
                  );
                }
                final o = _kOccasions[i];
                return Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: _OccasionCard(
                    spec: o,
                    onTap: () => _tap(context, ref, o.slug, o.label),
                  )
                      .animate()
                      .fadeIn(delay: (i * 50).ms, duration: 300.ms)
                      .slideX(begin: 0.10, end: 0),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ── Individual occasion card — square image box + label below ─────────────────

class _OccasionCard extends StatefulWidget {
  final OccasionSpec spec;
  final VoidCallback onTap;
  const _OccasionCard({required this.spec, required this.onTap});

  @override
  State<_OccasionCard> createState() => _OccasionCardState();
}

class _OccasionCardState extends State<_OccasionCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final c      = GColors.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return GestureDetector(
      onTapDown:   (_) => setState(() => _pressed = true),
      onTapUp:     (_) => setState(() => _pressed = false),
      onTapCancel: ()  => setState(() => _pressed = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale:    _pressed ? 0.93 : 1.0,
        duration: const Duration(milliseconds: 120),
        child: SizedBox(
          width: 76,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // ── Square image placeholder (emoji) ──────────────────────
              AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                width: 76, height: 76,
                decoration: BoxDecoration(
                  color: isDark ? c.bg2 : widget.spec.bgColor,
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: _pressed
                      ? [BoxShadow(
                          color: widget.spec.ringColor.withValues(alpha: 0.28),
                          blurRadius: 10, spreadRadius: 1,
                        )]
                      : [],
                  border: Border.all(
                    color: _pressed
                        ? widget.spec.ringColor
                        : widget.spec.ringColor.withValues(alpha: 0.35),
                    width: _pressed ? 1.8 : 1.2,
                  ),
                ),
                child: Center(
                  child: Text(
                    widget.spec.emoji,
                    style: const TextStyle(fontSize: 32),
                  ),
                ),
              ),

              const Gap(6),

              // ── Label below ───────────────────────────────────────────
              Text(
                widget.spec.label,
                maxLines:  2,
                overflow:  TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                  fontSize:   10,
                  height:     1.2,
                  fontWeight: FontWeight.w600,
                  color:      _pressed ? widget.spec.ringColor : c.text1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── "View All" button card at end of list ─────────────────────────────────────

class _ViewAllCard extends StatefulWidget {
  final VoidCallback onTap;
  const _ViewAllCard({required this.onTap});

  @override
  State<_ViewAllCard> createState() => _ViewAllCardState();
}

class _ViewAllCardState extends State<_ViewAllCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown:   (_) => setState(() => _pressed = true),
      onTapUp:     (_) => setState(() => _pressed = false),
      onTapCancel: ()  => setState(() => _pressed = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale:    _pressed ? 0.93 : 1.0,
        duration: const Duration(milliseconds: 120),
        child: SizedBox(
          width: 76,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Square box — brand-tinted
              AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                width: 76, height: 76,
                decoration: BoxDecoration(
                  color: GColors.brand.withValues(alpha: _pressed ? 0.14 : 0.07),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: GColors.brand.withValues(alpha: _pressed ? 0.55 : 0.30),
                    width: _pressed ? 1.8 : 1.2,
                  ),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.arrow_forward_rounded,
                      size: 26,
                      color: GColors.brand.withValues(alpha: _pressed ? 1.0 : 0.75),
                    ),
                    const Gap(3),
                    Text(
                      'All',
                      style: GoogleFonts.inter(
                        fontSize: 11, fontWeight: FontWeight.w800,
                        color: GColors.brand,
                      ),
                    ),
                  ],
                ),
              ),

              const Gap(6),

              Text(
                'View All',
                maxLines:  1,
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                  fontSize:   10,
                  height:     1.2,
                  fontWeight: FontWeight.w700,
                  color:      GColors.brand,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
