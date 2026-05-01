import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:gap/gap.dart';
import 'package:dio/dio.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/services/audio_service.dart';

// ─── Theme-aware colour helpers ───────────────────────────────────────────────

Color _bg(bool dark)      => dark ? const Color(0xFF060608) : Colors.white;
Color _surface(bool dark) => dark ? const Color(0xFF0E0E14) : const Color(0xFFF4F4F6);
Color _border(bool dark)  => dark ? const Color(0xFF1C1C26) : const Color(0xFFE4E4E7);
Color _text0(bool dark)   => dark ? const Color(0xFFF2F2F5) : const Color(0xFF0A0A0F);
Color _text1(bool dark)   => dark ? const Color(0xFF7A7A8C) : const Color(0xFF52525B);

// ─────────────────────────────────────────────────────────────────────────────

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen>
    with TickerProviderStateMixin {
  final _phoneCtrl = TextEditingController();
  bool _loading = false;
  String? _error;

  late final AnimationController _shimCtrl;

  @override
  void initState() {
    super.initState();
    _shimCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();
  }

  @override
  void dispose() {
    _phoneCtrl.dispose();
    _shimCtrl.dispose();
    super.dispose();
  }

  Future<void> _sendOtp() async {
    AudioService.instance.tap();
    HapticFeedback.lightImpact();
    final phone = _phoneCtrl.text.trim();
    if (phone.length != 10) {
      HapticFeedback.mediumImpact();
      setState(() => _error = 'Enter a valid 10-digit mobile number');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dio = ref.read(dioProvider);
      await dio.post('/auth/b2c/otp/request', data: {'phone': '+91$phone'});
      if (mounted) context.push('/auth/otp', extra: '+91$phone');
    } on DioException catch (e) {
      final msg =
          (e.response?.data as Map?)?['message'] ?? 'Failed to send OTP';
      setState(() => _error = msg.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark  = Theme.of(context).brightness == Brightness.dark;
    final bg    = _bg(dark);
    final t0    = _text0(dark);
    final t1    = _text1(dark);
    final bdr   = _border(dark);

    return Scaffold(
      backgroundColor: bg,
      resizeToAvoidBottomInset: true,
      body: Stack(
        children: [
          // ── Subtle grid overlay ────────────────────────────────────────────
          Positioned.fill(
            child: CustomPaint(painter: _OrbPainter(dark: dark)),
          ),

          // ── Content ────────────────────────────────────────────────────────
          SafeArea(
            child: SingleChildScrollView(
              physics: const BouncingScrollPhysics(),
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Gap(80),

                  // Logo mark
                  Center(child: _LogoMark(dark: dark))
                      .animate()
                      .scale(
                        begin: const Offset(0.5, 0.5),
                        duration: 900.ms,
                        curve: Curves.elasticOut,
                      )
                      .fadeIn(duration: 500.ms),

                  const Gap(56),

                  // Headline
                  Text(
                    'Your world of\ngifts awaits.',
                    style: GoogleFonts.playfairDisplay(
                      fontSize: 42,
                      fontWeight: FontWeight.w700,
                      color: t0,
                      height: 1.12,
                      letterSpacing: -0.5,
                    ),
                  )
                      .animate(delay: 160.ms)
                      .fadeIn(duration: 600.ms)
                      .slideY(
                        begin: 0.18,
                        end: 0,
                        duration: 600.ms,
                        curve: Curves.easeOut,
                      ),

                  const Gap(12),

                  Text(
                    'Sign in with your mobile number.',
                    style: GoogleFonts.inter(
                      fontSize: 15,
                      color: t1,
                      letterSpacing: 0.1,
                    ),
                  ).animate(delay: 240.ms).fadeIn(duration: 500.ms),

                  const Gap(52),

                  // Phone input
                  _PhoneInput(
                    controller: _phoneCtrl,
                    onSubmitted: _sendOtp,
                    dark: dark,
                  )
                      .animate(delay: 360.ms)
                      .fadeIn(duration: 500.ms)
                      .slideY(begin: 0.12, end: 0, duration: 500.ms),

                  // Error message
                  if (_error != null) ...[
                    const Gap(12),
                    _ErrorBanner(message: _error!),
                  ],

                  const Gap(24),

                  // CTA
                  _GoldCtaButton(
                    label: 'Continue with OTP',
                    loading: _loading,
                    onPressed: _loading ? null : _sendOtp,
                    shimCtrl: _shimCtrl,
                  )
                      .animate(delay: 460.ms)
                      .fadeIn(duration: 500.ms)
                      .slideY(begin: 0.1, end: 0, duration: 500.ms),

                  const Gap(40),

                  // Divider with label
                  Row(
                    children: [
                      Expanded(child: Container(height: 1, color: bdr)),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Text(
                          'Secure • Fast • Rewarding',
                          style: GoogleFonts.inter(
                            fontSize: 11,
                            color: t1.withValues(alpha: 0.6),
                            letterSpacing: 0.8,
                          ),
                        ),
                      ),
                      Expanded(child: Container(height: 1, color: bdr)),
                    ],
                  ).animate(delay: 560.ms).fadeIn(duration: 500.ms),

                  const Gap(28),

                  _FeaturePills(dark: dark)
                      .animate(delay: 640.ms)
                      .fadeIn(duration: 500.ms),

                  const Gap(40),

                  Center(
                    child: Text(
                      'By continuing, you agree to our\nTerms of Service & Privacy Policy',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.inter(
                        fontSize: 11,
                        color: t1.withValues(alpha: 0.5),
                        height: 1.7,
                      ),
                    ),
                  ).animate(delay: 700.ms).fadeIn(duration: 500.ms),

                  const Gap(32),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Atmospheric grid painter ─────────────────────────────────────────────────

class _OrbPainter extends CustomPainter {
  final bool dark;
  const _OrbPainter({required this.dark});

  @override
  void paint(Canvas canvas, Size size) {
    final linePaint = Paint()
      ..color = (dark ? Colors.white : Colors.black)
          .withValues(alpha: dark ? 0.018 : 0.04)
      ..strokeWidth = 0.5;
    const step = 40.0;
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), linePaint);
    }
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), linePaint);
    }
  }

  @override
  bool shouldRepaint(_OrbPainter old) => old.dark != dark;
}

// ─── Logo mark ────────────────────────────────────────────────────────────────

class _LogoMark extends StatelessWidget {
  final bool dark;
  const _LogoMark({required this.dark});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 120,
      height: 120,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: 108, height: 108,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: (dark ? Colors.white : Colors.black)
                    .withValues(alpha: dark ? 0.08 : 0.06),
                width: 1,
              ),
            ),
          ),
          ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: Image.asset(
              'assets/icon/icon.png',
              width: 68, height: 68,
              fit: BoxFit.cover,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Phone input ──────────────────────────────────────────────────────────────

class _PhoneInput extends StatefulWidget {
  final TextEditingController controller;
  final VoidCallback onSubmitted;
  final bool dark;
  const _PhoneInput({
    required this.controller,
    required this.onSubmitted,
    required this.dark,
  });

  @override
  State<_PhoneInput> createState() => _PhoneInputState();
}

class _PhoneInputState extends State<_PhoneInput> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final surface = _surface(widget.dark);
    final border  = _border(widget.dark);
    final t0      = _text0(widget.dark);
    final t1      = _text1(widget.dark);

    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      decoration: BoxDecoration(
        color: surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: _focused ? GColors.brand : border,
          width: _focused ? 1.5 : 1,
        ),
      ),
      child: Row(
        children: [
          // Country code prefix
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 20),
            child: Row(
              children: [
                const Text('🇮🇳', style: TextStyle(fontSize: 20)),
                const SizedBox(width: 8),
                Text(
                  '+91',
                  style: GoogleFonts.inter(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: t0,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(width: 14),
                Container(width: 1, height: 24, color: border),
              ],
            ),
          ),
          // Number field
          Expanded(
            child: Focus(
              onFocusChange: (f) => setState(() => _focused = f),
              child: TextField(
                controller: widget.controller,
                keyboardType: TextInputType.phone,
                maxLength: 10,
                onSubmitted: (_) => widget.onSubmitted(),
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                style: GoogleFonts.inter(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: t0,
                  letterSpacing: 3,
                ),
                cursorColor: GColors.brand,
                cursorWidth: 2,
                decoration: InputDecoration(
                  counterText: '',
                  hintText: '9876543210',
                  hintStyle: GoogleFonts.inter(
                    fontSize: 18,
                    color: t1.withValues(alpha: 0.4),
                    fontWeight: FontWeight.w400,
                    letterSpacing: 1,
                  ),
                  // Explicitly transparent so the container bg shows through
                  filled: true,
                  fillColor: Colors.transparent,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ),
          ),
          const Gap(18),
        ],
      ),
    );
  }
}

// ─── Error banner ─────────────────────────────────────────────────────────────

class _ErrorBanner extends StatelessWidget {
  final String message;
  const _ErrorBanner({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: GColors.rose.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: GColors.rose.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded, color: GColors.rose, size: 18),
          const Gap(10),
          Expanded(
            child: Text(
              message,
              style: GoogleFonts.inter(
                fontSize: 13,
                color: GColors.rose,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    )
        .animate()
        .fadeIn(duration: 300.ms)
        .shake(hz: 2.5, offset: const Offset(5, 0), duration: 400.ms);
  }
}

// ─── Brand CTA button ─────────────────────────────────────────────────────────

class _GoldCtaButton extends StatefulWidget {
  final String label;
  final bool loading;
  final VoidCallback? onPressed;
  final AnimationController shimCtrl;
  const _GoldCtaButton({
    required this.label,
    required this.loading,
    required this.shimCtrl,
    this.onPressed,
  });

  @override
  State<_GoldCtaButton> createState() => _GoldCtaButtonState();
}

class _GoldCtaButtonState extends State<_GoldCtaButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) {
        setState(() => _pressed = false);
        widget.onPressed?.call();
      },
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1.0,
        duration: const Duration(milliseconds: 120),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          height: 62,
          decoration: BoxDecoration(
            color: widget.onPressed != null
                ? GColors.brand
                : GColors.brand.withValues(alpha: 0.45),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Center(
            child: widget.loading
                ? const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.white,
                    ),
                  )
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        widget.label,
                        style: GoogleFonts.inter(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                          letterSpacing: 0.3,
                        ),
                      ),
                      const Gap(10),
                      const Icon(
                        Icons.arrow_forward_rounded,
                        color: Colors.white,
                        size: 20,
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

// ─── Feature pills ────────────────────────────────────────────────────────────

class _FeaturePills extends StatelessWidget {
  final bool dark;
  const _FeaturePills({required this.dark});

  @override
  Widget build(BuildContext context) {
    const pills = [
      ('🎁', 'Curated Gifts'),
      ('🪙', 'Earn Goins'),
      ('🎮', 'Play & Win'),
    ];

    final surface = _surface(dark);
    final border  = _border(dark);
    final t1      = _text1(dark);

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: pills.map((p) {
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: surface,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: border),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(p.$1, style: const TextStyle(fontSize: 13)),
                const Gap(6),
                Text(
                  p.$2,
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: t1,
                    letterSpacing: 0.2,
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}
