import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:gap/gap.dart';
import 'package:confetti/confetti.dart';

import '../api/api_client.dart';
import '../theme/app_theme.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Milestone celebration popup — fires once per claim when the customer wins
// the every-Nth-signup bonus (set on the server via maybeAward()).
//
// Reads /auth/b2c/me; if metadata.milestoneClaim.seen === false, shows the
// confetti modal then POSTs /auth/b2c/me/milestone-claim/seen so it doesn't
// re-fire on subsequent app opens.
//
// Call maybeShowMilestonePopup(ref, context) from HomeScreen.initState after
// a short delay so the page has rendered.
// ─────────────────────────────────────────────────────────────────────────────

Future<void> maybeShowMilestonePopup(WidgetRef ref, BuildContext context) async {
  await Future<void>.delayed(const Duration(milliseconds: 1500));
  if (!context.mounted) return;

  final token = ref.read(authTokenNotifierProvider).valueOrNull;
  if (token == null) return; // not logged in

  final dio = ref.read(dioProvider);
  Map<String, dynamic>? claim;
  try {
    final res = await dio.get('/auth/b2c/me');
    if (res.data is! Map) return;
    final meta = (res.data['metadata'] as Map?) ?? const {};
    final c = meta['milestoneClaim'];
    if (c is! Map) return;
    if (c['seen'] == true) return;
    claim = Map<String, dynamic>.from(c);
  } catch (_) {
    return;
  }

  if (!context.mounted) return;
  await showDialog<void>(
    context: context,
    barrierDismissible: false,
    barrierColor: Colors.black.withValues(alpha: 0.6),
    builder: (_) => _MilestoneDialog(claim: claim!),
  );
}

class _MilestoneDialog extends ConsumerStatefulWidget {
  final Map<String, dynamic> claim;
  const _MilestoneDialog({required this.claim});

  @override
  ConsumerState<_MilestoneDialog> createState() => _MilestoneDialogState();
}

class _MilestoneDialogState extends ConsumerState<_MilestoneDialog> {
  late final ConfettiController _confetti;

  @override
  void initState() {
    super.initState();
    _confetti = ConfettiController(duration: const Duration(seconds: 4));
    _confetti.play();
    HapticFeedback.heavyImpact();
  }

  @override
  void dispose() {
    _confetti.dispose();
    super.dispose();
  }

  Future<void> _dismiss() async {
    Navigator.of(context).pop();
    try {
      await ref.read(dioProvider).post('/auth/b2c/me/milestone-claim/seen');
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final position = (widget.claim['position'] as num?)?.toInt() ?? 0;
    final amount   = (widget.claim['amount']   as num?)?.toInt() ?? 0;
    final kind     = (widget.claim['kind'] as String?) ?? 'app';

    return Stack(
      alignment: Alignment.center,
      children: [
        // Confetti rain
        Positioned.fill(
          child: Align(
            alignment: Alignment.topCenter,
            child: ConfettiWidget(
              confettiController: _confetti,
              blastDirectionality: BlastDirectionality.explosive,
              numberOfParticles: 30,
              maxBlastForce:   28,
              minBlastForce:   12,
              emissionFrequency: 0.04,
              gravity: 0.18,
              shouldLoop: false,
              colors: const [
                Color(0xFFEF3752), // brand
                Color(0xFFF59E0B), // amber
                Color(0xFF8B5CF6), // purple
                Color(0xFF10B981), // emerald
                Color(0xFF3B82F6), // blue
              ],
            ),
          ),
        ),
        // Card
        Padding(
          padding: const EdgeInsets.all(24),
          child: Container(
            decoration: BoxDecoration(
              color: c.bg1,
              borderRadius: BorderRadius.circular(24),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Hero gradient
                Container(
                  width: double.infinity,
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end:   Alignment.bottomRight,
                      colors: [
                        Color(0xFFF59E0B),
                        Color(0xFFEF3752),
                        Color(0xFF8B5CF6),
                      ],
                    ),
                  ),
                  padding: const EdgeInsets.fromLTRB(20, 28, 20, 22),
                  child: Column(
                    children: [
                      const Text('🎉', style: TextStyle(fontSize: 56)),
                      const Gap(10),
                      Text("You're our ${position.toString()}${_ordinal(position)}!",
                          textAlign: TextAlign.center,
                          style: GoogleFonts.inter(
                              fontSize: 22, fontWeight: FontWeight.w900,
                              color: Colors.white, letterSpacing: -0.4)),
                      const Gap(4),
                      Text(kind == 'web' ? 'Website visitor' : 'App downloader',
                          style: GoogleFonts.inter(
                              fontSize: 12, fontWeight: FontWeight.w600,
                              color: Colors.white.withValues(alpha: 0.85))),
                    ],
                  ),
                ),
                // Reward
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 20, 24, 12),
                  child: Column(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF59E0B).withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.toll_outlined, size: 24, color: Color(0xFFB45309)),
                            const Gap(8),
                            Text('+${amount.toString()}',
                                style: GoogleFonts.inter(
                                    fontSize: 28, fontWeight: FontWeight.w900,
                                    color: const Color(0xFFB45309), letterSpacing: -0.5)),
                            const Gap(6),
                            Text('Goins',
                                style: GoogleFonts.inter(
                                    fontSize: 16, fontWeight: FontWeight.w800,
                                    color: const Color(0xFFB45309))),
                          ],
                        ),
                      ),
                      const Gap(14),
                      Text(
                        "We've credited $amount Goins to your wallet. Use them on your next gift, or play games to earn more!",
                        textAlign: TextAlign.center,
                        style: GoogleFonts.inter(
                            fontSize: 13, color: c.text1, height: 1.5),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
                  child: SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _dismiss,
                      icon: const Icon(Icons.auto_awesome_rounded, size: 16),
                      label: Text('Continue Shopping',
                          style: GoogleFonts.inter(
                              fontSize: 14, fontWeight: FontWeight.w900)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: GColors.brand,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        elevation: 0,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  String _ordinal(int n) {
    final v = n % 100;
    if (v >= 11 && v <= 13) return "th";
    switch (n % 10) {
      case 1: return "st";
      case 2: return "nd";
      case 3: return "rd";
      default: return "th";
    }
  }
}
