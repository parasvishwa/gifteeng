// ─── Referral share screen ───────────────────────────────────────────────────
//
// Shows the user's referral code with prominent share buttons. Converts the
// current "Refer a Friend" menu line-item into a real growth loop.
//
// Backend contract (already live):
//   GET /referrals/me → { code, history: [{ refereeCustomerId, status, ... }] }
//
// Mobile UX:
//  - Gradient hero card: big code + copy button + "Share" CTA
//  - Stats row: friends joined · Goins earned
//  - How it works (3 steps)
//  - History list with status chips (pending / joined / earned)
//  - WhatsApp button uses url_launcher with wa.me/?text=...
//  - Generic share uses share_plus
//  - Deep link format: https://gifteeng.com/r/<CODE>
//
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/analytics/analytics_service.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';

const _kReferralUrlBase = 'https://gifteeng.com/r';
const _kReferralRewardPerJoin = 200; // Goins per accepted referral (both sides)

/// Returns { code, history } from /referrals/me — null on error/unauth.
final referralMeProvider = FutureProvider.autoDispose<Map<String, dynamic>?>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/referrals/me');
    final data = res.data;
    if (data is Map) return Map<String, dynamic>.from(data);
    return null;
  } catch (_) {
    return null;
  }
});

class ReferralScreen extends ConsumerStatefulWidget {
  const ReferralScreen({super.key});

  @override
  ConsumerState<ReferralScreen> createState() => _ReferralScreenState();
}

class _ReferralScreenState extends ConsumerState<ReferralScreen> {
  @override
  void initState() {
    super.initState();
    Analytics.screen('/referrals');
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(referralMeProvider);
    final c = GColors.of(context);

    return Scaffold(
      backgroundColor: c.bg0,
      appBar: AppBar(
        backgroundColor: c.bg0,
        elevation: 0,
        title: Text('Refer & Earn', style: GoogleFonts.inter(
          fontSize: 17, fontWeight: FontWeight.w800, color: c.text0,
        )),
        iconTheme: IconThemeData(color: c.text0),
      ),
      body: async.when(
        loading: () => const Center(
          child: CircularProgressIndicator(
            strokeWidth: 2.5,
            valueColor: AlwaysStoppedAnimation(GColors.brand),
          ),
        ),
        error: (_, __) => _errorState(c),
        data: (data) {
          if (data == null) return _errorState(c);
          final code = (data['code'] ?? '').toString();
          final history = (data['history'] as List?) ?? const [];
          return _content(context, c, code: code, history: history);
        },
      ),
    );
  }

  Widget _errorState(GColorsPalette c) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('🔒', style: TextStyle(fontSize: 42)),
          const Gap(8),
          Text('Sign in to get your referral code',
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(
              fontSize: 14, fontWeight: FontWeight.w700, color: c.text0,
            )),
        ],
      ),
    ),
  );

  Widget _content(BuildContext context, GColorsPalette c, {required String code, required List history}) {
    final joined = history
        .where((h) => h is Map && (h['refereeCustomerId'] ?? '').toString().isNotEmpty)
        .length;
    final earned = joined * _kReferralRewardPerJoin;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 24),
      children: [
        _heroCard(context, c, code),
        const Gap(14),
        _statsRow(c, joined: joined, earned: earned),
        const Gap(22),
        _shareRow(context, c, code: code),
        const Gap(28),
        _howItWorks(c),
        const Gap(28),
        if (history.isNotEmpty) ...[
          Text('Your referrals', style: GoogleFonts.inter(
            fontSize: 13, fontWeight: FontWeight.w700,
            color: c.text1, letterSpacing: 0.3,
          )),
          const Gap(10),
          ...history.whereType<Map>().map((h) =>
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _historyRow(c, Map<String, dynamic>.from(h)),
            )),
        ],
      ],
    );
  }

  Widget _heroCard(BuildContext context, GColorsPalette c, String code) {
    // Always use brand gradient so the card looks bold in both light & dark mode
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 22),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF7C3AED), Color(0xFFEF3752)],
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFEF3752).withValues(alpha: 0.25),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        children: [
          const Text('🎁', style: TextStyle(fontSize: 44)),
          const Gap(6),
          Text('Give ₹200, Get ₹200',
            style: GoogleFonts.inter(
              fontSize: 22, fontWeight: FontWeight.w900,
              color: Colors.white, letterSpacing: -0.4,
            )),
          const Gap(4),
          Text('Share your code — you both earn $_kReferralRewardPerJoin Goins.',
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(
              fontSize: 13, fontWeight: FontWeight.w500,
              color: Colors.white.withValues(alpha: 0.88),
            )),
          const Gap(18),
          // Code pill
          GestureDetector(
            onTap: () => _copyCode(code),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.95),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(code.isEmpty ? '—' : code,
                    style: GoogleFonts.inter(
                      fontSize: 18, fontWeight: FontWeight.w900,
                      color: const Color(0xFF1A1A2E), letterSpacing: 2,
                    )),
                  const Gap(10),
                  const Icon(Icons.content_copy_rounded, size: 15, color: Colors.black45),
                ],
              ),
            ),
          )
              .animate(onPlay: (c) => c.repeat(reverse: true))
              .scaleXY(begin: 1.0, end: 1.02, duration: 1100.ms, curve: Curves.easeInOut),
          const Gap(6),
          Text('Tap to copy', style: GoogleFonts.inter(
            fontSize: 10.5, color: Colors.white.withValues(alpha: 0.75),
            fontWeight: FontWeight.w600,
          )),
        ],
      ),
    );
  }

  Widget _statsRow(GColorsPalette c, {required int joined, required int earned}) {
    Widget cell(String label, String value, IconData icon, Color color) => Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: c.bg1,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: c.border),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 20),
            const Gap(4),
            Text(value, style: GoogleFonts.inter(
              fontSize: 20, fontWeight: FontWeight.w900, color: c.text0,
            )),
            Text(label, style: GoogleFonts.inter(
              fontSize: 10.5, fontWeight: FontWeight.w600, color: c.text2,
            )),
          ],
        ),
      ),
    );
    return Row(
      children: [
        cell('Friends joined', '$joined', Icons.group_rounded, const Color(0xFF8B5CF6)),
        const Gap(10),
        cell('Goins earned', '$earned', Icons.savings_rounded, GColors.gold),
      ],
    );
  }

  Widget _shareRow(BuildContext context, GColorsPalette c, {required String code}) {
    Widget btn(String label, IconData icon, Color color, VoidCallback onTap) => Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: 52,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: Colors.white, size: 18),
              const Gap(8),
              Text(label, style: GoogleFonts.inter(
                fontSize: 14, fontWeight: FontWeight.w800, color: Colors.white,
              )),
            ],
          ),
        ),
      ),
    );

    return Row(
      children: [
        btn('WhatsApp', Icons.chat_rounded, const Color(0xFF25D366),
          () => _shareWhatsApp(code)),
        const Gap(10),
        btn('More', Icons.share_rounded, GColors.brand, () => _shareGeneric(code)),
      ],
    );
  }

  Widget _howItWorks(GColorsPalette c) {
    final steps = [
      ('1', 'Share your code', 'Send via WhatsApp, SMS, or anywhere else.'),
      ('2', 'Friend signs up', 'They enter your code during signup.'),
      ('3', 'You both earn', 'You each get $_kReferralRewardPerJoin Goins after their first order.'),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('How it works', style: GoogleFonts.inter(
          fontSize: 13, fontWeight: FontWeight.w700,
          color: c.text1, letterSpacing: 0.3,
        )),
        const Gap(12),
        for (final s in steps) ...[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 26, height: 26,
                decoration: const BoxDecoration(
                  color: Color(0xFF6D28D9),
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text(s.$1, style: GoogleFonts.inter(
                  fontSize: 12, fontWeight: FontWeight.w900, color: Colors.white,
                )),
              ),
              const Gap(12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.$2, style: GoogleFonts.inter(
                      fontSize: 13, fontWeight: FontWeight.w700, color: c.text0,
                    )),
                    const Gap(2),
                    Text(s.$3, style: GoogleFonts.inter(
                      fontSize: 12, color: c.text2, height: 1.3,
                    )),
                  ],
                ),
              ),
            ],
          ),
          const Gap(14),
        ],
      ],
    );
  }

  Widget _historyRow(GColorsPalette c, Map<String, dynamic> h) {
    final status = (h['status'] ?? 'pending').toString();
    final refereeId = (h['refereeCustomerId'] ?? '').toString();
    final joined = refereeId.isNotEmpty;

    late Color chipColor;
    late String chipLabel;
    late IconData chipIcon;
    if (joined && status == 'rewarded') {
      chipColor = GColors.brand;
      chipLabel = 'Earned ✓';
      chipIcon = Icons.savings_rounded;
    } else if (joined) {
      chipColor = const Color(0xFF8B5CF6);
      chipLabel = 'Joined';
      chipIcon = Icons.person_add_alt_rounded;
    } else {
      chipColor = const Color(0xFF8B5CF6);
      chipLabel = 'Shared';
      chipIcon = Icons.outgoing_mail;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: c.bg1,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          Icon(chipIcon, size: 16, color: chipColor),
          const Gap(10),
          Expanded(
            child: Text(
              joined
                ? 'Friend #${refereeId.substring(0, refereeId.length.clamp(0, 6))}…'
                : 'Code shared — waiting for signup',
              style: GoogleFonts.inter(
                fontSize: 13, fontWeight: FontWeight.w600, color: c.text0,
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: chipColor.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(chipLabel, style: GoogleFonts.inter(
              fontSize: 10, fontWeight: FontWeight.w800, color: chipColor,
              letterSpacing: 0.3,
            )),
          ),
        ],
      ),
    );
  }

  // ─── Actions ─────────────────────────────────────────────────────────────

  void _copyCode(String code) {
    if (code.isEmpty) return;
    Clipboard.setData(ClipboardData(text: code));
    HapticFeedback.selectionClick();
    Analytics.track('referral_copy_code', {'code': code});
    ScaffoldMessenger.of(context)
      ..clearSnackBars()
      ..showSnackBar(SnackBar(
        content: Text('✓  Copied $code', style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
        backgroundColor: const Color(0xFF6D28D9),
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ));
  }

  String _buildShareText(String code) {
    final url = '$_kReferralUrlBase/$code';
    return 'Join me on Gifteeng — use my code *$code* at signup and we both get '
        '$_kReferralRewardPerJoin Goins to spend on beautiful personalised gifts.\n\n'
        '$url';
  }

  Future<void> _shareWhatsApp(String code) async {
    if (code.isEmpty) return;
    HapticFeedback.selectionClick();
    Analytics.track('referral_share_whatsapp', {'code': code});
    final text = _buildShareText(code);
    final uri = Uri.parse('https://wa.me/?text=${Uri.encodeComponent(text)}');
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok) _shareGeneric(code);
    } catch (_) {
      _shareGeneric(code);
    }
  }

  Future<void> _shareGeneric(String code) async {
    if (code.isEmpty) return;
    HapticFeedback.selectionClick();
    Analytics.track('referral_share_generic', {'code': code});
    try {
      await Share.share(
        _buildShareText(code),
        subject: 'Join me on Gifteeng — ₹200 free Goins',
      );
    } catch (_) {}
  }
}
