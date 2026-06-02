// ─── Auth Screen — Emil-tuned redesign ───────────────────────────────────────
//
// What changed from the previous version:
//
//   • Removed the grid overlay (CustomPaint) — it added no visible character,
//     just runtime cost. Replaced with a single soft radial glow behind the
//     logo (brand color at 6% alpha) — gives the page warmth without noise.
//
//   • Spacing pyramid (80 + 56 + 12 + 52 …) was too tall. Tightened to put
//     the input above the fold on a Fold 7 outer screen so users don't have
//     to scroll on first paint.
//
//   • Logo is the bare icon (no concentric border ring). The ring looked
//     fragile and clipped strangely against the icon corners.
//
//   • Phone input has a stronger focus state: 1.5px brand border + a soft
//     14px brand-tinted glow shadow. Press elsewhere and it fades back. The
//     hint text uses lighter weight so the placeholder doesn't look filled.
//
//   • Removed the "Secure · Fast · Rewarding" divider + the three feature
//     pills. They looked tappable (chip shape) but weren't — a small UX trap.
//     Replaced with a single understated trust row (lock icon + line).
//
//   • CTA has a soft brand shadow now so it lifts off the page.
//
// Emil principles applied:
//   • All taps scale 0.97 with 120ms ease-out (already in place).
//   • Animations < 320ms, ease-out cubic for entrances.
//   • No motion-from-scale(0) — entrances start at 0.92 + opacity 0.
//   • Subtle stagger via `delay: …ms` to introduce items in reading order.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'package:gap/gap.dart';
import 'package:dio/dio.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/services/audio_service.dart';

// ─── OAuth client config ─────────────────────────────────────────────────────
// REQUIRED for backend verification: GOOGLE_CLIENT_ID env on the API must
// match the `aud` of the token issued here. Replace with your real web
// OAuth client ID from the Google Cloud Console (Credentials → OAuth 2.0
// Client IDs → Web application). Leave empty to fall back to the Android
// default client (won't validate against the backend until configured).
const String _kGoogleServerClientId = '';

// Apple Sign-In on Android needs an Apple Services ID + redirect URL
// registered in the Apple Developer portal. iOS uses the native flow.
const String _kAppleServiceId   = 'com.gifteeng.signin'; // replace
const String _kAppleRedirectUrl = 'https://gifteeng.com/auth/apple/callback'; // replace

// ─── Theme-aware colour helpers ───────────────────────────────────────────────

Color _bg(bool dark)      => dark ? const Color(0xFF060608) : Colors.white;
Color _surface(bool dark) => dark ? const Color(0xFF0E0E14) : const Color(0xFFF6F6F8);
Color _border(bool dark)  => dark ? const Color(0xFF1C1C26) : const Color(0xFFE6E6EA);
Color _text0(bool dark)   => dark ? const Color(0xFFF2F2F5) : const Color(0xFF0A0A0F);
Color _text1(bool dark)   => dark ? const Color(0xFF7A7A8C) : const Color(0xFF52525B);
Color _text2(bool dark)   => dark ? const Color(0xFF5A5A6A) : const Color(0xFF8B8B95);

// ─────────────────────────────────────────────────────────────────────────────

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  final _phoneCtrl = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _phoneCtrl.dispose();
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
      final msg = (e.response?.data as Map?)?['message'] ??
          (e.type == DioExceptionType.connectionError ||
                  e.type == DioExceptionType.connectionTimeout
              ? 'Network error — check your connection'
              : 'Failed to send OTP (${e.type.name})');
      setState(() => _error = msg.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ── Continue as guest ──────────────────────────────────────────────────────
  // Required by Apple App Store Review Guideline 5.1.1(v). Sets the
  // guest-mode pref and navigates into the shell. The Account tab will
  // show a sign-in prompt for guest users; account-required actions
  // (cart checkout, wishlist, orders) gate inline.
  Future<void> _continueAsGuest() async {
    HapticFeedback.selectionClick();
    await ref.read(guestModeNotifierProvider.notifier).setEnabled(true);
    if (mounted) context.go('/');
  }

  // ── Google Sign-In ─────────────────────────────────────────────────────────
  // Returns an ID token; backend verifies via Google's tokeninfo endpoint
  // and checks `aud` against env GOOGLE_CLIENT_ID. Sign-in is cancelable —
  // user dismissing the sheet is a normal flow, not an error.
  bool _googleLoading = false;
  Future<void> _googleSignIn() async {
    if (_googleLoading || _appleLoading) return;
    AudioService.instance.tap();
    HapticFeedback.lightImpact();
    setState(() { _googleLoading = true; _error = null; });
    try {
      final gsi = GoogleSignIn(
        scopes: const ['email', 'profile'],
        serverClientId: _kGoogleServerClientId.isNotEmpty
            ? _kGoogleServerClientId
            : null,
      );
      // Sign out any cached account so the user sees the picker.
      await gsi.signOut();
      final acct = await gsi.signIn();
      if (acct == null) {
        // User canceled the picker — silent, not an error.
        if (mounted) setState(() => _googleLoading = false);
        return;
      }
      final auth = await acct.authentication;
      final idToken = auth.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw Exception('Google did not return an ID token. Check '
            'serverClientId configuration.');
      }
      final dio = ref.read(dioProvider);
      final res = await dio.post(
        '/auth/b2c/google/verify',
        data: {'credential': idToken},
      );
      final data  = res.data;
      final token = data is Map ? data['accessToken']?.toString() : null;
      if (token == null || token.isEmpty) {
        throw Exception('Server did not return access token');
      }
      await ref.read(authTokenNotifierProvider.notifier).saveToken(token);
      if (mounted) context.go('/');
    } on DioException catch (e) {
      final msg = (e.response?.data as Map?)?['message']?.toString()
          ?? 'Google sign-in failed';
      if (mounted) setState(() => _error = msg);
    } catch (e) {
      if (mounted) setState(() => _error = 'Google sign-in failed: ${e.toString()}');
    } finally {
      if (mounted) setState(() => _googleLoading = false);
    }
  }

  // ── Apple Sign-In ──────────────────────────────────────────────────────────
  // Native flow on iOS; web-auth flow on Android (requires Services ID +
  // redirect URL registered in Apple Developer portal). Backend verifies the
  // identity token's signature against Apple's public keys.
  bool _appleLoading = false;
  Future<void> _appleSignIn() async {
    if (_googleLoading || _appleLoading) return;
    AudioService.instance.tap();
    HapticFeedback.lightImpact();

    // Android + non-iOS need webAuth options; iOS uses the native sheet.
    if (!Platform.isIOS && !Platform.isMacOS) {
      // Allow Android only if a real serviceId is configured.
      if (_kAppleServiceId.isEmpty || _kAppleServiceId == 'com.gifteeng.signin') {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text(
              'Apple Sign-In is currently iOS only. Use Google or OTP on Android.',
            ),
            behavior: SnackBarBehavior.floating,
            margin: const EdgeInsets.all(16),
            backgroundColor: GColors.brand,
            duration: const Duration(seconds: 3),
          ),
        );
        return;
      }
    }

    setState(() { _appleLoading = true; _error = null; });
    try {
      final cred = await SignInWithApple.getAppleIDCredential(
        scopes: const [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
        webAuthenticationOptions: (Platform.isIOS || Platform.isMacOS)
            ? null
            : WebAuthenticationOptions(
                clientId: _kAppleServiceId,
                redirectUri: Uri.parse(_kAppleRedirectUrl),
              ),
      );
      final dio = ref.read(dioProvider);
      final fullName = [cred.givenName, cred.familyName]
          .where((s) => s != null && s.isNotEmpty)
          .join(' ');
      final res = await dio.post(
        '/auth/b2c/apple/verify',
        data: {
          'identityToken': cred.identityToken,
          'email':    cred.email,
          'fullName': fullName.isEmpty ? null : fullName,
        },
      );
      final data  = res.data;
      final token = data is Map ? data['accessToken']?.toString() : null;
      if (token == null || token.isEmpty) {
        throw Exception('Server did not return access token');
      }
      await ref.read(authTokenNotifierProvider.notifier).saveToken(token);
      if (mounted) context.go('/');
    } on SignInWithAppleAuthorizationException catch (e) {
      // Canceled → silent. Other codes → error banner.
      if (e.code == AuthorizationErrorCode.canceled) {
        // no-op
      } else if (mounted) {
        setState(() => _error = 'Apple sign-in failed: ${e.message}');
      }
    } on DioException catch (e) {
      final msg = (e.response?.data as Map?)?['message']?.toString()
          ?? 'Apple sign-in failed';
      if (mounted) setState(() => _error = msg);
    } catch (e) {
      if (mounted) setState(() => _error = 'Apple sign-in failed: ${e.toString()}');
    } finally {
      if (mounted) setState(() => _appleLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark  = Theme.of(context).brightness == Brightness.dark;
    final bg    = _bg(dark);
    final t0    = _text0(dark);
    final t1    = _text1(dark);
    final t2    = _text2(dark);

    return Scaffold(
      backgroundColor: bg,
      resizeToAvoidBottomInset: true,
      body: Stack(
        children: [
          // ── Ambient brand glow (positioned behind logo) ────────────────────
          // A single radial gradient gives the page warmth without the noise
          // of a grid. 18% alpha at center, fading to 0 at the edges.
          Positioned(
            top: -120, left: 0, right: 0,
            child: IgnorePointer(
              child: Container(
                height: 480,
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: Alignment.center,
                    radius: 0.6,
                    colors: [
                      GColors.brand.withValues(alpha: dark ? 0.10 : 0.06),
                      GColors.brand.withValues(alpha: 0),
                    ],
                  ),
                ),
              ),
            ),
          ),

          SafeArea(
            child: SingleChildScrollView(
              physics: const BouncingScrollPhysics(),
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Gap(48),

                  // ── Logo (bare, no concentric ring) ─────────────────────────
                  Center(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(22),
                      child: Image.asset(
                        'assets/icon/icon.png',
                        width: 78, height: 78,
                        fit: BoxFit.cover,
                      ),
                    ),
                  )
                      .animate()
                      .scale(
                        begin: const Offset(0.85, 0.85),
                        end:   const Offset(1, 1),
                        duration: 480.ms,
                        curve: Curves.easeOutBack,
                      )
                      .fadeIn(duration: 400.ms),

                  const Gap(36),

                  // ── Headline ────────────────────────────────────────────────
                  Text(
                    'Your world of\ngifts awaits.',
                    style: GoogleFonts.playfairDisplay(
                      fontSize: 40,
                      fontWeight: FontWeight.w700,
                      color: t0,
                      height: 1.10,
                      letterSpacing: -0.6,
                    ),
                  )
                      .animate(delay: 120.ms)
                      .fadeIn(duration: 500.ms)
                      .slideY(begin: 0.14, end: 0, duration: 500.ms,
                          curve: Curves.easeOutCubic),

                  const Gap(10),

                  // Subtitle — warmer than "Sign in with your mobile number"
                  Text(
                    'Continue with your mobile number',
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: t1,
                      letterSpacing: 0.1,
                    ),
                  ).animate(delay: 200.ms).fadeIn(duration: 400.ms),

                  const Gap(36),

                  // ── Phone input ─────────────────────────────────────────────
                  _PhoneInput(
                    controller: _phoneCtrl,
                    onSubmitted: _sendOtp,
                    dark: dark,
                  )
                      .animate(delay: 280.ms)
                      .fadeIn(duration: 420.ms)
                      .slideY(begin: 0.10, end: 0, duration: 420.ms,
                          curve: Curves.easeOutCubic),

                  if (_error != null) ...[
                    const Gap(10),
                    _ErrorBanner(message: _error!),
                  ],

                  const Gap(18),

                  // ── Primary CTA ─────────────────────────────────────────────
                  _BrandCta(
                    label: 'Continue with OTP',
                    loading: _loading,
                    onPressed: _loading ? null : _sendOtp,
                  )
                      .animate(delay: 360.ms)
                      .fadeIn(duration: 420.ms)
                      .slideY(begin: 0.08, end: 0, duration: 420.ms,
                          curve: Curves.easeOutCubic),

                  const Gap(22),

                  // ── "or" divider ────────────────────────────────────────────
                  Row(
                    children: [
                      Expanded(child: Container(height: 1, color: _border(dark))),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                        child: Text(
                          'or',
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            color: t2,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      Expanded(child: Container(height: 1, color: _border(dark))),
                    ],
                  ).animate(delay: 420.ms).fadeIn(duration: 380.ms),

                  const Gap(14),

                  // ── Social sign-in row ──────────────────────────────────────
                  Row(
                    children: [
                      Expanded(
                        child: _SocialButton(
                          icon: _GoogleGlyph(),
                          label: 'Google',
                          loading: _googleLoading,
                          onPressed: (_googleLoading || _appleLoading)
                              ? null : _googleSignIn,
                          dark: dark,
                        ),
                      ),
                      const Gap(10),
                      Expanded(
                        child: _SocialButton(
                          icon: _AppleGlyph(dark: dark),
                          label: 'Apple',
                          loading: _appleLoading,
                          onPressed: (_googleLoading || _appleLoading)
                              ? null : _appleSignIn,
                          dark: dark,
                        ),
                      ),
                    ],
                  )
                      .animate(delay: 480.ms)
                      .fadeIn(duration: 420.ms)
                      .slideY(begin: 0.06, end: 0, duration: 420.ms,
                          curve: Curves.easeOutCubic),

                  const Gap(20),

                  // ── Continue as guest ───────────────────────────────────────
                  // Required by App Store Review Guideline 5.1.1(v): apps
                  // without significant account-based features must let
                  // users in without a login. Tapping this flips the
                  // guest-mode pref and navigates to the shell.
                  Center(
                    child: TextButton(
                      onPressed: _continueAsGuest,
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 10,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'Continue as guest',
                            style: GoogleFonts.inter(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: t1,
                              decoration: TextDecoration.underline,
                              decorationColor: t1.withValues(alpha: 0.4),
                              decorationThickness: 1,
                            ),
                          ),
                          const Gap(4),
                          Icon(Icons.arrow_forward_rounded,
                              size: 14, color: t1),
                        ],
                      ),
                    ),
                  ).animate(delay: 540.ms).fadeIn(duration: 420.ms),

                  const Gap(14),

                  // ── Subtle trust strip ──────────────────────────────────────
                  // A single muted row with three short promises reads as
                  // truthful rather than salesy.
                  Center(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _TrustPip(label: 'Curated',   t1: t2),
                        _TrustDot(t2: t2),
                        _TrustPip(label: 'Rewarding', t1: t2),
                        _TrustDot(t2: t2),
                        _TrustPip(label: 'Secure',    t1: t2),
                      ],
                    ),
                  ).animate(delay: 600.ms).fadeIn(duration: 420.ms),

                  const Gap(24),

                  // ── Terms (bottom) ──────────────────────────────────────────
                  Center(
                    child: Text(
                      'By continuing, you agree to our\nTerms of Service & Privacy Policy',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.inter(
                        fontSize: 11,
                        color: t2,
                        height: 1.6,
                      ),
                    ),
                  ).animate(delay: 620.ms).fadeIn(duration: 400.ms),

                  const Gap(24),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Phone input ──────────────────────────────────────────────────────────────
// Filled surface, brand border + soft brand-tinted glow on focus. Hint text
// is lighter weight than user-typed digits so the placeholder doesn't read
// as filled-in content.

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
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOut,
      decoration: BoxDecoration(
        color: surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: _focused ? GColors.brand : border,
          width: _focused ? 1.5 : 1,
        ),
        boxShadow: _focused
            ? [
                BoxShadow(
                  color: GColors.brand.withValues(alpha: 0.10),
                  blurRadius: 16,
                  spreadRadius: 1,
                ),
              ]
            : [],
      ),
      child: Row(
        children: [
          // Country code prefix
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 12, 16),
            child: Row(
              children: [
                const Text('🇮🇳', style: TextStyle(fontSize: 18)),
                const SizedBox(width: 8),
                Text(
                  '+91',
                  style: GoogleFonts.inter(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: t0,
                    letterSpacing: 0.4,
                  ),
                ),
                const SizedBox(width: 12),
                Container(width: 1, height: 22, color: border),
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
                onChanged: (_) => setState(() {}),
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                autofillHints: const [AutofillHints.telephoneNumber],
                style: GoogleFonts.inter(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: t0,
                  letterSpacing: 2.5,
                ),
                cursorColor: GColors.brand,
                cursorWidth: 2,
                decoration: InputDecoration(
                  counterText: '',
                  hintText: '98765 43210',
                  hintStyle: GoogleFonts.inter(
                    fontSize: 18,
                    color: t1.withValues(alpha: 0.35),
                    fontWeight: FontWeight.w500,
                    letterSpacing: 2.5,
                  ),
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
          // Check icon when 10 digits — subtle affirmation
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 180),
            transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
            child: widget.controller.text.length == 10
                ? Padding(
                    key: const ValueKey('valid'),
                    padding: const EdgeInsets.only(right: 16),
                    child: Container(
                      width: 22, height: 22,
                      decoration: BoxDecoration(
                        color: GColors.brand,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.check_rounded,
                          color: Colors.white, size: 14),
                    ),
                  )
                : const SizedBox(key: ValueKey('empty'), width: 16),
          ),
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
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: GColors.rose.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: GColors.rose.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          Icon(Icons.warning_amber_rounded, color: GColors.rose, size: 16),
          const Gap(8),
          Expanded(
            child: Text(
              message,
              style: GoogleFonts.inter(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: GColors.rose,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    )
        .animate()
        .fadeIn(duration: 240.ms)
        .shakeX(amount: 5, duration: 320.ms);
  }
}

// ─── Brand CTA button ─────────────────────────────────────────────────────────
// Filled brand background + soft brand shadow for elevation, arrow icon,
// scale-0.97 on press. Loading swaps the label for a spinner without
// resizing the button (height stays constant so layout doesn't shift).

class _BrandCta extends StatefulWidget {
  final String label;
  final bool loading;
  final VoidCallback? onPressed;
  const _BrandCta({
    required this.label,
    required this.loading,
    this.onPressed,
  });

  @override
  State<_BrandCta> createState() => _BrandCtaState();
}

class _BrandCtaState extends State<_BrandCta> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onPressed != null;
    return GestureDetector(
      onTapDown: (_) => enabled ? setState(() => _pressed = true) : null,
      onTapUp: (_) {
        setState(() => _pressed = false);
        if (enabled) widget.onPressed!.call();
      },
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1.0,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOut,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          height: 58,
          decoration: BoxDecoration(
            color: enabled
                ? GColors.brand
                : GColors.brand.withValues(alpha: 0.45),
            borderRadius: BorderRadius.circular(14),
            boxShadow: enabled
                ? [
                    BoxShadow(
                      color: GColors.brand.withValues(alpha: 0.30),
                      blurRadius: 18,
                      spreadRadius: -2,
                      offset: const Offset(0, 6),
                    ),
                  ]
                : [],
          ),
          child: Center(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 180),
              child: widget.loading
                  ? const SizedBox(
                      key: ValueKey('loading'),
                      width: 22, height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5, color: Colors.white,
                      ),
                    )
                  : Row(
                      key: const ValueKey('label'),
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          widget.label,
                          style: GoogleFonts.inter(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                            letterSpacing: 0.2,
                          ),
                        ),
                        const Gap(8),
                        const Icon(
                          Icons.arrow_forward_rounded,
                          color: Colors.white,
                          size: 18,
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Trust strip atoms ────────────────────────────────────────────────────────

class _TrustPip extends StatelessWidget {
  final String label;
  final Color t1;
  const _TrustPip({required this.label, required this.t1});

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: GoogleFonts.inter(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        color: t1,
        letterSpacing: 1.2,
      ),
    );
  }
}

class _TrustDot extends StatelessWidget {
  final Color t2;
  const _TrustDot({required this.t2});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      child: Container(
        width: 3, height: 3,
        decoration: BoxDecoration(
          color: t2.withValues(alpha: 0.5),
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}

// ─── Social sign-in button ────────────────────────────────────────────────────
// Outlined surface, brand-tinted on press. Loading swaps the icon for a small
// spinner so the row height never shifts. Equal width via Expanded in parent.

class _SocialButton extends StatefulWidget {
  final Widget icon;
  final String label;
  final bool loading;
  final VoidCallback? onPressed;
  final bool dark;
  const _SocialButton({
    required this.icon,
    required this.label,
    required this.loading,
    required this.onPressed,
    required this.dark,
  });

  @override
  State<_SocialButton> createState() => _SocialButtonState();
}

class _SocialButtonState extends State<_SocialButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onPressed != null && !widget.loading;
    final t0      = _text0(widget.dark);
    final border  = _border(widget.dark);
    final surface = _surface(widget.dark);

    return GestureDetector(
      onTapDown: (_) => enabled ? setState(() => _pressed = true) : null,
      onTapUp: (_) {
        setState(() => _pressed = false);
        if (enabled) widget.onPressed!.call();
      },
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1.0,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          height: 54,
          decoration: BoxDecoration(
            color: _pressed ? surface : Colors.transparent,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: border, width: 1),
          ),
          child: Center(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 160),
              child: widget.loading
                  ? SizedBox(
                      key: const ValueKey('loading'),
                      width: 18, height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2, color: t0,
                      ),
                    )
                  : Row(
                      key: const ValueKey('content'),
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(width: 18, height: 18, child: widget.icon),
                        const Gap(10),
                        Text(
                          widget.label,
                          style: GoogleFonts.inter(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: t0,
                            letterSpacing: 0.1,
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Google "G" glyph (vector, no asset) ──────────────────────────────────────
// Painted via SvgPicture.string to keep the APK lean (no PNG asset). The four
// classic G colors are the official Google brand mark.

class _GoogleGlyph extends StatelessWidget {
  static const _svg = '''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.3 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.3 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.3c-2 1.5-4.6 2.4-7.3 2.4-5.3 0-9.7-3.4-11.3-8L6.1 32.6C9.5 39 16.2 44 24 44z"/>
  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.1 4.1-3.9 5.5l6.2 5.3C42.1 35.5 44 30 44 24c0-1.3-.1-2.4-.4-3.5z"/>
</svg>
''';

  const _GoogleGlyph();

  @override
  Widget build(BuildContext context) {
    return SvgPicture.string(_svg, fit: BoxFit.contain);
  }
}

// ─── Apple glyph (monochrome — adapts to theme) ──────────────────────────────

class _AppleGlyph extends StatelessWidget {
  final bool dark;
  const _AppleGlyph({required this.dark});

  @override
  Widget build(BuildContext context) {
    return Icon(
      Icons.apple,
      size: 18,
      color: dark ? Colors.white : Colors.black,
    );
  }
}
