// ────────────────────────────────────────────────────────────────────────
// Privacy & Data Controls — DPDP-compliant in-app surface
// ────────────────────────────────────────────────────────────────────────
//
// Both Apple and Google require account deletion to be reachable from
// inside the app (not just on the website). This screen is that surface.
//
// Three sections, mirroring the web /b2c/account/privacy page:
//   1. Consent toggles per category (essential is non-withdrawable)
//   2. Data export — opens the web export page (avoids extra dependencies)
//   3. Account deletion — schedule 30-day grace, cancel any time
//
// All three back the same /me/privacy/* endpoints the web uses.

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';

class PrivacyScreen extends ConsumerStatefulWidget {
  const PrivacyScreen({super.key});

  @override
  ConsumerState<PrivacyScreen> createState() => _PrivacyScreenState();
}

class _PrivacyScreenState extends ConsumerState<PrivacyScreen> {
  bool _loading = true;
  String? _error;
  Map<String, _ConsentState>? _consents;
  DateTime? _deletionScheduled;
  bool _busyDelete = false;
  String? _busyConsent;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dio = ref.read(dioProvider);
      final responses = await Future.wait([
        dio.get('/me/privacy/consents'),
        dio.get('/auth/b2c/me'),
      ]);
      final consentData = responses[0].data as Map<String, dynamic>;
      final me = responses[1].data as Map<String, dynamic>;
      final scheduledRaw = me['dataDeletionScheduledFor'];
      setState(() {
        _consents = consentData.map(
          (key, value) => MapEntry(
            key,
            _ConsentState.fromJson(value as Map<String, dynamic>),
          ),
        );
        _deletionScheduled =
            scheduledRaw is String ? DateTime.tryParse(scheduledRaw) : null;
        _loading = false;
      });
    } on DioException catch (e) {
      setState(() {
        _error = e.response?.data is Map
            ? (e.response!.data as Map)['message']?.toString() ?? e.message
            : e.message;
        _loading = false;
      });
    }
  }

  Future<void> _toggleConsent(String category, bool granted) async {
    setState(() => _busyConsent = category);
    try {
      final dio = ref.read(dioProvider);
      await dio.post('/me/privacy/consents', data: {
        'category': category,
        'granted': granted,
      });
      await _load();
    } on DioException catch (e) {
      if (!mounted) return;
      _showError(_extractErr(e) ?? 'Could not update consent');
      setState(() => _busyConsent = null);
    }
  }

  Future<void> _openWebExport() async {
    // Hand off to the existing browser-based export flow. Saves us from
    // adding path_provider just for this screen.
    final uri = Uri.parse('https://www.gifteeng.com/b2c/account/privacy');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _requestDeletion() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        final c = GColors.of(ctx);
        return AlertDialog(
          backgroundColor: c.bg1,
          title: Text(
            'Delete your account?',
            style: GoogleFonts.inter(
              fontWeight: FontWeight.w800,
              color: c.text0,
            ),
          ),
          content: Text(
            "We'll schedule your account for deletion 30 days from now. "
            'During that window you can come back and cancel.\n\n'
            'After 30 days, your name, email, phone, addresses, and personal '
            'photos are permanently anonymised. Order records (required by '
            'Indian tax law) are kept for 7 years but with all personal '
            'information redacted.',
            style: GoogleFonts.inter(
              fontSize: 13,
              height: 1.5,
              color: c.text1,
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: Text('Cancel',
                  style: GoogleFonts.inter(color: c.text1)),
            ),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: Text(
                'Schedule deletion',
                style: GoogleFonts.inter(
                  color: GColors.rose,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        );
      },
    );
    if (confirmed != true) return;

    setState(() => _busyDelete = true);
    try {
      final dio = ref.read(dioProvider);
      await dio.post('/me/privacy/delete-account', data: {});
      await _load();
    } on DioException catch (e) {
      if (!mounted) return;
      _showError(_extractErr(e) ?? 'Could not request deletion');
    } finally {
      if (mounted) setState(() => _busyDelete = false);
    }
  }

  Future<void> _cancelDeletion() async {
    setState(() => _busyDelete = true);
    try {
      final dio = ref.read(dioProvider);
      await dio.delete('/me/privacy/delete-account');
      await _load();
    } on DioException catch (e) {
      if (!mounted) return;
      _showError(_extractErr(e) ?? 'Could not cancel deletion');
    } finally {
      if (mounted) setState(() => _busyDelete = false);
    }
  }

  String? _extractErr(DioException e) {
    final data = e.response?.data;
    if (data is Map) return data['message']?.toString();
    return null;
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: GColors.rose),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Scaffold(
      backgroundColor: c.bg0,
      appBar: AppBar(
        backgroundColor: c.bg0,
        title: Text(
          'Privacy & Data',
          style: GoogleFonts.inter(
            fontWeight: FontWeight.w800,
            color: c.text0,
          ),
        ),
        centerTitle: false,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_rounded, color: c.text0),
          onPressed: () => GoRouter.of(context).pop(),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
          : _error != null
              ? _ErrorView(message: _error!, onRetry: _load)
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text(
                      "Under India's Digital Personal Data Protection Act, you "
                      'have the right to control, export, and delete the data '
                      'we hold about you.',
                      style: GoogleFonts.inter(
                        fontSize: 13,
                        height: 1.55,
                        color: c.text1,
                      ),
                    ),
                    const Gap(20),

                    _SectionHeader(title: 'What we can do with your data'),
                    const Gap(8),
                    if (_consents != null)
                      ..._buildConsentRows(_consents!, c),
                    const Gap(20),

                    _SectionHeader(title: 'Export your data'),
                    const Gap(8),
                    _Card(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Get everything we know about you in a single JSON '
                            'file — orders, addresses, wishlist, coin history, '
                            'reviews, designs, the lot.',
                            style: GoogleFonts.inter(
                              fontSize: 12.5,
                              height: 1.5,
                              color: c.text1,
                            ),
                          ),
                          const Gap(12),
                          _ActionButton(
                            label: 'Open data export',
                            icon: Icons.open_in_browser_rounded,
                            onTap: _openWebExport,
                            color: GColors.brand,
                          ),
                        ],
                      ),
                    ),
                    const Gap(20),

                    _SectionHeader(title: 'Delete my account'),
                    const Gap(8),
                    if (_deletionScheduled != null)
                      _DeletionScheduledCard(
                        scheduledFor: _deletionScheduled!,
                        busy: _busyDelete,
                        onCancel: _cancelDeletion,
                        c: c,
                      )
                    else
                      _Card(
                        borderColor: GColors.rose.withValues(alpha: 0.3),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Schedule your account for deletion. You\'ll have '
                              'a 30-day grace window to cancel before '
                              'anonymisation runs. Order records are kept for '
                              '7 years (Indian tax law) but with all personal '
                              'data redacted.',
                              style: GoogleFonts.inter(
                                fontSize: 12.5,
                                height: 1.5,
                                color: c.text1,
                              ),
                            ),
                            const Gap(12),
                            _ActionButton(
                              label: _busyDelete
                                  ? 'Working…'
                                  : 'Schedule deletion',
                              icon: Icons.delete_outline_rounded,
                              onTap: _busyDelete ? null : _requestDeletion,
                              color: GColors.rose,
                            ),
                          ],
                        ),
                      ),
                    const Gap(24),
                    Center(
                      child: Text(
                        'Read the full privacy policy at gifteeng.com/privacy',
                        style: GoogleFonts.inter(
                          fontSize: 11,
                          color: c.text1.withValues(alpha: 0.7),
                        ),
                      ),
                    ),
                    const Gap(40),
                  ],
                ),
    );
  }

  List<Widget> _buildConsentRows(
    Map<String, _ConsentState> consents,
    GColorsPalette c,
  ) {
    const labels = <String, _ConsentMeta>{
      'essential': _ConsentMeta(
        title: 'Essential',
        help: 'Login, cart, checkout, order tracking. Required to use Gifteeng.',
        canWithdraw: false,
      ),
      'analytics': _ConsentMeta(
        title: 'Analytics',
        help: 'Page views, performance, error reporting (Sentry). Helps us '
            'fix bugs and improve speed.',
        canWithdraw: true,
      ),
      'marketing': _ConsentMeta(
        title: 'Marketing',
        help: 'Abandoned-cart reminders, promotional pushes, retargeting. Off '
            '= no marketing emails / SMS / pushes.',
        canWithdraw: true,
      ),
      'ai_personalization': _ConsentMeta(
        title: 'AI personalisation',
        help: 'AI-driven recommendations, gift suggestions, intent matching. '
            'Off = browsing without personalisation.',
        canWithdraw: true,
      ),
    };

    return labels.entries.map((entry) {
      final state = consents[entry.key] ?? const _ConsentState(granted: false);
      final meta = entry.value;
      final isBusy = _busyConsent == entry.key;
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: _Card(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      meta.title,
                      style: GoogleFonts.inter(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: c.text0,
                      ),
                    ),
                    const Gap(2),
                    Text(
                      meta.help,
                      style: GoogleFonts.inter(
                        fontSize: 11.5,
                        height: 1.4,
                        color: c.text1,
                      ),
                    ),
                  ],
                ),
              ),
              const Gap(12),
              if (!meta.canWithdraw)
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: GColors.emerald.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    'Required',
                    style: GoogleFonts.inter(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: GColors.emerald,
                    ),
                  ),
                )
              else
                Switch.adaptive(
                  value: state.granted,
                  onChanged: isBusy
                      ? null
                      : (v) {
                          HapticFeedback.selectionClick();
                          _toggleConsent(entry.key, v);
                        },
                  activeColor: GColors.brand,
                ),
            ],
          ),
        ),
      );
    }).toList();
  }
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

class _ConsentState {
  final bool granted;
  const _ConsentState({required this.granted});
  factory _ConsentState.fromJson(Map<String, dynamic> json) =>
      _ConsentState(granted: json['granted'] == true);
}

class _ConsentMeta {
  final String title, help;
  final bool canWithdraw;
  const _ConsentMeta({
    required this.title,
    required this.help,
    required this.canWithdraw,
  });
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Text(
      title.toUpperCase(),
      style: GoogleFonts.inter(
        fontSize: 10,
        fontWeight: FontWeight.w800,
        letterSpacing: 1.4,
        color: c.text1,
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final Widget child;
  final Color? borderColor;
  const _Card({required this.child, this.borderColor});

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.bg1,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: borderColor ?? c.border, width: 1),
      ),
      child: child,
    );
  }
}

/// Lightweight inline button — avoids relying on a specific GButton variant
/// API and lets each call site pick its own colour (brand for primary, rose
/// for danger, etc.).
class _ActionButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback? onTap;
  final Color color;
  const _ActionButton({
    required this.label,
    required this.icon,
    required this.onTap,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 44,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(
          color: disabled ? color.withValues(alpha: 0.4) : color,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: Colors.white, size: 18),
            const Gap(8),
            Text(
              label,
              style: GoogleFonts.inter(
                color: Colors.white,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DeletionScheduledCard extends StatelessWidget {
  final DateTime scheduledFor;
  final bool busy;
  final VoidCallback onCancel;
  final GColorsPalette c;
  const _DeletionScheduledCard({
    required this.scheduledFor,
    required this.busy,
    required this.onCancel,
    required this.c,
  });

  @override
  Widget build(BuildContext context) {
    final formatted =
        '${scheduledFor.day} ${_monthName(scheduledFor.month)} ${scheduledFor.year}';
    return _Card(
      borderColor: GColors.gold.withValues(alpha: 0.4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.warning_amber_rounded,
                  color: GColors.gold, size: 18),
              const Gap(8),
              Expanded(
                child: Text(
                  'Deletion scheduled for $formatted',
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: c.text0,
                  ),
                ),
              ),
            ],
          ),
          const Gap(8),
          Text(
            'Cancel any time before that date. After it passes, anonymisation '
            'runs automatically and cannot be undone.',
            style: GoogleFonts.inter(
              fontSize: 12,
              height: 1.5,
              color: c.text1,
            ),
          ),
          const Gap(12),
          _ActionButton(
            label: busy ? 'Working…' : 'Cancel deletion',
            icon: Icons.cancel_outlined,
            onTap: busy ? null : onCancel,
            color: c.bg2,
          ),
        ],
      ),
    );
  }

  String _monthName(int m) => const [
        '',
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
      ][m];
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_rounded, color: c.text1, size: 36),
            const Gap(8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(fontSize: 13, color: c.text1),
            ),
            const Gap(12),
            _ActionButton(
              label: 'Retry',
              icon: Icons.refresh_rounded,
              onTap: onRetry,
              color: GColors.brand,
            ),
          ],
        ),
      ),
    );
  }
}
