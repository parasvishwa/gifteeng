import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Pincode → delivery estimate
//
// Pure frontend computation for now — backend will expose a real
// `/shipping/check?pincode=...&productId=...` endpoint later. When that
// lands, swap `_estimate()` to call the API; the widget UI stays identical.
//
// Rules (matches admin guidance):
//   • Mumbai / MMR (400xxx, 401xxx)      → dispatch 2 + delivery 2 = 4 days
//   • Pune (411xxx-412xxx)               → dispatch 2 + delivery 3 = 5 days
//   • Delhi NCR (110xxx-122xxx)          → dispatch 2 + delivery 4 = 6 days
//   • Bangalore (560xxx-562xxx)          → dispatch 2 + delivery 4 = 6 days
//   • Chennai (600xxx-603xxx)            → dispatch 2 + delivery 4 = 6 days
//   • Hyderabad (500xxx-501xxx)          → dispatch 2 + delivery 4 = 6 days
//   • Kolkata (700xxx-711xxx)            → dispatch 2 + delivery 5 = 7 days
//   • Ahmedabad (380xxx-382xxx)          → dispatch 2 + delivery 5 = 7 days
//   • Jaipur (302xxx-303xxx)             → dispatch 2 + delivery 5 = 7 days
//   • Other metro / tier-1               → dispatch 2 + delivery 6 = 8 days
//   • Other (fallback)                   → dispatch 2 + delivery 7 = 9 days
// ─────────────────────────────────────────────────────────────────────────────

class DeliveryEstimate {
  final String city;
  final int dispatchDays;
  final int deliveryDays;
  final bool codAvailable;
  final bool serviceable;
  /// True when the pincode qualifies for Mumbai-metro same-day delivery.
  final bool sameDay;

  DeliveryEstimate({
    required this.city,
    required this.dispatchDays,
    required this.deliveryDays,
    required this.codAvailable,
    required this.serviceable,
    this.sameDay = false,
  });

  int get totalDays => dispatchDays + deliveryDays;
  DateTime get dispatchBy =>
      _addBusinessDays(DateTime.now(), dispatchDays);
  DateTime get deliveryBy =>
      _addBusinessDays(DateTime.now(), totalDays);
}

DateTime _addBusinessDays(DateTime from, int days) {
  var d = from;
  var remaining = days;
  while (remaining > 0) {
    d = d.add(const Duration(days: 1));
    // Skip Sunday (weekday == 7). We deliver Mon-Sat.
    if (d.weekday != DateTime.sunday) remaining--;
  }
  return d;
}

class _Rule {
  final RegExp pattern;
  final String city;
  final int dispatchDays;
  final int deliveryDays;
  final bool codAvailable;
  const _Rule(this.pattern, this.city,
      this.dispatchDays, this.deliveryDays, this.codAvailable);
}

final _rules = <_Rule>[
  _Rule(RegExp(r'^(400|401)\d{3}$'),             'Mumbai / MMR', 2, 2, true),
  _Rule(RegExp(r'^(411|412)\d{3}$'),             'Pune',         2, 3, true),
  _Rule(RegExp(r'^(110|120|121|122|201)\d{3}$'), 'Delhi NCR',    2, 4, true),
  _Rule(RegExp(r'^(560|561|562)\d{3}$'),         'Bangalore',    2, 4, true),
  _Rule(RegExp(r'^(600|601|602|603)\d{3}$'),     'Chennai',      2, 4, true),
  _Rule(RegExp(r'^(500|501)\d{3}$'),             'Hyderabad',    2, 4, true),
  _Rule(RegExp(r'^(700|711)\d{3}$'),             'Kolkata',      2, 5, true),
  _Rule(RegExp(r'^(380|382)\d{3}$'),             'Ahmedabad',    2, 5, true),
  _Rule(RegExp(r'^(302|303)\d{3}$'),             'Jaipur',       2, 5, true),
  // Other metros — broad strokes
  _Rule(RegExp(r'^(6|5)\d{5}$'),                 'your city',    2, 6, true),
];

DeliveryEstimate _computeEstimate(String pincode) {
  for (final r in _rules) {
    if (r.pattern.hasMatch(pincode)) {
      return DeliveryEstimate(
        city: r.city,
        dispatchDays: r.dispatchDays,
        deliveryDays: r.deliveryDays,
        codAvailable: r.codAvailable,
        serviceable: true,
      );
    }
  }
  // Fallback — still serviceable across India, just slower.
  return DeliveryEstimate(
    city: 'your area',
    dispatchDays: 2,
    deliveryDays: 7,
    codAvailable: false,
    serviceable: true,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────────────────────────────────────

const _kLastPincodeKey = 'gifteeng.lastPincode';

/// Last-used pincode — saved to SharedPreferences so subsequent product
/// visits auto-populate without typing.
final lastPincodeProvider = FutureProvider.autoDispose<String?>((ref) async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getString(_kLastPincodeKey);
});

/// Fetches the user's default/first saved address (for auto-pincode).
final defaultAddressPincodeProvider =
    FutureProvider.autoDispose<String?>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/addresses');
    final data = res.data;
    List list;
    if (data is List) {
      list = data;
    } else if (data is Map) {
      list = (data['items'] as List?) ?? const [];
    } else {
      return null;
    }
    if (list.isEmpty) return null;
    // Prefer the default address if one is flagged; else first in list.
    final def = list.firstWhere(
      (a) => a is Map && a['isDefault'] == true,
      orElse: () => list.first,
    );
    if (def is Map) {
      final p = (def['pincode'] ?? def['zip'] ?? '').toString();
      if (RegExp(r'^\d{6}$').hasMatch(p)) return p;
    }
  } catch (_) {}
  return null;
});

/// GPS-based fallback when neither last-pincode nor a saved address are
/// available — e.g. brand-new install + brand-new account. Quietly fails
/// (returns null) if the user denies location permission; the manual
/// pincode field is always available so this never blocks the user.
final gpsPincodeProvider = FutureProvider.autoDispose<String?>((ref) async {
  try {
    if (!await Geolocator.isLocationServiceEnabled()) return null;
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.denied ||
        perm == LocationPermission.deniedForever) {
      return null;
    }
    final pos = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.medium,
        timeLimit: Duration(seconds: 10),
      ),
    );
    final resp = await Dio().get(
      'https://nominatim.openstreetmap.org/reverse',
      queryParameters: {
        'format': 'json',
        'lat': pos.latitude,
        'lon': pos.longitude,
        'zoom': 16,
        'addressdetails': 1,
      },
      options: Options(
        headers: {'User-Agent': 'Gifteeng/1.0 (contact@gifteeng.com)'},
        receiveTimeout: const Duration(seconds: 8),
      ),
    );
    final addr = (resp.data as Map?)?['address'] as Map?;
    final pin = (addr?['postcode'] ?? '').toString().trim();
    if (RegExp(r'^\d{6}$').hasMatch(pin)) return pin;
  } catch (_) {}
  return null;
});

// ─────────────────────────────────────────────────────────────────────────────
// Widget
// ─────────────────────────────────────────────────────────────────────────────

class PincodeDeliveryCheck extends ConsumerStatefulWidget {
  /// Optional product id — reserved for the future backend endpoint
  /// `/shipping/check?pincode=&productId=`.
  final String? productId;

  /// Style knobs — match the product detail dark palette by default.
  final Color bgCard;
  final Color bgElevated;
  final Color textPrimary;
  final Color textSecondary;
  final Color textMuted;
  final Color border;
  final Color accent;
  final Color success;

  const PincodeDeliveryCheck({
    super.key,
    this.productId,
    this.bgCard        = const Color(0xFF0E1018),
    this.bgElevated    = const Color(0xFF0B0D14),
    this.textPrimary   = const Color(0xFFF0F0F5),
    this.textSecondary = const Color(0xFF7A7A90),
    this.textMuted     = const Color(0xFF4A4A60),
    this.border        = const Color(0xFF1A1C26),
    this.accent        = const Color(0xFFEF3752), // GColors.brand — coral
    this.success       = const Color(0xFF10B981),
  });

  @override
  ConsumerState<PincodeDeliveryCheck> createState() =>
      _PincodeDeliveryCheckState();
}

class _PincodeDeliveryCheckState extends ConsumerState<PincodeDeliveryCheck> {
  final _ctrl = TextEditingController();
  final _focus = FocusNode();
  DeliveryEstimate? _estimate;
  bool _checking = false;
  bool _autoFilled = false;

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _check(String pin) async {
    if (pin.length != 6) return;
    setState(() => _checking = true);
    HapticFeedback.selectionClick();

    // Persist last-used pincode
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_kLastPincodeKey, pin);
      ref.invalidate(lastPincodeProvider);
    } catch (_) {}

    DeliveryEstimate? est;

    // ── Call real backend endpoint /shipping/check?pincode=...
    try {
      final res = await ref.read(dioProvider).get(
        '/shipping/check',
        queryParameters: {'pincode': pin},
      );
      final data = res.data;
      if (data is Map && data['deliverable'] == true) {
        est = DeliveryEstimate(
          city: (data['city'] ?? 'your area').toString(),
          dispatchDays: (data['dispatchInBusinessDays'] as num?)?.toInt() ?? 2,
          deliveryDays: (data['deliveryInBusinessDays'] as num?)?.toInt() ?? 5,
          codAvailable: data['cod'] == true,
          serviceable: true,
        );
      }
    } catch (_) {
      // Backend offline / transient — fall through to local matrix.
    }

    // ── Fallback: local city-matrix keeps the UX alive
    est ??= _computeEstimate(pin);

    if (!mounted) return;
    setState(() {
      _estimate = est;
      _checking = false;
    });
  }

  void _clear() {
    setState(() {
      _ctrl.clear();
      _estimate = null;
      _autoFilled = false;
    });
    _focus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    // Auto-fetch pincode on first build, in priority order:
    //   1. Last-used pincode (from prefs) — fastest, works offline
    //   2. Default saved address pincode — for logged-in customers
    //   3. GPS reverse-geocode — first-time / no history users
    // Whichever resolves first wins; the others are cheap and just no-op
    // because `_autoFilled` is set as soon as a value lands.
    if (!_autoFilled && _ctrl.text.isEmpty) {
      final lastAsync    = ref.watch(lastPincodeProvider);
      final defAddrAsync = ref.watch(defaultAddressPincodeProvider);
      final gpsAsync     = ref.watch(gpsPincodeProvider);
      final pin = lastAsync.valueOrNull
          ?? defAddrAsync.valueOrNull
          ?? gpsAsync.valueOrNull;
      if (pin != null && pin.length == 6) {
        _autoFilled = true;
        _ctrl.text = pin;
        // Kick off a check after the frame settles
        WidgetsBinding.instance.addPostFrameCallback((_) => _check(pin));
      }
    }

    // ── Theme-aware color overrides ──────────────────────────────────────────
    // Always resolve from GColors.of(context) so the widget looks correct on
    // both the dark and light theme, regardless of what the caller passed.
    final _c = GColors.of(context);
    final effectiveBgCard        = _c.bg1;
    final effectiveBgElevated    = _c.bg2;
    final effectiveTextPrimary   = _c.text0;
    final effectiveTextSecondary = _c.text1;
    final effectiveTextMuted     = _c.text2;
    final effectiveBorder        = _c.border;
    const effectiveAccent        = GColors.brand;
    const effectiveSuccess       = GColors.emerald;

    return Container(
      decoration: BoxDecoration(
        color: effectiveBgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: effectiveBorder),
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            const Text('📍', style: TextStyle(fontSize: 14)),
            const Gap(6),
            Text('Delivery',
              style: GoogleFonts.inter(
                fontSize: 13, fontWeight: FontWeight.w700,
                color: effectiveTextPrimary)),
            const Spacer(),
            if (_estimate != null)
              GestureDetector(
                onTap: _clear,
                child: Text('Change',
                  style: GoogleFonts.inter(
                    fontSize: 12, fontWeight: FontWeight.w700,
                    color: effectiveAccent)),
              ),
          ]),
          const Gap(8),
          // Input row
          Row(children: [
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: effectiveBgElevated,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: effectiveBorder),
                ),
                child: TextField(
                  controller: _ctrl,
                  focusNode: _focus,
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(6),
                  ],
                  enabled: _estimate == null,
                  onChanged: (v) {
                    if (v.length == 6) _check(v);
                  },
                  onSubmitted: _check,
                  style: GoogleFonts.inter(
                    fontSize: 14, fontWeight: FontWeight.w600,
                    color: effectiveTextPrimary, letterSpacing: 1),
                  decoration: InputDecoration(
                    hintText: 'Enter 6-digit pincode',
                    hintStyle: GoogleFonts.inter(
                      fontSize: 13, color: effectiveTextMuted),
                    border: InputBorder.none,
                  ),
                ),
              ),
            ),
            const Gap(8),
            GestureDetector(
              onTap: _estimate != null
                  ? null
                  : () => _check(_ctrl.text),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: _estimate != null
                      ? effectiveBgElevated
                      : effectiveAccent,
                  borderRadius: BorderRadius.circular(12),
                  border: _estimate != null
                      ? Border.all(color: effectiveBorder)
                      : null,
                ),
                child: _checking
                    ? const SizedBox(
                        width: 14, height: 14,
                        child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                    : Text('Check',
                        style: GoogleFonts.inter(
                          fontSize: 12, fontWeight: FontWeight.w800,
                          color: _estimate != null
                              ? effectiveTextMuted
                              : Colors.white)),
              ),
            ),
          ]),

          // Result
          if (_estimate != null) ...[
            const Gap(10),
            _Result(
              estimate: _estimate!,
              textPrimary: effectiveTextPrimary,
              textSecondary: effectiveTextSecondary,
              textMuted: effectiveTextMuted,
              accent: effectiveAccent,
              success: effectiveSuccess,
              border: effectiveBorder,
              bgElevated: effectiveBgElevated,
            ).animate().fadeIn(duration: 250.ms).slideY(
                begin: 0.1, end: 0, curve: Curves.easeOutCubic),
          ],
        ],
      ),
    );
  }
}

// ─── Result row ──────────────────────────────────────────────────────────────

class _Result extends StatelessWidget {
  final DeliveryEstimate estimate;
  final Color textPrimary, textSecondary, textMuted, accent, success, border, bgElevated;
  const _Result({
    required this.estimate,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.accent,
    required this.success,
    required this.border,
    required this.bgElevated,
  });

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('EEE, d MMM'); // e.g. "Sat, 26 Apr"
    final dispatchStr = fmt.format(estimate.dispatchBy);
    final deliveryStr = fmt.format(estimate.deliveryBy);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Delivers by — hero line
        Row(children: [
          Icon(Icons.local_shipping_outlined, size: 15, color: success),
          const Gap(6),
          Expanded(
            child: RichText(
              text: TextSpan(children: [
                TextSpan(text: 'Delivers to ${estimate.city} by ',
                  style: GoogleFonts.inter(fontSize: 12, color: textSecondary)),
                TextSpan(text: deliveryStr,
                  style: GoogleFonts.inter(
                    fontSize: 13, fontWeight: FontWeight.w800, color: textPrimary)),
                TextSpan(text: ' (${estimate.totalDays}d)',
                  style: GoogleFonts.inter(fontSize: 11, color: textMuted)),
              ]),
            ),
          ),
        ]),
        const Gap(8),

        // COD + returns chips — inline, compact
        Row(children: [
          _Feature(
            emoji: estimate.codAvailable ? '💵' : '💳',
            label: estimate.codAvailable ? 'COD available' : 'Prepaid only',
            color: estimate.codAvailable ? success : textMuted,
            bg: bgElevated, border: border,
          ),
          const Gap(8),
          _Feature(
            emoji: '🔄',
            label: '7-day returns',
            color: textSecondary,
            bg: bgElevated, border: border,
          ),
        ]),
      ],
    );
  }
}

// Compact side-by-side timeline item (new design)
class _CompactTimelineItem extends StatelessWidget {
  final String emoji, label, value, sub;
  final Color textPrimary, textMuted;
  const _CompactTimelineItem({
    required this.emoji, required this.label, required this.value,
    required this.sub, required this.textPrimary, required this.textMuted,
  });
  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: GoogleFonts.inter(
        fontSize: 10, color: textMuted, fontWeight: FontWeight.w500)),
      const Gap(2),
      Text(value, style: GoogleFonts.inter(
        fontSize: 13, fontWeight: FontWeight.w800, color: textPrimary)),
      Text(sub, style: GoogleFonts.inter(
        fontSize: 10, color: textMuted)),
    ]);
  }
}

class _TimelineRow extends StatelessWidget {
  final String emoji, label, value, sub;
  final Color textPrimary, textSecondary, textMuted;
  final bool highlight;
  final Color? accent;
  const _TimelineRow({
    required this.emoji,
    required this.label,
    required this.value,
    required this.sub,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    this.highlight = false,
    this.accent,
  });
  @override
  Widget build(BuildContext context) {
    return Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
      Text(emoji, style: const TextStyle(fontSize: 18)),
      const Gap(10),
      Expanded(child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: GoogleFonts.inter(
            fontSize: 11, color: textMuted,
            fontWeight: FontWeight.w500)),
          const Gap(1),
          Text(value, style: GoogleFonts.inter(
            fontSize: 14, fontWeight: FontWeight.w800,
            color: highlight ? (accent ?? textPrimary) : textPrimary)),
          Text(sub, style: GoogleFonts.inter(
            fontSize: 10, color: textSecondary)),
        ],
      )),
    ]);
  }
}

class _Feature extends StatelessWidget {
  final String emoji, label;
  final Color color, bg, border;
  const _Feature({
    required this.emoji, required this.label,
    required this.color, required this.bg, required this.border,
  });
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: border),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Text(emoji, style: const TextStyle(fontSize: 12)),
          const Gap(5),
          Flexible(child: Text(label,
            maxLines: 1, overflow: TextOverflow.ellipsis,
            style: GoogleFonts.inter(
              fontSize: 10, fontWeight: FontWeight.w700, color: color))),
        ]),
      ),
    );
  }
}
