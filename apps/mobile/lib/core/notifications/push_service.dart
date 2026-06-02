// ─── Push notifications (FCM) ────────────────────────────────────────────────
//
// Wraps firebase_messaging behind a service that *never crashes the app* if
// Firebase config files are missing. This lets you ship the mobile code now
// and drop in google-services.json / GoogleService-Info.plist later to
// light up push — no code changes.
//
// Flow:
//  1. `PushService.init(ref)` — called from the root ConsumerState. Tries
//     Firebase.initializeApp() inside a try/catch. If it fails (no config
//     files), logs + returns — the rest of the app runs unchanged.
//  2. If init OK: ask notification permission, subscribe to token changes,
//     register the current token with the backend (if user is logged in).
//  3. Foreground messages → show a SnackBar banner.
//  4. Tap on notification (background/terminated) → deep-link via `data.route`.
//
// Backend contract (already live):
//   POST /api/notifications/register-token  { token, platform, appVersion }
//   POST /api/notifications/unregister-token { token }
//
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../analytics/analytics_service.dart';
import '../api/api_client.dart';
import '../router/app_router.dart';

class PushService {
  PushService._();
  static final PushService instance = PushService._();

  bool _initTried = false;
  bool _initOk    = false;
  String? _currentToken;
  WidgetRef? _ref;

  /// Must be called from the root ConsumerState after the ProviderScope is
  /// ready. Safe to call multiple times — idempotent.
  Future<void> init(WidgetRef ref) async {
    if (_initTried) return;
    _initTried = true;
    _ref = ref;

    // ── 1. Firebase.initializeApp() — may throw if no config files are
    //      bundled (google-services.json / GoogleService-Info.plist).
    //      We try the resource-based init first; if it fails we fall back
    //      to explicit placeholder options so the native plugin never hard-
    //      crashes. FCM token registration will still fail (returns 401 from
    //      the non-existent project), which is caught below — the app runs
    //      fine without push until real Firebase config files are added.
    try {
      await Firebase.initializeApp();
      _initOk = true;
    } catch (_) {
      try {
        await Firebase.initializeApp(
          options: const FirebaseOptions(
            apiKey:            'placeholder-replace-with-real-config',
            appId:             '1:000000000000:android:0000000000000000000000',
            messagingSenderId: '000000000000',
            projectId:         'gifteeng-placeholder',
            storageBucket:     'gifteeng-placeholder.appspot.com',
          ),
        );
        // Initialized with placeholders — tokens won't work but app won't crash.
        debugPrint('[push] Firebase using placeholder config — push disabled until real google-services.json is added');
      } catch (err2, st2) {
        debugPrint('[push] Firebase init failed completely — push disabled: $err2');
        debugPrint(st2.toString());
        return;
      }
    }

    // ── 2. Permission — soft ask. The user can toggle later from Settings.
    try {
      final settings = await FirebaseMessaging.instance.requestPermission(
        alert: true, badge: true, sound: true,
      );
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        debugPrint('[push] notification permission denied');
      }
    } catch (err) {
      debugPrint('[push] permission request failed: $err');
    }

    // ── 3. Token. Get initial + listen for rotations.
    try {
      _currentToken = await FirebaseMessaging.instance.getToken();
      await _maybeRegisterToken();
      FirebaseMessaging.instance.onTokenRefresh.listen((t) async {
        _currentToken = t;
        await _maybeRegisterToken();
      });
    } catch (err) {
      debugPrint('[push] getToken failed: $err');
    }

    // ── 4. Message listeners.
    FirebaseMessaging.onMessage.listen(_onForeground);
    FirebaseMessaging.onMessageOpenedApp.listen(_onOpenedFromBackground);

    // Terminated tap → look up the initial message at boot
    try {
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _onOpenedFromBackground(initial);
        });
      }
    } catch (_) {}
  }

  /// Register the current FCM token with the backend. Called on init + on
  /// login (ref callable from auth flow).
  Future<void> onUserLoggedIn() async {
    if (!_initOk) return;
    await _maybeRegisterToken();
  }

  /// Unregister on logout so pushes stop until next login.
  Future<void> onUserLoggedOut() async {
    if (!_initOk || _currentToken == null || _ref == null) return;
    try {
      final dio = _ref!.read(dioProvider);
      await dio.post('/notifications/unregister-token', data: {
        'token': _currentToken,
      });
    } catch (_) {}
  }

  Future<void> _maybeRegisterToken() async {
    if (_currentToken == null || _ref == null) return;
    try {
      final dio = _ref!.read(dioProvider);
      String? appVersion;
      try {
        final info = await PackageInfo.fromPlatform();
        appVersion = '${info.version}+${info.buildNumber}';
      } catch (_) {}
      await dio.post('/notifications/register-token', data: {
        'token':      _currentToken,
        'platform':   Platform.isIOS ? 'ios' : 'android',
        if (appVersion != null) 'appVersion': appVersion,
      });
      Analytics.track('push_token_registered');
    } catch (err) {
      // If we're not logged in yet, backend returns 401 — that's fine, we'll
      // retry from onUserLoggedIn.
      debugPrint('[push] register-token failed (expected if unauth): $err');
    }
  }

  // ─── Message handlers ───────────────────────────────────────────────────

  void _onForeground(RemoteMessage msg) {
    final notif = msg.notification;
    if (notif == null) return;
    Analytics.track('push_received_foreground', {
      'type': msg.data['type']?.toString() ?? 'unknown',
    });
    // Show an in-app snackbar. We use the GoRouter's current navigator so
    // the banner appears regardless of which screen is up.
    final ctx = _scaffoldKey?.currentContext;
    if (ctx == null) return;
    ScaffoldMessenger.of(ctx).showSnackBar(
      SnackBar(
        content: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if ((notif.title ?? '').isNotEmpty)
              Text(notif.title!, style: const TextStyle(fontWeight: FontWeight.bold)),
            if ((notif.body ?? '').isNotEmpty)
              Text(notif.body!),
          ],
        ),
        action: msg.data['route'] != null
            ? SnackBarAction(
                label: 'Open',
                onPressed: () => _navigateFromData(msg.data),
              )
            : null,
        duration: const Duration(seconds: 5),
      ),
    );
  }

  void _onOpenedFromBackground(RemoteMessage msg) {
    Analytics.track('push_tap_open', {
      'type': msg.data['type']?.toString() ?? 'unknown',
    });
    _navigateFromData(msg.data);
  }

  void _navigateFromData(Map<String, dynamic> data) {
    final route = (data['route'] ?? '').toString();
    if (route.isEmpty) return;
    // Defer to next frame so we don't navigate during a dispatch.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = _scaffoldKey?.currentContext;
      if (ctx == null) return;
      try {
        ctx.push(route);
      } catch (_) {}
    });
  }

  // Let the app set a scaffold key so we have a context for SnackBars.
  static GlobalKey<ScaffoldMessengerState>? _scaffoldKey;
  static set scaffoldMessengerKey(GlobalKey<ScaffoldMessengerState> key) {
    _scaffoldKey = key;
  }
}

/// Router observer reference for PushService navigation target.
// Note: import kept for potential future use; currently routes through
// `ctx.push()` via GoRouter context extension.
// ignore: unused_element
void _touchRouterImport() {
  // Ensure the app_router import isn't tree-shaken out in release.
  // ignore: unused_local_variable
  final _ = appRouterProvider;
}
