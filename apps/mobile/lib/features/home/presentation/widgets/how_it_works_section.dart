// ─── How Gifteeng Works ───────────────────────────────────────────────────────
// Matches web HowItWorksSection.tsx: 3-step horizontal timeline.
// Exported as a standalone widget so home_screen.dart stays lean.

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/theme/app_theme.dart';

class HowItWorksSection extends StatelessWidget {
  const HowItWorksSection({super.key});

  static const _steps = [
    _StepData(
      emoji: '🛍️',
      title: 'Choose a Gift',
      desc: 'Browse 500+ curated personalised gifts for every occasion.',
      color: Color(0xFFef3752),
    ),
    _StepData(
      emoji: '✏️',
      title: 'Personalise It',
      desc: 'Add name, photo, or message. Preview before ordering.',
      color: Color(0xFF8b5cf6),
    ),
    _StepData(
      emoji: '🎁',
      title: 'Gift Delivered',
      desc: 'Premium packaging. Pan-India in 3–7 days.',
      color: Color(0xFF10b981),
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 32, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('✨', style: TextStyle(fontSize: 20)),
              const Gap(8),
              Text(
                'How Gifteeng Works',
                style: GoogleFonts.inter(
                  fontSize: 18, fontWeight: FontWeight.w800, color: c.text0,
                ),
              ),
            ],
          ),
          const Gap(20),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: _steps.asMap().entries.map((entry) {
              final i    = entry.key;
              final step = entry.value;
              final isLast = i == _steps.length - 1;
              return Expanded(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _StepCard(step: step, index: i + 1)
                          .animate()
                          .fadeIn(delay: (i * 120).ms, duration: 400.ms)
                          .slideY(begin: 0.1, end: 0),
                    ),
                    if (!isLast)
                      Padding(
                        padding: const EdgeInsets.only(top: 22),
                        child: Icon(Icons.arrow_forward_ios_rounded,
                            size: 11, color: c.text2),
                      ),
                  ],
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

class _StepData {
  final String emoji;
  final String title;
  final String desc;
  final Color  color;
  const _StepData({
    required this.emoji, required this.title,
    required this.desc,  required this.color,
  });
}

class _StepCard extends StatelessWidget {
  final _StepData step;
  final int index;
  const _StepCard({required this.step, required this.index});

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Column(
      children: [
        Container(
          width: 56, height: 56,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: step.color.withValues(alpha: 0.1),
            border: Border.all(color: step.color.withValues(alpha: 0.3), width: 1.5),
          ),
          child: Center(child: Text(step.emoji, style: const TextStyle(fontSize: 22))),
        ),
        const Gap(8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: step.color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text('Step $index',
            style: GoogleFonts.inter(
              fontSize: 9, fontWeight: FontWeight.w800, color: step.color)),
        ),
        const Gap(5),
        Text(step.title,
          textAlign: TextAlign.center,
          style: GoogleFonts.inter(
            fontSize: 11.5, fontWeight: FontWeight.w800, color: c.text0, height: 1.2)),
        const Gap(4),
        Text(step.desc,
          textAlign: TextAlign.center,
          maxLines: 3, overflow: TextOverflow.ellipsis,
          style: GoogleFonts.inter(fontSize: 9.5, color: c.text2, height: 1.4)),
      ],
    );
  }
}
