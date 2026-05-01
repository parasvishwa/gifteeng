import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';

/// Navbar Goins balance chip — animated gold coin + balance.
class GoinsChip extends StatelessWidget {
  final int balance;
  final VoidCallback? onTap;

  const GoinsChip({super.key, required this.balance, this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: GColors.bg1,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: GColors.gold.withValues(alpha: 0.35), width: 1.2),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('🪙', style: TextStyle(fontSize: 14)),
            const SizedBox(width: 5),
            Text(
              _fmt(balance),
              style: GoogleFonts.inter(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: GColors.gold,
                letterSpacing: -0.2,
              ),
            ),
          ],
        ),
      )
          .animate(key: ValueKey(balance))
          .scaleXY(begin: 1.15, end: 1, duration: 300.ms, curve: Curves.elasticOut)
          .fadeIn(duration: 200.ms),
    );
  }

  String _fmt(int n) {
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000)    return '${(n / 1000).toStringAsFixed(1)}K';
    return n.toString();
  }
}
