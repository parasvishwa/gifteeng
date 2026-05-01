import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:gap/gap.dart';
import 'package:scratcher/scratcher.dart';
import 'package:dio/dio.dart' show Dio;

import '../../../../core/theme/app_theme.dart';
import '../../../../core/api/api_client.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/analytics/analytics_service.dart';
import '../../../../core/widgets/coin_fly.dart';
import '../../../../core/widgets/g_button.dart';
import '../widgets/post_purchase_upsell.dart';

class OrderSuccessScreen extends ConsumerStatefulWidget {
  final String orderId;
  final String orderNumber;
  final String payMethod;

  const OrderSuccessScreen({
    super.key,
    required this.orderId,
    required this.orderNumber,
    required this.payMethod,
  });

  @override
  ConsumerState<OrderSuccessScreen> createState() => _OrderSuccessScreenState();
}

class _OrderSuccessScreenState extends ConsumerState<OrderSuccessScreen> {
  final GlobalKey _checkKey = GlobalKey();
  bool _scratchShown = false;

  @override
  void initState() {
    super.initState();
    // Track the highest-value conversion event in the funnel.
    Analytics.track('checkout_success', {
      'orderId':     widget.orderId,
      'orderNumber': widget.orderNumber,
      'payMethod':   widget.payMethod,
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      HapticFeedback.heavyImpact();

      // 800 ms: coin burst from the checkmark circle
      Future.delayed(const Duration(milliseconds: 800), () {
        if (!mounted) return;
        CoinFly.burstFromKey(
          context,
          _checkKey,
          amount: 16,
          baseDuration: const Duration(milliseconds: 1100),
        );
      });

      // 1 800 ms: full-screen scratch card popup
      Future.delayed(const Duration(milliseconds: 1800), () {
        if (!mounted || _scratchShown) return;
        setState(() => _scratchShown = true);
        _showScratchModal();
      });
    });
  }

  void _showScratchModal() {
    final dio = ref.read(dioProvider);
    showGeneralDialog<void>(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.black.withValues(alpha: 0.88),
      transitionDuration: const Duration(milliseconds: 380),
      transitionBuilder: (ctx, anim, _, child) => SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, 0.25),
          end: Offset.zero,
        ).animate(CurvedAnimation(parent: anim, curve: Curves.easeOutCubic)),
        child: FadeTransition(opacity: anim, child: child),
      ),
      pageBuilder: (ctx, _, __) => _ScratchCardModal(
        orderId: widget.orderId,
        dio: dio,
        onClose: () => Navigator.of(ctx).pop(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final orderNumber = widget.orderNumber;
    final payMethod   = widget.payMethod;
    final c = GColors.of(context);
    return Scaffold(
      backgroundColor: c.bg0,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            children: [
              // ── Top content (horizontal 24 padding) ───────────────────────
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Column(children: [
              const Gap(40),

              // ── Animated checkmark ring ──────────────────────────────────
              Stack(
                alignment: Alignment.center,
                children: [
                  // Outer ring
                  Container(
                    width: 120, height: 120,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                          color: GColors.brand.withValues(alpha: 0.15), width: 1),
                    ),
                  )
                      .animate()
                      .scale(begin: const Offset(0.3, 0.3), duration: 900.ms, curve: Curves.easeOut)
                      .fadeIn(duration: 600.ms),

                  // Brand circle with check — origin of the coin-fly burst
                  Container(
                    key: _checkKey,
                    width: 80, height: 80,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: GColors.brand,
                    ),
                    child: const Icon(Icons.check_rounded, color: Colors.white, size: 42),
                  )
                      .animate(delay: 300.ms)
                      .scale(begin: const Offset(0, 0), duration: 600.ms, curve: Curves.elasticOut)
                      .fadeIn(duration: 300.ms),
                ],
              ),

              const Gap(36),

              // ── Title ────────────────────────────────────────────────────
              Text(
                'Order Placed! 🎉',
                style: GoogleFonts.inter(
                  fontSize: 30, fontWeight: FontWeight.w900,
                  color: c.text0, letterSpacing: -1,
                ),
                textAlign: TextAlign.center,
              )
                  .animate(delay: 500.ms)
                  .fadeIn(duration: 500.ms)
                  .slideY(begin: 0.2, end: 0, duration: 500.ms),

              const Gap(10),

              Text(
                'Your gifts are on their way 🎁',
                style: GoogleFonts.inter(fontSize: 15, color: c.text1),
                textAlign: TextAlign.center,
              )
                  .animate(delay: 600.ms)
                  .fadeIn(duration: 400.ms),

              const Gap(36),

              // ── Order details card ────────────────────────────────────────
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: c.bg1,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  children: [
                    _DetailRow(
                      label: 'Order Number',
                      value: '#$orderNumber',
                      valueStyle: GoogleFonts.inter(
                        fontSize: 16, fontWeight: FontWeight.w800, color: c.text0,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const Gap(14),
                    Divider(color: c.border, height: 1),
                    const Gap(14),
                    _DetailRow(
                      label: 'Payment',
                      value: payMethod,
                    ),
                    const Gap(10),
                    _DetailRow(
                      label: 'Status',
                      value: 'Confirmed',
                      valueStyle: GoogleFonts.inter(
                        fontSize: 14, fontWeight: FontWeight.w600,
                        color: const Color(0xFF22C55E),
                      ),
                    ),
                  ],
                ),
              )
                  .animate(delay: 700.ms)
                  .fadeIn(duration: 500.ms)
                  .slideY(begin: 0.1, end: 0, duration: 400.ms),

              // Scratch card launches as full-screen modal (see _showScratchModal)

              const Gap(28),

              // ── Goins earned nudge ────────────────────────────────────────
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: GColors.gold.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: GColors.gold.withValues(alpha: 0.25)),
                ),
                child: Row(
                  children: [
                    const Text('🪙', style: TextStyle(fontSize: 22)),
                    const Gap(12),
                    Expanded(
                      child: Text(
                        'You earned Goins on this order! Check your Goins wallet.',
                        style: GoogleFonts.inter(fontSize: 13, color: c.text1, height: 1.4),
                      ),
                    ),
                  ],
                ),
              )
                  .animate(delay: 900.ms)
                  .fadeIn(duration: 400.ms),
                ]),
              ),

              const Gap(32),

              // ── Post-purchase upsell ("People also love…") ───────────────
              PostPurchaseUpsell(orderId: widget.orderId),

              const Gap(28),

              // ── CTAs ──────────────────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Column(
                  children: [
                    // WhatsApp share button
                    GestureDetector(
                      onTap: () {
                        HapticFeedback.lightImpact();
                        Analytics.track('order_whatsapp_share',
                            {'orderNumber': widget.orderNumber});
                        final text = Uri.encodeComponent(
                          'My Gifteeng order #${widget.orderNumber} is confirmed! 🎁',
                        );
                        launchUrl(
                          Uri.parse('https://wa.me/?text=$text'),
                          mode: LaunchMode.externalApplication,
                        );
                      },
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 20, vertical: 14),
                        decoration: BoxDecoration(
                          color: const Color(0xFF25D366),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Text('💬',
                                style: TextStyle(fontSize: 18)),
                            const Gap(10),
                            Text('Share on WhatsApp',
                                style: GoogleFonts.inter(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                )),
                          ],
                        ),
                      ),
                    )
                        .animate(delay: 950.ms)
                        .fadeIn(duration: 400.ms)
                        .slideY(begin: 0.1, end: 0, duration: 300.ms),

                    const Gap(12),

                    GButton(
                      label: 'Continue Shopping',
                      onPressed: () => context.go('/'),
                    ).animate(delay: 1000.ms).fadeIn(duration: 400.ms),

                    const Gap(12),

                    TextButton(
                      onPressed: () => context.go('/account'),
                      child: Text(
                        'View My Orders',
                        style: GoogleFonts.inter(
                          fontSize: 14, fontWeight: FontWeight.w600, color: c.text1,
                        ),
                      ),
                    ).animate(delay: 1100.ms).fadeIn(duration: 400.ms),
                  ],
                ),
              ),

              const Gap(24),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Full-screen scratch card modal ──────────────────────────────────────────

class _ScratchCardModal extends StatefulWidget {
  final String orderId;
  final Dio dio;
  final VoidCallback onClose;
  const _ScratchCardModal({
    required this.orderId,
    required this.dio,
    required this.onClose,
  });
  @override
  State<_ScratchCardModal> createState() => _ScratchCardModalState();
}

class _ScratchCardModalState extends State<_ScratchCardModal> {
  String? _rewardType;
  String? _rewardValue;
  bool _loading = false;
  bool _revealed = false;

  Future<void> _claimReward() async {
    if (_loading || _revealed) return;
    setState(() => _loading = true);
    try {
      final res = await widget.dio.post(
        '/games/scratch',
        queryParameters: {'triggerRef': widget.orderId},
      );
      final type  = (res.data['rewardType']  ?? '').toString();
      final value = (res.data['rewardValue'] ?? '').toString();
      if (mounted) {
        setState(() { _rewardType = type; _rewardValue = value; _revealed = true; _loading = false; });
        HapticFeedback.heavyImpact();
        Analytics.track('scratch_card_revealed', {'type': type, 'value': value, 'orderId': widget.orderId});
      }
    } catch (_) {
      // Show a fallback reward so the reveal is never anti-climactic
      if (mounted) setState(() { _rewardType = 'goins'; _rewardValue = '10'; _revealed = true; _loading = false; });
    }
  }

  String get _rewardHeading {
    switch (_rewardType) {
      case 'goins':        return '+${_rewardValue} Goins! 🪙';
      case 'discount':     return '${_rewardValue}% OFF! 🎊';
      case 'free_product': return 'Free Gift! 🎁';
      case 'miss':         return 'Better luck next time 🤞';
      default:             return 'You won! 🎉';
    }
  }

  String get _rewardSub {
    switch (_rewardType) {
      case 'goins':        return 'Goins credited to your wallet';
      case 'discount':     return 'Discount applied to your next order';
      case 'free_product': return 'Check your orders for details';
      case 'miss':         return 'Try again on your next order';
      default:             return 'Applied to your account';
    }
  }

  @override
  Widget build(BuildContext context) {
    final screenH = MediaQuery.of(context).size.height;
    return Material(
      color: Colors.transparent,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            // ── Close button ─────────────────────────────────────────────────
            Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(0, 16, 20, 0),
                child: GestureDetector(
                  onTap: widget.onClose,
                  child: Container(
                    width: 34, height: 34,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.15),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.close_rounded, color: Colors.white, size: 17),
                  ),
                ),
              ),
            ),

            const Spacer(),

            // ── Sparkle decorations ───────────────────────────────────────────
            const Text('✦ ✧ ✦', style: TextStyle(color: Color(0xFFF59E0B), fontSize: 18, letterSpacing: 8)),
            const Gap(14),

            // ── Headings ─────────────────────────────────────────────────────
            Text('Congratulations',
              style: GoogleFonts.inter(
                fontSize: 30, fontWeight: FontWeight.w900,
                color: Colors.white, letterSpacing: -0.5),
              textAlign: TextAlign.center,
            ),
            const Gap(6),
            Text('You have won a scratch card',
              style: GoogleFonts.inter(fontSize: 14, color: Colors.white54),
              textAlign: TextAlign.center,
            ),

            SizedBox(height: screenH * 0.05),

            // ── Scratch card ──────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(22),
                child: Scratcher(
                  brushSize: 44,
                  threshold: 45,
                  color: const Color(0xFF9333EA),
                  onThreshold: _claimReward,
                  child: Container(
                    width: double.infinity,
                    height: 220,
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Color(0xFF7C3AED), Color(0xFFEC4899)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                    ),
                    child: _revealed
                      ? Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(_rewardHeading,
                              style: GoogleFonts.inter(
                                fontSize: 26, fontWeight: FontWeight.w900,
                                color: Colors.white),
                              textAlign: TextAlign.center,
                            ),
                            const Gap(8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(_rewardSub,
                                style: GoogleFonts.inter(fontSize: 12, color: Colors.white.withValues(alpha: 0.9))),
                            ),
                          ],
                        )
                      : Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Text('👇', style: TextStyle(fontSize: 42)),
                            const Gap(6),
                            Text('Scratch HERE',
                              style: GoogleFonts.inter(
                                fontSize: 22, fontWeight: FontWeight.w900,
                                color: Colors.white, letterSpacing: 1.5)),
                            const Gap(4),
                            Text('gifteeng.com',
                              style: GoogleFonts.inter(fontSize: 11, color: Colors.white60)),
                          ],
                        ),
                  ),
                ),
              ),
            ),

            SizedBox(height: screenH * 0.04),

            // ── CTA ───────────────────────────────────────────────────────────
            if (_revealed)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 28),
                child: GestureDetector(
                  onTap: widget.onClose,
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    decoration: BoxDecoration(
                      color: GColors.brand,
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: [
                        BoxShadow(
                          color: GColors.brand.withValues(alpha: 0.4),
                          blurRadius: 16, offset: const Offset(0, 4)),
                      ],
                    ),
                    child: Text('Claim now',
                      style: GoogleFonts.inter(
                        fontSize: 15, fontWeight: FontWeight.w900,
                        color: Colors.white),
                      textAlign: TextAlign.center),
                  ),
                ),
              )
            else
              TextButton(
                onPressed: widget.onClose,
                child: Text('Skip for now',
                  style: GoogleFonts.inter(fontSize: 13, color: Colors.white38)),
              ),

            const Spacer(),
          ],
        ),
      ),
    );
  }
}

// ─── Detail row ───────────────────────────────────────────────────────────────

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  final TextStyle? valueStyle;
  const _DetailRow({required this.label, required this.value, this.valueStyle});

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: GoogleFonts.inter(fontSize: 13, color: c.text1)),
        Text(
          value,
          style: valueStyle ?? GoogleFonts.inter(
            fontSize: 14, fontWeight: FontWeight.w600, color: c.text0,
          ),
        ),
      ],
    );
  }
}
