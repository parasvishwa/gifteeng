// ─── App locale preference ──────────────────────────────────────────────────
//
// User-selectable language. Persists to SharedPreferences under
// `app.locale.v1`. Read the current locale via `localeNotifierProvider`
// and feed it into MaterialApp.locale.
//
// Falls back to null (→ system locale) when no preference set; the
// MaterialApp resolves against supportedLocales.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _kLocaleKey = 'app.locale.v1';

/// Supported locales — keep in sync with supportedLocales in MaterialApp
/// and the .arb files in lib/l10n/.
const kSupportedLocales = <Locale>[
  Locale('en'),
  Locale('hi'),
  Locale('mr'),
];

class LocaleNotifier extends StateNotifier<Locale?> {
  LocaleNotifier() : super(null) {
    _hydrate();
  }

  Future<void> _hydrate() async {
    try {
      final sp = await SharedPreferences.getInstance();
      final raw = sp.getString(_kLocaleKey);
      if (raw == null || raw.isEmpty) return;
      state = Locale(raw);
    } catch (_) {}
  }

  Future<void> setLocale(Locale? locale) async {
    state = locale;
    final sp = await SharedPreferences.getInstance();
    if (locale == null) {
      await sp.remove(_kLocaleKey);
    } else {
      await sp.setString(_kLocaleKey, locale.languageCode);
    }
  }
}

final localeNotifierProvider =
    StateNotifierProvider<LocaleNotifier, Locale?>((_) => LocaleNotifier());
