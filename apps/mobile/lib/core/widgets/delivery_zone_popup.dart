// ─── Delivery zone picker ────────────────────────────────────────────────────
//
// Shown the first time a customer opens the app (or after an explicit
// "change delivery zone" tap from settings). Asks one yes/no question:
//
//   "Are you in Mumbai?"      → same-day pricing & ETA
//   "Other than Mumbai"       → standard 3–5 day pan-India pricing
//
// We deliberately avoid asking for GPS permission here — the popup is a one-
// tap fast path that respects users who don't want to share location. The
// existing GPS-based resolver still kicks in as a fallback for users who
// dismiss the popup.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';

import '../services/location_service.dart';
import '../theme/app_theme.dart';

class DeliveryZonePopup extends ConsumerWidget {
  const DeliveryZonePopup({super.key});

  /// Show the popup as a modal bottom sheet. Returns the user's choice as
  /// "mumbai" / "other", or `null` when dismissed without picking.
  static Future<String?> show(BuildContext context) {
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      isDismissible: false,           // forces an explicit choice
      enableDrag: false,
      backgroundColor: Colors.transparent,
      builder: (_) => const DeliveryZonePopup(),
    );
  }

  /// Run-once helper — checks the saved choice and pops the picker only if
  /// none exists. Designed to be called from the home screen `initState`
  /// (post-first-frame) so the bottom-sheet doesn't fight the build pass.
  static Future<void> maybeShowOnce(BuildContext context, WidgetRef ref) async {
    final saved = await UserDeliveryNotifier.getSavedChoice();
    if (saved == 'mumbai' || saved == 'other') return;
    if (!context.mounted) return;
    final choice = await show(context);
    if (choice == null) return;
    await ref
        .read(userDeliveryProvider.notifier)
        .setManualChoice(choice);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = GColors.of(context);
    final bottomPad = MediaQuery.of(context).padding.bottom;
    return SafeArea(
      top: false,
      child: Container(
        margin: EdgeInsets.only(left: 16, right: 16, bottom: 16 + bottomPad),
        decoration: BoxDecoration(
          color: c.bg0,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.10),
              blurRadius: 24,
              offset: const Offset(0, 12),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 22, 20, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Pin icon at top-left
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: GColors.brand.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.location_on_outlined,
                    size: 22, color: GColors.brand),
              ),
              const Gap(14),
              Text(
                'Where are you ordering from?',
                style: GoogleFonts.inter(
                  fontSize: 19,
                  fontWeight: FontWeight.w900,
                  color: c.text0,
                  letterSpacing: -0.4,
                  height: 1.2,
                ),
              ),
              const Gap(6),
              Text(
                'We use this to show the correct delivery options and ETA.',
                style: GoogleFonts.inter(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: c.text2,
                  height: 1.45,
                ),
              ),
              const Gap(18),

              // Mumbai card — fast / same-day
              _ZoneCard(
                icon: Icons.bolt_outlined,
                title: "I'm in Mumbai",
                subtitle: "Same-day & next-day delivery available",
                accent: GColors.brand,
                onTap: () => Navigator.of(context).pop('mumbai'),
              ),
              const Gap(10),
              // Other-than-Mumbai card — standard
              _ZoneCard(
                icon: Icons.public_outlined,
                title: 'Other than Mumbai',
                subtitle: 'Pan-India delivery in 3–5 days',
                accent: const Color(0xFF6C3FFF),
                onTap: () => Navigator.of(context).pop('other'),
              ),

              const Gap(12),
              Center(
                child: Text(
                  "You can change this later from Settings",
                  style: GoogleFonts.inter(
                    fontSize: 10.5,
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
  }
}

class _ZoneCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color accent;
  final VoidCallback onTap;

  const _ZoneCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.accent,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          decoration: BoxDecoration(
            color: c.bg1,
            border: Border.all(color: c.border),
            borderRadius: BorderRadius.circular(16),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, size: 19, color: accent),
              ),
              const Gap(12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: c.text0,
                      ),
                    ),
                    const Gap(2),
                    Text(
                      subtitle,
                      style: GoogleFonts.inter(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: c.text2,
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.arrow_forward_ios_rounded, size: 14, color: c.text2),
            ],
          ),
        ),
      ),
    );
  }
}
