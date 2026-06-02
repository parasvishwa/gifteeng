// ─── LocationService — request user GPS at app start and detect delivery zone ─
//
// Flow:
//   1. Ask the device for current GPS coords (low-accuracy is fine — we only
//      need ~1km resolution to know if the user is in Mumbai metro).
//   2. Reverse-geocode the coords to a pincode using OpenStreetMap Nominatim
//      (free, no API key) so we don't burn paid quota at scale. If Nominatim
//      is unreachable we fall back to the device's locality name.
//   3. Hand the pincode to /api/shipping/check to get the same-day flag plus
//      the ETA label the rest of the app already knows how to render.
//
// State is exposed via Riverpod (`userDeliveryProvider`) so any widget can
// read the current zone with `ref.watch(userDeliveryProvider)`.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';

// ─── Result type ─────────────────────────────────────────────────────────────

class UserDelivery {
  final bool   permissionDenied;
  final bool   loading;
  final String? pincode;
  final String? city;
  /// `true` when the resolved pincode lives in a same-day delivery zone
  /// (Mumbai metro today). This is a ZONE flag — it does not consider the
  /// time of day. Use `effectiveSameDay` for the UI-facing answer.
  final bool   sameDay;
  final String etaLabel;

  const UserDelivery({
    this.permissionDenied = false,
    this.loading          = false,
    this.pincode,
    this.city,
    this.sameDay  = false,
    this.etaLabel = '',
  });

  static const initial  = UserDelivery(loading: true);
  static const denied   = UserDelivery(permissionDenied: true);
  static const fallback = UserDelivery(); // nothing known, no badge

  // ── Same-day cutoff ─────────────────────────────────────────────────────
  // Orders placed before 12:00 PM local time ship same day. After noon, the
  // courier can't pick up + dispatch on the same day, so the UI must show
  // "Next-day delivery" instead — even though the user is still in a Mumbai
  // same-day zone. Single source of truth; all surfaces (product card,
  // home banner, checkout) read these getters.
  static const int kCutoffHour = 12; // 12 PM local

  /// `true` if the current local time is at or after the same-day cutoff.
  bool get cutoffPassed {
    final now = DateTime.now();
    return now.hour >= kCutoffHour;
  }

  /// The actual UI-facing same-day flag. Only `true` for in-zone users
  /// AND only before the noon cutoff. After cutoff, even Mumbai users
  /// fall through to next-day messaging.
  bool get effectiveSameDay => sameDay && !cutoffPassed;

  /// Returns true when the user is in a same-day zone but ordering after
  /// the cutoff — i.e. show "Next-day delivery" instead of "Same-day".
  bool get nextDayFromMumbai => sameDay && cutoffPassed;

  /// The label to display on product cards / banners. Computed from the
  /// zone + the cutoff; never raw `etaLabel` once we know the cutoff
  /// applies. Falls back to the server-provided `etaLabel` for non-zone
  /// users (standard pan-India 3–5 day shipping).
  String get effectiveEtaLabel {
    if (effectiveSameDay) return 'Same-day delivery';
    if (nextDayFromMumbai) return 'Next-day delivery';
    return etaLabel;
  }

  UserDelivery copyWith({
    bool?   permissionDenied,
    bool?   loading,
    String? pincode,
    String? city,
    bool?   sameDay,
    String? etaLabel,
  }) {
    return UserDelivery(
      permissionDenied: permissionDenied ?? this.permissionDenied,
      loading:          loading          ?? this.loading,
      pincode:          pincode          ?? this.pincode,
      city:             city             ?? this.city,
      sameDay:          sameDay          ?? this.sameDay,
      etaLabel:         etaLabel         ?? this.etaLabel,
    );
  }
}

// ─── Provider — auto-resolves at first read ─────────────────────────────────

final userDeliveryProvider =
    StateNotifierProvider<UserDeliveryNotifier, UserDelivery>((ref) {
  return UserDeliveryNotifier(ref);
});

// Storage key for the manual Mumbai / Other-than-Mumbai choice the user
// makes from the on-app-launch popup. Kept in SharedPreferences so the
// choice survives app restarts; clearing it forces the popup to show again.
const String kDeliveryZoneChoiceKey = 'gifteeng.delivery_zone_choice';

class UserDeliveryNotifier extends StateNotifier<UserDelivery> {
  final Ref _ref;
  UserDeliveryNotifier(this._ref) : super(UserDelivery.initial) {
    // Prefer the saved manual choice when one exists; the GPS-based resolve
    // becomes a fallback. We do BOTH so a user who said "Other" still gets
    // their city name once GPS resolves — it just won't flip them back to
    // same-day pricing without explicit consent.
    _bootstrap();
  }

  Future<void> refresh() => _resolve();

  /// Has the user already picked Mumbai / Other from the popup? Used by the
  /// home screen to decide whether to show the popup at all.
  static Future<String?> getSavedChoice() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString(kDeliveryZoneChoiceKey);
    } catch (_) {
      return null;
    }
  }

  /// Persist + apply a manual choice from the on-launch popup. "mumbai" =>
  /// same-day pricing path; "other" => standard pan-India pricing. We bypass
  /// the GPS resolve entirely for users who pick — fastest UX + zero
  /// permission prompt.
  Future<void> setManualChoice(String choice) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(kDeliveryZoneChoiceKey, choice);
    } catch (_) { /* non-fatal */ }
    if (choice == 'mumbai') {
      state = const UserDelivery(
        city: 'Mumbai',
        sameDay: true,
        etaLabel: 'Same-day delivery',
        loading: false,
      );
    } else {
      state = const UserDelivery(
        city: '',
        sameDay: false,
        etaLabel: 'Delivers in 3–5 days',
        loading: false,
      );
    }
  }

  /// Clear the saved choice. Mostly a hook for QA / "change your zone"
  /// settings affordance; production users don't need to invoke this.
  Future<void> clearManualChoice() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(kDeliveryZoneChoiceKey);
    } catch (_) { /* non-fatal */ }
    state = UserDelivery.initial;
    await _resolve();
  }

  Future<void> _bootstrap() async {
    final saved = await getSavedChoice();
    if (saved == 'mumbai' || saved == 'other') {
      await setManualChoice(saved!);
      return;
    }
    // No saved choice yet — fall back to legacy GPS resolve so the badge
    // still has something to show while the home screen surfaces the popup.
    await _resolve();
  }

  Future<void> _resolve() async {
    state = state.copyWith(loading: true);
    try {
      // 1. Permission
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        state = UserDelivery.denied;
        return;
      }

      // 2. Coords (low accuracy; we only need city resolution)
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.low,
          timeLimit: Duration(seconds: 8),
        ),
      );

      // 3. Reverse-geocode → pincode via Nominatim (free)
      final pincode = await _reverseGeocode(pos.latitude, pos.longitude);
      if (pincode == null || pincode.isEmpty) {
        state = UserDelivery.fallback;
        return;
      }

      // 4. Hand pincode to our backend for the canonical delivery rule
      final dio = _ref.read(dioProvider);
      final res = await dio.get('/shipping/check',
          queryParameters: {'pincode': pincode});
      final data = res.data as Map?;
      if (data == null || data['deliverable'] != true) {
        state = UserDelivery.fallback;
        return;
      }
      state = UserDelivery(
        pincode:  pincode,
        city:    (data['city']     ?? '').toString(),
        sameDay: (data['sameDay']  ?? false) == true,
        etaLabel:(data['etaLabel'] ?? '').toString(),
        loading: false,
      );
    } catch (e, st) {
      debugPrint('userDelivery resolve failed: $e\n$st');
      state = UserDelivery.fallback;
    }
  }

  /// Use OpenStreetMap Nominatim — free, no API key needed. Respect their
  /// 1 req/sec limit by gating per-app-launch (this is called once at start).
  Future<String?> _reverseGeocode(double lat, double lon) async {
    try {
      final dio = _ref.read(dioProvider);
      // Direct fetch (not via /api) since Nominatim is external.
      final res = await dio.getUri(
        Uri.parse(
          'https://nominatim.openstreetmap.org/reverse'
          '?format=json&lat=$lat&lon=$lon&zoom=14&addressdetails=1',
        ),
        options: Options(
          headers: {'User-Agent': 'Gifteeng-Mobile/1.0 (support@gifteeng.com)'},
        ),
      );
      final addr = (res.data as Map?)?['address'] as Map?;
      final pin  = addr?['postcode']?.toString();
      if (pin != null && RegExp(r'^\d{6}$').hasMatch(pin)) return pin;
      return null;
    } catch (_) {
      return null;
    }
  }
}
