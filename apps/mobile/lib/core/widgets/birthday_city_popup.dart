import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:gap/gap.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../theme/app_theme.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Birthday + City popup — one-time profile completion modal.
//
// Behaviour:
// • Only for logged-in customers (skipped when no auth token).
// • Only if birthMonth/birthDay/city is missing on /auth/b2c/me.
// • Dismissed for 7 days via SharedPreferences when user taps "Skip".
// • Server awards 100 Goins ONCE when both birthday + city are first set.
// ─────────────────────────────────────────────────────────────────────────────

const _kDismissKey = 'profile_popup_dismissed_at';
const _kDismissDays = 7;

const List<String> _kMonths = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/// Call this from a screen's initState (e.g. HomeScreen) to maybe show the
/// popup ~6s after first paint. Safe to call repeatedly — guarded by token,
/// dismiss timestamp, and existing profile data.
Future<void> maybeShowBirthdayCityPopup(WidgetRef ref, BuildContext context) async {
  // Defer slightly so the home page renders first.
  await Future<void>.delayed(const Duration(seconds: 6));
  if (!context.mounted) return;

  final token = ref.read(authTokenNotifierProvider).valueOrNull;
  if (token == null) return; // Not logged in.

  // Suppressed within last 7 days?
  final prefs = await SharedPreferences.getInstance();
  final last  = prefs.getInt(_kDismissKey);
  if (last != null) {
    final ageMs = DateTime.now().millisecondsSinceEpoch - last;
    if (ageMs < _kDismissDays * 86400 * 1000) return;
  }

  // Fetch /me to check what's already filled.
  final dio = ref.read(dioProvider);
  late Map<String, dynamic> me;
  try {
    final res = await dio.get('/auth/b2c/me');
    if (res.data is! Map) return;
    me = Map<String, dynamic>.from(res.data as Map);
  } catch (_) {
    return;
  }

  final meta       = (me['metadata'] as Map?) ?? const {};
  final birthMonth = meta['birthMonth'] as int?;
  final birthDay   = meta['birthDay']   as int?;
  final city       = (meta['city'] as String?)?.trim();

  // Already complete — never show again.
  if (birthMonth != null && birthDay != null && city != null && city.isNotEmpty) {
    return;
  }

  if (!context.mounted) return;
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _BirthdayCityPopup(
      initialMonth: birthMonth,
      initialDay:   birthDay,
      initialCity:  city ?? '',
    ),
  );
}

class _BirthdayCityPopup extends ConsumerStatefulWidget {
  final int? initialMonth;
  final int? initialDay;
  final String initialCity;

  const _BirthdayCityPopup({
    this.initialMonth,
    this.initialDay,
    this.initialCity = '',
  });

  @override
  ConsumerState<_BirthdayCityPopup> createState() => _BirthdayCityPopupState();
}

class _BirthdayCityPopupState extends ConsumerState<_BirthdayCityPopup> {
  int? _month;
  int? _day;
  late final TextEditingController _cityCtrl;
  bool _saving = false;
  int? _bonusEarned; // null = form, 0 = saved (no bonus), 100 = bonus awarded

  @override
  void initState() {
    super.initState();
    _month   = widget.initialMonth;
    _day     = widget.initialDay;
    _cityCtrl = TextEditingController(text: widget.initialCity);
  }

  @override
  void dispose() {
    _cityCtrl.dispose();
    super.dispose();
  }

  bool get _canSubmit =>
      _month != null && _day != null && _cityCtrl.text.trim().isNotEmpty;

  Future<void> _dismiss() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_kDismissKey, DateTime.now().millisecondsSinceEpoch);
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _submit() async {
    if (!_canSubmit) return;
    setState(() => _saving = true);
    try {
      final res = await ref.read(dioProvider).patch('/auth/b2c/me', data: {
        'birthMonth': _month,
        'birthDay':   _day,
        'city':       _cityCtrl.text.trim(),
      });
      final data = (res.data is Map) ? res.data as Map : {};
      final awarded = (data['bonusAwarded'] == true);
      final amount  = (data['bonusAmount'] is int) ? data['bonusAmount'] as int : 0;
      if (mounted) {
        // Mark dismissed so it never re-shows even if server doesn't return all fields.
        final prefs = await SharedPreferences.getInstance();
        await prefs.setInt(_kDismissKey, DateTime.now().millisecondsSinceEpoch);
        setState(() {
          _bonusEarned = awarded ? amount : 0;
          _saving = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Could not save — try again',
              style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
          backgroundColor: GColors.rose,
          behavior: SnackBarBehavior.floating,
        ));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);

    // Success state
    if (_bonusEarned != null) {
      return _SuccessSheet(
        bonus: _bonusEarned!,
        onDone: () => Navigator.of(context).pop(),
      );
    }

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 16, right: 16,
          bottom: MediaQuery.of(context).viewInsets.bottom + 16,
        ),
        child: Container(
          decoration: BoxDecoration(
            color: c.bg1,
            borderRadius: BorderRadius.circular(20),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Hero strip
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 14),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft, end: Alignment.bottomRight,
                    colors: [
                      GColors.brand.withValues(alpha: 0.10),
                      const Color(0xFFF59E0B).withValues(alpha: 0.10),
                    ],
                  ),
                ),
                child: Stack(children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        const Icon(Icons.auto_awesome_rounded,
                            size: 18, color: Color(0xFFF59E0B)),
                        const Gap(6),
                        Text('EARN 100 GOINS', style: GoogleFonts.inter(
                          fontSize: 11, fontWeight: FontWeight.w900,
                          color: const Color(0xFFB45309), letterSpacing: 0.8,
                        )),
                      ]),
                      const Gap(8),
                      Text('Tell us a little about you',
                          style: GoogleFonts.inter(
                              fontSize: 19, fontWeight: FontWeight.w900,
                              color: c.text0)),
                      const Gap(4),
                      Text("We'll wish you on your birthday and surface the right gifts.",
                          style: GoogleFonts.inter(
                              fontSize: 12, color: c.text2, height: 1.4)),
                    ],
                  ),
                  Positioned(
                    top: 0, right: 0,
                    child: GestureDetector(
                      onTap: _dismiss,
                      child: Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: c.bg0.withValues(alpha: 0.6),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(Icons.close_rounded, size: 16, color: c.text2),
                      ),
                    ),
                  ),
                ]),
              ),

              // Form
              Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Birthday row
                    Row(children: [
                      const Icon(Icons.cake_rounded, size: 14, color: GColors.brand),
                      const Gap(6),
                      Text('Your birthday', style: GoogleFonts.inter(
                          fontSize: 12, fontWeight: FontWeight.w800, color: c.text0)),
                      const Gap(6),
                      Text('(no year needed)', style: GoogleFonts.inter(
                          fontSize: 11, color: c.text2)),
                    ]),
                    const Gap(8),
                    Row(children: [
                      Expanded(child: _Dropdown<int>(
                        value: _month,
                        hint: 'Month',
                        items: List.generate(12, (i) => MapEntry(i + 1, _kMonths[i])),
                        onChanged: (v) => setState(() => _month = v),
                      )),
                      const Gap(8),
                      Expanded(child: _Dropdown<int>(
                        value: _day,
                        hint: 'Day',
                        items: List.generate(31, (i) => MapEntry(i + 1, '${i + 1}')),
                        onChanged: (v) => setState(() => _day = v),
                      )),
                    ]),

                    const Gap(14),
                    Row(children: [
                      const Icon(Icons.location_on_rounded, size: 14, color: GColors.brand),
                      const Gap(6),
                      Text('Your city', style: GoogleFonts.inter(
                          fontSize: 12, fontWeight: FontWeight.w800, color: c.text0)),
                    ]),
                    const Gap(8),
                    TextField(
                      controller: _cityCtrl,
                      maxLength: 60,
                      onChanged: (_) => setState(() {}),
                      style: GoogleFonts.inter(fontSize: 14, color: c.text0),
                      decoration: InputDecoration(
                        hintText: 'e.g. Mumbai, Bengaluru',
                        hintStyle: GoogleFonts.inter(fontSize: 13, color: c.text2),
                        counterText: '',
                        filled: true, fillColor: c.bg2,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(color: c.border),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(color: c.border),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: const BorderSide(color: GColors.brand, width: 1.5),
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                      ),
                    ),

                    const Gap(16),
                    Row(children: [
                      Expanded(child: TextButton(
                        onPressed: _saving ? null : _dismiss,
                        style: TextButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                            side: BorderSide(color: c.border),
                          ),
                        ),
                        child: Text('Skip', style: GoogleFonts.inter(
                            fontSize: 13, fontWeight: FontWeight.w700, color: c.text2)),
                      )),
                      const Gap(8),
                      Expanded(flex: 2, child: ElevatedButton(
                        onPressed: !_canSubmit || _saving ? null : _submit,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: GColors.brand,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          elevation: 0,
                        ),
                        child: _saving
                            ? const SizedBox(width: 18, height: 18,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2, color: Colors.white))
                            : Text('Save & Earn 100 Goins',
                                style: GoogleFonts.inter(
                                    fontSize: 13, fontWeight: FontWeight.w900)),
                      )),
                    ]),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Dropdown<T> extends StatelessWidget {
  final T? value;
  final String hint;
  final List<MapEntry<T, String>> items;
  final void Function(T?) onChanged;
  const _Dropdown({
    required this.value, required this.hint,
    required this.items, required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Container(
      decoration: BoxDecoration(
        color: c.bg2,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: c.border),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
      child: DropdownButton<T>(
        value: value,
        hint: Text(hint, style: GoogleFonts.inter(fontSize: 13, color: c.text2)),
        items: items
            .map((e) => DropdownMenuItem<T>(
                  value: e.key,
                  child: Text(e.value, style: GoogleFonts.inter(
                      fontSize: 13, color: c.text0)),
                ))
            .toList(),
        onChanged: (v) {
          HapticFeedback.selectionClick();
          onChanged(v);
        },
        underline: const SizedBox.shrink(),
        isExpanded: true,
        dropdownColor: c.bg1,
        style: GoogleFonts.inter(fontSize: 13, color: c.text0),
        icon: Icon(Icons.expand_more_rounded, color: c.text2),
      ),
    );
  }
}

class _SuccessSheet extends StatelessWidget {
  final int bonus;
  final VoidCallback onDone;
  const _SuccessSheet({required this.bonus, required this.onDone});

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: c.bg1,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 56, height: 56,
                decoration: BoxDecoration(
                  color: GColors.emerald.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.check_rounded, size: 32, color: GColors.emerald),
              ),
              const Gap(12),
              Text('Thank you!', style: GoogleFonts.inter(
                  fontSize: 20, fontWeight: FontWeight.w900, color: c.text0)),
              const Gap(8),
              if (bonus > 0)
                RichText(
                  textAlign: TextAlign.center,
                  text: TextSpan(
                    style: GoogleFonts.inter(fontSize: 13, color: c.text1),
                    children: [
                      const TextSpan(text: "We've added "),
                      TextSpan(text: '$bonus Goins',
                          style: GoogleFonts.inter(
                              fontSize: 13, fontWeight: FontWeight.w900,
                              color: const Color(0xFFF59E0B))),
                      const TextSpan(text: ' to your wallet.'),
                    ],
                  ),
                )
              else
                Text('Your profile has been updated.', style: GoogleFonts.inter(
                    fontSize: 13, color: c.text1)),
              const Gap(20),
              SizedBox(width: double.infinity, child: ElevatedButton(
                onPressed: onDone,
                style: ElevatedButton.styleFrom(
                  backgroundColor: GColors.brand,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  elevation: 0,
                ),
                child: Text('Continue Shopping', style: GoogleFonts.inter(
                    fontSize: 13, fontWeight: FontWeight.w900)),
              )),
            ],
          ),
        ),
      ),
    );
  }
}
