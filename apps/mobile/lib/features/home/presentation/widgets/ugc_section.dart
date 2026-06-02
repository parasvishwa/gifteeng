// ─── UGC Wall ─────────────────────────────────────────────────────────────────
// "Real Gifts. Real People. Real Smiles."
// Matches web UGCWallSection.tsx — horizontal scroll of gift photo cards
// + a full-width CTA to shop.

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/theme/app_theme.dart';

class UgcSection extends StatelessWidget {
  const UgcSection({super.key});

  static const _cards = [
    _CardData(bg: Color(0xFFfce7ec), emoji: '🎂', label: 'Birthday\nFrame'),
    _CardData(bg: Color(0xFFeef2ff), emoji: '💍', label: 'Anniversary\nMug'),
    _CardData(bg: Color(0xFFf0fdf4), emoji: '🏠', label: 'Housewarming\nPlaque'),
    _CardData(bg: Color(0xFFfefce8), emoji: '🎓', label: 'Graduation\nKeychain'),
    _CardData(bg: Color(0xFFfdf4ff), emoji: '💝', label: 'Valentine\nCushion'),
  ];

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Padding(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
            child: Text(
              'Real Gifts. Real People. Real Smiles. 💛',
              style: GoogleFonts.inter(
                fontSize: 18, fontWeight: FontWeight.w800,
                color: c.text0, height: 1.25,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Text(
              'Join 3 lakh+ happy customers who gifted with love.',
              style: GoogleFonts.inter(fontSize: 12, color: c.text2),
            ),
          ),

          // Horizontal photo grid
          SizedBox(
            height: 160,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _cards.length,
              itemBuilder: (ctx, i) {
                final card = _cards[i];
                return Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: _UgcCard(data: card)
                      .animate()
                      .fadeIn(delay: (i * 80).ms, duration: 350.ms)
                      .scale(
                        begin: const Offset(0.95, 0.95),
                        end: const Offset(1, 1),
                      ),
                );
              },
            ),
          ),

          const Gap(16),

          // CTA
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
            child: GestureDetector(
              onTap: () => context.go('/shop'),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 14),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFFef3752), Color(0xFFf97316)],
                  ),
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFFef3752).withValues(alpha: 0.3),
                      blurRadius: 16, offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text('🎁', style: TextStyle(fontSize: 16)),
                    const Gap(8),
                    Text(
                      'Create Your Gift Story',
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CardData {
  final Color  bg;
  final String emoji;
  final String label;
  const _CardData({required this.bg, required this.emoji, required this.label});
}

class _UgcCard extends StatelessWidget {
  final _CardData data;
  const _UgcCard({required this.data});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 130, height: 160,
      decoration: BoxDecoration(
        color: data.bg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.6), width: 2),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 12, offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(data.emoji, style: const TextStyle(fontSize: 44)),
          const Gap(8),
          Text(
            data.label,
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(
              fontSize: 11, fontWeight: FontWeight.w700,
              color: const Color(0xFF1a1a2e), height: 1.3,
            ),
          ),
        ],
      ),
    );
  }
}
