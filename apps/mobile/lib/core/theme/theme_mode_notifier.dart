// ─── Theme mode preference ──────────────────────────────────────────────────
//
// User-selectable theme: system / light / dark. Persists to SharedPreferences
// under `app.themeMode.v1`. Defaults to `system` so fresh installs respect
// the user's OS setting.
//
// Note: the app is currently styled for dark mode, with light mode support
// at the Theme level. Many custom widgets still reference hardcoded
// `GColors.*` values and will stay dark. A separate migration pass is
// needed to convert those to `GColors.of(context).*` (see GColors in
// app_theme.dart). This scaffold ships the toggle + light theme so the
// migration can roll out screen-by-screen.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _kThemeModeKey = 'app.themeMode.v1';

class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  ThemeModeNotifier() : super(ThemeMode.light) {
    _hydrate();
  }

  Future<void> _hydrate() async {
    try {
      final sp = await SharedPreferences.getInstance();
      final raw = sp.getString(_kThemeModeKey);
      switch (raw) {
        case 'system': state = ThemeMode.system; break;
        case 'light':  state = ThemeMode.light;  break;
        case 'dark':   state = ThemeMode.dark;   break;
        default:       state = ThemeMode.light;  break; // light as default
      }
    } catch (_) {}
  }

  Future<void> setMode(ThemeMode mode) async {
    state = mode;
    final sp = await SharedPreferences.getInstance();
    final label = mode == ThemeMode.system
        ? 'system'
        : (mode == ThemeMode.light ? 'light' : 'dark');
    await sp.setString(_kThemeModeKey, label);
  }
}

final themeModeNotifierProvider =
    StateNotifierProvider<ThemeModeNotifier, ThemeMode>((_) => ThemeModeNotifier());
