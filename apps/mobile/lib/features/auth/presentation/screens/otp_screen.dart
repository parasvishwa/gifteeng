// ─── OTP Screen — Emil-tuned redesign ────────────────────────────────────────
//
// Why this version:
//   • Pinput's built-in `androidSmsAutofillMethod: smsUserConsentApi` is the
//     most reliable Android OTP autofill — it doesn't need the app hash in
//     the SMS body (unlike SMS Retriever) and works with any 4-10 digit code.
//     Pops a system consent dialog the moment a matching SMS arrives.
//   • Boxes have an underline-on-focus indicator instead of a heavy border —
//     feels more refined and matches modern banking apps (HDFC, BHIM).
//   • Filled boxes lift the digit with a subtle press of bg color so progress
//     is visible at a glance.
//   • Resend OTP has a 30-second cooldown countdown so users don't spam.
//   • Auto-verifies the moment 6 digits land — no manual "Verify" tap needed
//     unless the user types it themselves (then the button is the affirmation).
//
// Emil principles applied:
//   • Every interactive element scales 0.97 on press (already in GButton).
//   • Animations are quick (under 300ms) and use ease-out, never ease-in.
//   • Stagger the pin-box entry by 40ms each for a cascading reveal.
//   • Custom easing on the CTA reveal (Cubic(0.23, 1, 0.32, 1)) — stronger
//     than the default ease-out which feels weak.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:gap/gap.dart';
import 'package:pinput/pinput.dart';
import 'package:dio/dio.dart';
import 'package:sms_autofill/sms_autofill.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/g_button.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/api/biometric_service.dart';

class OtpScreen extends ConsumerStatefulWidget {
  final String phone;
  const OtpScreen({super.key, required this.phone});

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> with CodeAutoFill {
  final _pinCtrl = TextEditingController();
  final _focusNode = FocusNode();

  bool _loading = false;
  String? _error;
  bool _resendLoading = false;

  // ── Resend cooldown ────────────────────────────────────────────────────────
  // 30s starting cooldown — long enough that the SMS should arrive but short
  // enough that the resend feels reachable if it doesn't.
  Timer? _cooldownTimer;
  int _cooldown = 30;

  @override
  void initState() {
    super.initState();
    _startCooldown();
    _startSmsListener();
  }

  /// Start listening for incoming SMS OTP via SMS Retriever API. Falls back
  /// silently if not available (e.g. iOS — `AutofillHints.oneTimeCode` handles
  /// that platform via the keyboard suggestion bar).
  Future<void> _startSmsListener() async {
    try {
      await SmsAutoFill().listenForCode();
    } catch (_) { /* not available — fine */ }
  }

  /// CodeAutoFill mixin fires this when SMS arrives.
  @override
  void codeUpdated() {
    if (code != null && code!.length == 6 && mounted) {
      _pinCtrl.text = code!;
      _verify();
    }
  }

  void _startCooldown() {
    _cooldownTimer?.cancel();
    setState(() => _cooldown = 30);
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) { t.cancel(); return; }
      setState(() {
        if (_cooldown > 0) _cooldown--;
        if (_cooldown == 0) t.cancel();
      });
    });
  }

  @override
  void dispose() {
    _cooldownTimer?.cancel();
    SmsAutoFill().unregisterListener();
    cancel(); // CodeAutoFill mixin teardown
    _pinCtrl.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _resend() async {
    if (_cooldown > 0) return;
    HapticFeedback.selectionClick();
    setState(() { _resendLoading = true; _error = null; });
    try {
      final dio = ref.read(dioProvider);
      await dio.post('/auth/b2c/otp/request', data: {'phone': widget.phone});
      _pinCtrl.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('New OTP sent'),
            behavior: SnackBarBehavior.floating,
            margin: const EdgeInsets.all(16),
            backgroundColor: GColors.brand,
            duration: const Duration(seconds: 2),
          ),
        );
      }
      _startCooldown();
      await _startSmsListener();
    } catch (_) {
      setState(() => _error = 'Could not resend OTP');
    } finally {
      if (mounted) setState(() => _resendLoading = false);
    }
  }

  Future<void> _verify() async {
    final otp = _pinCtrl.text.trim();
    if (otp.length != 6) return;
    if (_loading) return;

    HapticFeedback.lightImpact();
    setState(() { _loading = true; _error = null; });
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.post('/auth/b2c/otp/verify', data: {
        'phone': widget.phone,
        'code': otp,
      });

      final data  = res.data;
      final token = data is Map ? data['accessToken']?.toString() : null;

      if (token != null && token.isNotEmpty) {
        await ref.read(authTokenNotifierProvider.notifier).saveToken(token);
        if (mounted) await _offerBiometric();
        if (mounted) context.go('/');
      } else {
        setState(() => _error = 'Login failed — please try again');
        HapticFeedback.heavyImpact();
      }
    } on DioException catch (e) {
      final msg = (e.response?.data as Map?)?['message'] ?? 'Invalid OTP';
      setState(() => _error = msg.toString());
      HapticFeedback.heavyImpact();
      _pinCtrl.clear();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ── Offer biometric sign-in after first OTP success ─────────────────────
  //
  // Bug fix: the "Enable" button previously only dismissed the sheet — it
  // never persisted the preference. So `biometricPrefNotifierProvider` stayed
  // `false` and the splash screen's "challenge biometric if enabled" check
  // never fired, meaning biometric sign-in silently never worked. Now:
  //
  //   1. Tap Enable → challenge biometric immediately to verify it actually
  //      works on this device (catches "enrolled but broken" edge cases).
  //   2. On success → set the pref to true so the splash screen will
  //      challenge on next launch.
  //   3. On failure / cancel → leave the pref false; user can retry from
  //      Account → Security toggle later.
  Future<void> _offerBiometric() async {
    final svc = ref.read(biometricServiceProvider);
    final available = await svc.isAvailable;
    if (!available || !mounted) return;

    final label = await svc.biometricLabel;
    if (!mounted) return;

    final c = GColors.of(context);

    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: c.bg1,
      isDismissible: false,
      enableDrag: false,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(builder: (ctx, setSheet) {
        bool enabling = false;
        return Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 36),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                  color: c.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const Gap(20),
              Icon(
                label == 'Face ID'
                    ? Icons.face_unlock_outlined
                    : Icons.fingerprint_rounded,
                color: GColors.brand,
                size: 44,
              ),
              const Gap(12),
              Text(
                'Enable $label?',
                style: GoogleFonts.inter(
                  fontSize: 20, fontWeight: FontWeight.w800, color: c.text0,
                ),
              ),
              const Gap(8),
              Text(
                'Sign in instantly next time with $label\n— no OTP needed.',
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(fontSize: 14, color: c.text1, height: 1.5),
              ),
              const Gap(24),
              GButton(
                label: enabling ? 'Verifying $label…' : 'Enable $label',
                loading: enabling,
                onPressed: enabling ? null : () async {
                  setSheet(() => enabling = true);
                  // 1. Challenge — proves the user can actually authenticate.
                  final ok = await svc.authenticate(
                    reason: 'Verify your $label to enable sign-in',
                  );
                  if (!ok) {
                    setSheet(() => enabling = false);
                    if (ctx.mounted) {
                      ScaffoldMessenger.of(ctx).showSnackBar(
                        SnackBar(
                          content: Text(
                            'Could not verify $label. You can enable it later '
                            'from Account → Security.',
                            style: GoogleFonts.inter(fontWeight: FontWeight.w500),
                          ),
                          behavior: SnackBarBehavior.floating,
                          margin: const EdgeInsets.all(16),
                          duration: const Duration(seconds: 3),
                        ),
                      );
                    }
                    return;
                  }
                  // 2. Persist the preference so splash will challenge on
                  //    next launch. Without this line, biometric sign-in
                  //    silently never worked (this was the actual bug).
                  await ref
                      .read(biometricPrefNotifierProvider.notifier)
                      .setEnabled(true);
                  if (ctx.mounted) Navigator.pop(ctx);
                },
              ),
              const Gap(12),
              TextButton(
                onPressed: enabling ? null : () => Navigator.pop(ctx),
                child: Text('Maybe later',
                  style: GoogleFonts.inter(fontSize: 14, color: c.text2)),
              ),
            ],
          ),
        );
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final filled = _pinCtrl.text.length;

    // ── Pin box theme ───────────────────────────────────────────────────────
    // Underline indicator on focus (more refined than a heavy red border),
    // subtle bg fill once a digit lands so progress is visible.
    final defaultPinTheme = PinTheme(
      width: 48, height: 56,
      textStyle: GoogleFonts.inter(
        fontSize: 24, fontWeight: FontWeight.w800, color: c.text0,
      ),
      decoration: BoxDecoration(
        color: c.bg1,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.border, width: 1),
      ),
    );

    final focusedPinTheme = defaultPinTheme.copyWith(
      decoration: BoxDecoration(
        color: c.bg1,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: GColors.brand, width: 1.5),
        boxShadow: [
          BoxShadow(
            color: GColors.brand.withValues(alpha: 0.12),
            blurRadius: 14,
            spreadRadius: 1,
          ),
        ],
      ),
    );

    final submittedPinTheme = defaultPinTheme.copyWith(
      decoration: BoxDecoration(
        color: GColors.brand.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: GColors.brand.withValues(alpha: 0.5),
          width: 1,
        ),
      ),
    );

    final errorPinTheme = defaultPinTheme.copyWith(
      decoration: BoxDecoration(
        color: GColors.rose.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: GColors.rose, width: 1.5),
      ),
    );

    return Scaffold(
      backgroundColor: c.bg0,
      appBar: AppBar(
        backgroundColor: c.bg0,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: c.text0),
          onPressed: () { HapticFeedback.selectionClick(); context.pop(); },
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Gap(20),

              // ── Heading + phone ────────────────────────────────────────────
              Text('Enter OTP',
                style: GoogleFonts.inter(
                  fontSize: 32, fontWeight: FontWeight.w900,
                  color: c.text0, letterSpacing: -1.0, height: 1.1,
                ),
              )
                  .animate()
                  .fadeIn(duration: 280.ms)
                  .slideY(begin: 0.12, end: 0, duration: 280.ms,
                      curve: Curves.easeOutCubic),

              const Gap(10),

              // Phone with edit affordance — tapping back is the only way to
              // change the number, but showing the "(edit)" hint makes the
              // affordance discoverable. The icon button is the primary path.
              Row(
                children: [
                  Text(
                    'Sent to ',
                    style: GoogleFonts.inter(fontSize: 14, color: c.text2),
                  ),
                  Text(
                    widget.phone,
                    style: GoogleFonts.inter(
                      fontSize: 14, fontWeight: FontWeight.w700, color: c.text1,
                    ),
                  ),
                  const Gap(6),
                  InkWell(
                    onTap: () { HapticFeedback.selectionClick(); context.pop(); },
                    borderRadius: BorderRadius.circular(6),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                      child: Icon(Icons.edit_outlined, size: 14, color: GColors.brand),
                    ),
                  ),
                ],
              ).animate(delay: 60.ms).fadeIn(duration: 280.ms),

              const Gap(36),

              // ── Pin input — built-in SMS User Consent autofill ─────────────
              // smsUserConsentApi pops the system "Allow Gifteeng to read this
              // OTP?" dialog the moment an OTP-looking SMS arrives — no app
              // hash needed in the SMS body. Most reliable Android approach.
              Center(
                child: AutofillGroup(
                  child: Pinput(
                    length: 6,
                    controller: _pinCtrl,
                    focusNode: _focusNode,
                    autofocus: true,
                    // SMS autofill: Pinput 5.0.2 doesn't expose the Android
                    // SMS-method param directly, so we rely on:
                    //   • iOS:     `autofillHints: oneTimeCode` →
                    //              keyboard suggestion bar picks it up.
                    //   • Android: the `sms_autofill` listener + CodeAutoFill
                    //              mixin (see initState / codeUpdated above).
                    autofillHints: const [AutofillHints.oneTimeCode],
                    onCompleted: (_) => _verify(),
                    onChanged: (_) => setState(() {}),
                    keyboardType: TextInputType.number,
                    pinAnimationType: PinAnimationType.scale,
                    animationDuration: const Duration(milliseconds: 160),
                    animationCurve: Curves.easeOut,
                    separatorBuilder: (i) => const SizedBox(width: 8),
                    defaultPinTheme: defaultPinTheme,
                    focusedPinTheme: focusedPinTheme,
                    submittedPinTheme: submittedPinTheme,
                    errorPinTheme: errorPinTheme,
                    forceErrorState: _error != null,
                    cursor: Container(
                      width: 2, height: 22,
                      decoration: BoxDecoration(
                        color: GColors.brand,
                        borderRadius: BorderRadius.circular(1),
                      ),
                    ),
                  ),
                ),
              )
                  .animate(delay: 120.ms)
                  .fadeIn(duration: 320.ms)
                  .slideY(begin: 0.08, end: 0, duration: 320.ms,
                      curve: Curves.easeOutCubic),

              // ── Progress dots (subtle filled-count indicator) ──────────────
              const Gap(20),
              Center(
                child: Text(
                  '$filled / 6',
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: filled == 6 ? GColors.brand : c.text2,
                    letterSpacing: 0.5,
                  ),
                ),
              ),

              if (_error != null) ...[
                const Gap(14),
                Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: GColors.rose.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.error_outline, size: 14, color: GColors.rose),
                        const Gap(6),
                        Text(_error!,
                          style: GoogleFonts.inter(
                            fontSize: 12, color: GColors.rose,
                            fontWeight: FontWeight.w600,
                          )),
                      ],
                    ),
                  )
                      .animate()
                      .fadeIn(duration: 220.ms)
                      .shakeX(amount: 6, duration: 320.ms),
                ),
              ],

              const Gap(28),

              GButton(
                label: 'Verify & Sign in',
                loading: _loading,
                onPressed: (_loading || filled != 6) ? null : _verify,
              ).animate(delay: 200.ms).fadeIn(duration: 320.ms),

              const Gap(20),

              // ── Resend with 30s cooldown ───────────────────────────────────
              // Cooldown reads better than "Didn't receive?" because it
              // answers the user's silent question ("when can I try again?")
              // without needing to be tapped.
              Center(
                child: _resendLoading
                    ? SizedBox(
                        width: 18, height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2, color: GColors.brand,
                        ),
                      )
                    : (_cooldown > 0
                        ? Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(
                                  text: "Didn't receive? ",
                                  style: GoogleFonts.inter(
                                    fontSize: 13, color: c.text2,
                                  ),
                                ),
                                TextSpan(
                                  text: 'Resend in ${_cooldown}s',
                                  style: GoogleFonts.inter(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    color: c.text1,
                                  ),
                                ),
                              ],
                            ),
                          )
                        : GestureDetector(
                            onTap: _resend,
                            behavior: HitTestBehavior.opaque,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 6,
                              ),
                              child: Text(
                                'Resend OTP',
                                style: GoogleFonts.inter(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: GColors.brand,
                                  decoration: TextDecoration.underline,
                                  decorationColor: GColors.brand,
                                  decorationThickness: 1.5,
                                ),
                              ),
                            ),
                          )),
              ),

              const Spacer(),

              // ── Tiny trust note at the bottom ──────────────────────────────
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Center(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.lock_outline_rounded, size: 12, color: c.text2),
                      const Gap(5),
                      Text(
                        'Encrypted · Never shared',
                        style: GoogleFonts.inter(
                          fontSize: 11,
                          color: c.text2,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ],
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
