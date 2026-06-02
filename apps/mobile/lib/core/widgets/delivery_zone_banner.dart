// ─── DeliveryZoneBanner — small diagnostic banner showing resolved location ──
//
// Drop this just under the app bar on the home screen. It shows:
//   • Loading… spinner while GPS is resolving
//   • "Enable location" CTA if the user denied permission
//   • "Delivering to <city> · same-day" (green) when in Mumbai metro
//   • "Delivering to <city> · <eta>" (neutral) otherwise
//
// Tapping the banner refreshes the resolve (useful if user just enabled GPS).
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';

import '../services/location_service.dart';
import '../theme/app_theme.dart';

class DeliveryZoneBanner extends ConsumerWidget {
  const DeliveryZoneBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = ref.watch(userDeliveryProvider);
    final c = GColors.of(context);

    Widget content;
    Color bg;

    if (d.loading) {
      bg = c.bg1;
      content = Row(children: [
        const SizedBox(
          width: 14, height: 14,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        const Gap(8),
        Text('Finding delivery zone…',
            style: GoogleFonts.inter(
                fontSize: 12, fontWeight: FontWeight.w600, color: c.text1)),
      ]);
    } else if (d.permissionDenied) {
      bg = const Color(0xFFFEF3C7);
      content = Row(children: [
        const Text('📍', style: TextStyle(fontSize: 14)),
        const Gap(8),
        Expanded(
          child: Text(
            'Enable location for same-day delivery',
            style: GoogleFonts.inter(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: const Color(0xFF92400E)),
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: const Color(0xFF92400E),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text('Allow',
              style: GoogleFonts.inter(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: Colors.white)),
        ),
      ]);
    } else if (d.sameDay) {
      // ── Mumbai zone — color + label depend on whether noon cutoff has passed.
      // Before 12 PM: emerald-green Same-day banner.
      // After  12 PM: warm-amber Next-day banner so the user knows their
      // order missed today's dispatch window. Same banner shape, different
      // color story so the cutoff state is glanceable.
      final beforeCutoff = d.effectiveSameDay;
      bg = beforeCutoff
          ? const Color(0xFFD1FAE5)  // emerald-100
          : const Color(0xFFFFEDD5); // amber-100
      final accentText = beforeCutoff
          ? const Color(0xFF065F46)
          : const Color(0xFF9A3412);
      content = Row(children: [
        Text(beforeCutoff ? '⚡' : '📦', style: const TextStyle(fontSize: 14)),
        const Gap(8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              RichText(
                text: TextSpan(
                  style: GoogleFonts.inter(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: accentText),
                  children: [
                    const TextSpan(text: 'Delivering to '),
                    TextSpan(
                      text: d.city ?? 'Mumbai',
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    const TextSpan(text: ' · '),
                    TextSpan(
                      text: d.effectiveEtaLabel,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 2),
              Text(
                beforeCutoff
                    ? 'Order by 12 PM today for same-day delivery'
                    : 'Today\'s cutoff passed · arrives tomorrow',
                style: GoogleFonts.inter(
                    fontSize: 10,
                    fontWeight: FontWeight.w500,
                    color: accentText.withValues(alpha: 0.72)),
              ),
            ],
          ),
        ),
      ]);
    } else if ((d.city ?? '').isNotEmpty) {
      bg = c.bg1;
      content = Row(children: [
        Icon(Icons.location_on_rounded, size: 14, color: c.text1),
        const Gap(6),
        Expanded(
          child: Text(
            'Delivering to ${d.city} · ${d.etaLabel}',
            style: GoogleFonts.inter(
                fontSize: 12, fontWeight: FontWeight.w600, color: c.text1),
            overflow: TextOverflow.ellipsis,
          ),
        ),
        if (d.pincode != null)
          Text(d.pincode!,
              style: GoogleFonts.inter(
                  fontSize: 11, fontWeight: FontWeight.w500, color: c.text2)),
      ]);
    } else {
      // No city detected and no manual zone choice yet — hide the banner
      // entirely. The on-launch DeliveryZonePopup is the primary way users
      // pick a zone now; the inline "Tap to detect" prompt was redundant
      // and visually noisy. Returning SizedBox.shrink() removes the row.
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          ref.read(userDeliveryProvider.notifier).refresh();
        },
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: c.border, width: 1),
          ),
          child: content,
        ),
      ),
    );
  }
}
