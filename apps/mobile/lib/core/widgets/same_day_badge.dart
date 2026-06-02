// ─── SameDayBadge — compact "⚡ Same day" pill shown on product cards ──────
//
// Watches `userDeliveryProvider`. Renders nothing unless the user's resolved
// pincode is in the Mumbai metro (sameDay == true). Drop it anywhere — it's
// safe to render in lists; it's lightweight (one Riverpod watch + one Text).
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';

import '../services/location_service.dart';

class SameDayBadge extends ConsumerWidget {
  /// When `true`, also render the badge if etaLabel is non-empty even when
  /// sameDay is false — used at checkout to always show the resolved ETA.
  final bool showEtaWhenNotSameDay;
  final EdgeInsetsGeometry padding;

  const SameDayBadge({
    super.key,
    this.showEtaWhenNotSameDay = false,
    this.padding = const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = ref.watch(userDeliveryProvider);
    if (d.loading) return const SizedBox.shrink();

    // ── Mumbai user, ordered before noon cutoff → green Same-day pill ─────
    if (d.effectiveSameDay) {
      return _Pill(
        bg:     const Color(0xFF15803D),   // emerald
        fg:     Colors.white,
        glyph:  '⚡',
        text:   'Same-day delivery',
        padding: padding,
      );
    }

    // ── Mumbai user, ordered after noon → orange Next-day pill ────────────
    // Distinct color (warm amber) so users learn at a glance that they've
    // crossed the cutoff. Same icon-text grammar as the green pill.
    if (d.nextDayFromMumbai) {
      return _Pill(
        bg:     const Color(0xFFEA580C),   // amber-600
        fg:     Colors.white,
        glyph:  '📦',
        text:   'Next-day delivery',
        padding: padding,
      );
    }

    // ── Non-Mumbai (or unknown zone) checkout context → muted ETA pill ────
    if (showEtaWhenNotSameDay && d.etaLabel.isNotEmpty) {
      return Container(
        padding: padding,
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(5),
        ),
        child: Text(
          d.etaLabel,
          style: GoogleFonts.inter(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: Colors.black87,
          ),
        ),
      );
    }
    return const SizedBox.shrink();
  }
}

// Internal pill body — extracted so same-day vs next-day share the same
// metrics, padding and shadow strength (only `bg`, `glyph`, `text` differ).
class _Pill extends StatelessWidget {
  final Color bg;
  final Color fg;
  final String glyph;
  final String text;
  final EdgeInsetsGeometry padding;
  const _Pill({
    required this.bg,
    required this.fg,
    required this.glyph,
    required this.text,
    required this.padding,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(5),
        boxShadow: [
          BoxShadow(
            color: bg.withValues(alpha: 0.35),
            blurRadius: 4,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(glyph, style: const TextStyle(fontSize: 9.5)),
          const Gap(3),
          Text(text,
              style: GoogleFonts.inter(
                fontSize: 9.5,
                fontWeight: FontWeight.w800,
                color: fg,
                letterSpacing: 0.2,
              )),
        ],
      ),
    );
  }
}
