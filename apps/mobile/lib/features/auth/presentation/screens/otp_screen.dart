import 'package:flutter/material.dart';
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
  bool _loading = false;
  String? _error;
  bool _resendLoading = false;

  @override
  void initState() {
    super.initState();
    _startSmsListener();
  }

  /// Start listening for incoming SMS OTP.
  Future<void> _startSmsListener() async {
    try {
      await SmsAutoFill().listenForCode();
    } catch (_) {
      // SMS autofill not available on this device — that's fine
    }
  }

  /// Called by CodeAutoFill mixin when an OTP code is detected in SMS.
  @override
  void codeUpdated() {
    if (code != null && code!.length == 6 && mounted) {
      _pinCtrl.text = code!;
      // Auto-verify once filled
      _verify();
    }
  }

  @override
  void dispose() {
    SmsAutoFill().unregisterListener();
    _pinCtrl.dispose();
    cancel(); // cancel CodeAutoFill
    super.dispose();
  }

  Future<void> _resend() async {
    setState(() { _resendLoading = true; _error = null; });
    try {
      final dio = ref.read(dioProvider);
      await dio.post('/auth/b2c/otp/request', data: {'phone': widget.phone});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('OTP resent!')),
        );
      }
      // Restart listener for the new OTP.
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
    if (_loading) return; // prevent double-trigger from autofill

    setState(() { _loading = true; _error = null; });
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.post('/auth/b2c/otp/verify', data: {
        'phone': widget.phone,
        'code': otp,
      });

      // Server returns { accessToken, audience, expiresIn }
      final data  = res.data;
      final token = data is Map ? data['accessToken']?.toString() : null;

      if (token != null && token.isNotEmpty) {
        await ref.read(authTokenNotifierProvider.notifier).saveToken(token);
        // Offer biometric enrollment before navigating home.
        if (mounted) await _offerBiometric();
        if (mounted) context.go('/');
      } else {
        setState(() => _error = 'Login failed — please try again');
      }
    } on DioException catch (e) {
      final msg = (e.response?.data as Map?)?['message'] ?? 'Invalid OTP';
      setState(() => _error = msg.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// After first-time OTP login, show a sheet asking if the user wants
  /// to enable biometric sign-in for next time.
  Future<void> _offerBiometric() async {
    final svc = ref.read(biometricServiceProvider);
    final available = await svc.isAvailable;
    if (!available || !mounted) return;

    final label = await svc.biometricLabel;
    if (!mounted) return;

    final _c = GColors.of(context);

    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: _c.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 36),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40, height: 4,
              decoration: BoxDecoration(
                color: _c.border,
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
                fontSize: 20, fontWeight: FontWeight.w800, color: _c.text0,
              ),
            ),
            const Gap(8),
            Text(
              'Sign in instantly next time with $label\n— no OTP needed.',
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(fontSize: 14, color: _c.text1, height: 1.5),
            ),
            const Gap(24),
            GButton(
              label: 'Enable $label',
              onPressed: () => Navigator.pop(ctx),
            ),
            const Gap(12),
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: Text('Maybe later',
                style: GoogleFonts.inter(fontSize: 14, color: _c.text2)),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final _c = GColors.of(context);

    final defaultPinTheme = PinTheme(
      width: 52, height: 58,
      textStyle: GoogleFonts.inter(
        fontSize: 22, fontWeight: FontWeight.w800, color: _c.text0,
      ),
      decoration: BoxDecoration(
        color: _c.bg1,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _c.border, width: 1.5),
      ),
    );

    return Scaffold(
      backgroundColor: _c.bg0,
      appBar: AppBar(
        backgroundColor: _c.bg0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: _c.text0),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Gap(32),

              Text('Enter OTP', style: GoogleFonts.inter(
                fontSize: 32, fontWeight: FontWeight.w900,
                color: _c.text0, letterSpacing: -1.2,
              ))
                  .animate()
                  .fadeIn(duration: 400.ms)
                  .slideY(begin: 0.2, end: 0, duration: 400.ms),

              const Gap(8),
              Text(
                'Sent to ${widget.phone}',
                style: GoogleFonts.inter(fontSize: 15, color: _c.text1),
              ).animate(delay: 100.ms).fadeIn(duration: 400.ms),

              const Gap(40),

              // Wrap Pinput in AutofillGroup so Android keyboard suggests OTP.
              Center(
                child: AutofillGroup(
                  child: Pinput(
                    length: 6,
                    controller: _pinCtrl,
                    autofocus: true,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    onCompleted: (_) => _verify(),
                    defaultPinTheme: defaultPinTheme,
                    focusedPinTheme: defaultPinTheme.copyWith(
                      decoration: defaultPinTheme.decoration!.copyWith(
                        border: Border.all(color: GColors.brand, width: 2),
                      ),
                    ),
                    submittedPinTheme: defaultPinTheme.copyWith(
                      decoration: defaultPinTheme.decoration!.copyWith(
                        color: _c.bg2,
                      ),
                    ),
                  ),
                ),
              )
                  .animate(delay: 200.ms)
                  .fadeIn(duration: 400.ms)
                  .scale(
                    begin: const Offset(0.9, 0.9),
                    duration: 400.ms,
                    curve: Curves.elasticOut,
                  ),

              if (_error != null) ...[
                const Gap(16),
                Center(
                  child: Text(_error!,
                    style: GoogleFonts.inter(fontSize: 13, color: GColors.rose)),
                ).animate().fadeIn(duration: 300.ms).shakeX(),
              ],

              const Gap(40),

              GButton(
                label: 'Verify & Sign in',
                loading: _loading,
                onPressed: _loading ? null : _verify,
              ).animate(delay: 300.ms).fadeIn(duration: 400.ms),

              const Gap(24),

              Center(
                child: TextButton(
                  onPressed: _resendLoading ? null : _resend,
                  child: _resendLoading
                      ? SizedBox(
                          width: 16, height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2, color: GColors.brand),
                        )
                      : Text("Didn't receive? Resend OTP",
                          style: GoogleFonts.inter(fontSize: 13, color: _c.text1)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
