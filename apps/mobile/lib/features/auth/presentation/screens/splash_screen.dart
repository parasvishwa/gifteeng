import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/api/biometric_service.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    Future.delayed(const Duration(milliseconds: 1800), _navigate);
  }

  Future<void> _navigate() async {
    if (!mounted) return;

    final token   = ref.read(authTokenNotifierProvider).valueOrNull;
    final bioSvc  = ref.read(biometricServiceProvider);

    if (token == null) {
      // No token — go to auth.
      if (mounted) context.go('/auth');
      return;
    }

    // Token exists — only challenge biometric if user explicitly enabled it.
    final bioEnabled = ref.read(biometricPrefNotifierProvider).valueOrNull ?? false;
    if (bioEnabled) {
      final bioAvailable = await bioSvc.isAvailable;
      if (bioAvailable) {
        final ok = await bioSvc.authenticate(reason: 'Verify it\'s you to continue');
        if (!mounted) return;
        if (!ok) {
          await ref.read(authTokenNotifierProvider.notifier).clearToken();
          if (mounted) context.go('/auth');
          return;
        }
      }
    }
    if (mounted) context.go('/');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: GColors.bg0,
      body: Stack(
        children: [
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // App icon — G logo
                ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: Image.asset(
                    'assets/icon/icon.png',
                    width: 110, height: 110,
                    fit: BoxFit.cover,
                  ),
                )
                    .animate()
                    .scale(
                      begin: const Offset(0, 0),
                      end: const Offset(1, 1),
                      duration: 700.ms,
                      curve: Curves.elasticOut,
                    )
                    .fadeIn(duration: 400.ms),

                const SizedBox(height: 20),

                // Wordmark — use logo PNG (wide, transparent bg)
                Image.asset(
                  'assets/icon/logo.png',
                  height: 42,
                  fit: BoxFit.contain,
                )
                    .animate(delay: 350.ms)
                    .slideY(begin: 0.3, end: 0, duration: 500.ms, curve: Curves.easeOut)
                    .fadeIn(duration: 500.ms),

                const SizedBox(height: 8),

                Text(
                  'Gift smarter. Earn Goins.',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: GColors.text1,
                    letterSpacing: 0.2,
                  ),
                )
                    .animate(delay: 550.ms)
                    .fadeIn(duration: 600.ms)
                    .slideY(begin: 0.2, end: 0, duration: 600.ms),
              ],
            ),
          ),

          // Subtle bottom accent line.
          Positioned(
            bottom: 52, left: 0, right: 0,
            child: Center(
              child: Container(
                width: 48, height: 3,
                decoration: BoxDecoration(
                  color: GColors.brand,
                  borderRadius: BorderRadius.circular(999),
                ),
              )
                  .animate(delay: 900.ms)
                  .scaleX(begin: 0, end: 1, duration: 600.ms, curve: Curves.easeOut)
                  .fadeIn(duration: 400.ms),
            ),
          ),
        ],
      ),
    );
  }
}
