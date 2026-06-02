import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../monitoring/sentry_setup.dart';
import '../notifications/push_service.dart';
import '../analytics/analytics_service.dart';

part 'api_client.g.dart';

/// Base URL — switch via flavors or env vars at build time.
const _kBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://www.gifteeng.com/api',
);

const _kTokenKey   = 'gifteeng.b2c.token';
const _kSessionKey = 'gifteeng.cart.session';

// ─── Guest-mode preference ────────────────────────────────────────────────────
//
// Apple App Store Review Guideline 5.1.1(v) requires apps without significant
// account-based features to let users in without login. We let the user tap
// "Continue as guest" on the auth screen → flip this pref to true → they can
// browse Home/Shop/Product/Casino without auth. Account-required actions
// (cart, orders, wishlist) gate inline.
const _kGuestModeKey = 'gifteeng.guest_mode';

// ─── Storage provider ────────────────────────────────────────────────────────

@riverpod
FlutterSecureStorage secureStorage(Ref ref) =>
    const FlutterSecureStorage(
      // `encryptedSharedPreferences: true` (Jetpack Security
      // EncryptedSharedPreferences) was throwing on Samsung One UI / Fold 7:
      //
      //   E/SecureStorageAndroid: FlutterSecureStorage
      //     .initializeEncryptedSharedPreferencesManager (line 248)
      //     .ensureInitialized (line 170)
      //
      // Every read/write/delete then hung indefinitely, which manifested as
      // the "black screen on sign-out + token persists after restart" bug
      // (storage.delete never returned → UI thread blocked → no rebuild).
      //
      // Falling back to the plugin's default Android Keystore impl
      // (encryptedSharedPreferences: false) — slightly older, but reliable
      // across all OEMs we ship on.
      aOptions: AndroidOptions(encryptedSharedPreferences: false),
    );

// ─── Dio instance ─────────────────────────────────────────────────────────────

@riverpod
Dio dio(Ref ref) {
  final storage = ref.watch(secureStorageProvider);

  final d = Dio(
    BaseOptions(
      baseUrl: _kBaseUrl,
      connectTimeout: const Duration(seconds: 12),
      receiveTimeout: const Duration(seconds: 30),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Audience': 'b2c',
        'X-App-Platform': 'flutter',
      },
    ),
  );

  // Auth interceptor: attach JWT + session key on every request.
  d.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token   = await storage.read(key: _kTokenKey);
        final session = await storage.read(key: _kSessionKey);
        if (token   != null) options.headers['Authorization'] = 'Bearer $token';
        if (session != null) options.headers['X-Cart-Session'] = session;
        handler.next(options);
      },
      onError: (e, handler) {
        // 401 → clear stored token (session expired)
        if (e.response?.statusCode == 401) {
          storage.delete(key: _kTokenKey);
        }
        handler.next(e);
      },
    ),
  );

  // Sentry breadcrumb interceptor — every HTTP request/response/error lands
  // on the breadcrumb trail so we get a full request history leading up to
  // any crash. Status code + method + truncated path only (no bodies) to
  // keep events small and avoid accidentally leaking PII.
  d.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        Sentry.addBreadcrumb(Breadcrumb(
          type: 'http',
          category: 'http.request',
          level: SentryLevel.info,
          data: {
            'method': options.method,
            'url':    _safePath(options.path),
          },
        ));
        handler.next(options);
      },
      onResponse: (response, handler) {
        final status = response.statusCode ?? 0;
        Sentry.addBreadcrumb(Breadcrumb(
          type: 'http',
          category: 'http.response',
          level: status >= 400 ? SentryLevel.warning : SentryLevel.info,
          data: {
            'method':      response.requestOptions.method,
            'url':         _safePath(response.requestOptions.path),
            'status_code': status,
          },
        ));
        handler.next(response);
      },
      onError: (err, handler) {
        final status = err.response?.statusCode ?? 0;
        // Attach HTTP error as a breadcrumb — the real exception is already
        // thrown and Sentry will capture it if uncaught. 5xx errors we
        // also proactively report as a non-fatal so we see backend outages.
        Sentry.addBreadcrumb(Breadcrumb(
          type: 'http',
          category: 'http.error',
          level: SentryLevel.error,
          data: {
            'method':      err.requestOptions.method,
            'url':         _safePath(err.requestOptions.path),
            'status_code': status,
            'type':        err.type.toString(),
          },
        ));
        if (status >= 500) {
          Sentry.captureMessage(
            '5xx from ${err.requestOptions.method} ${_safePath(err.requestOptions.path)}',
            level: SentryLevel.error,
          );
        }
        // Also fire an analytics event so the admin Activity Feed surfaces
        // errors users hit. Skip the analytics endpoint itself to avoid loops.
        final path = _safePath(err.requestOptions.path);
        if (!path.contains('/analytics/')) {
          // Extract error message — server usually sends { message: "..." }
          String message = err.message ?? err.type.toString();
          final data = err.response?.data;
          if (data is Map && data['message'] is String) {
            message = data['message'] as String;
          } else if (data is Map && data['error'] is String) {
            message = data['error'] as String;
          }
          Analytics.track('error', {
            'status':  status,
            'method':  err.requestOptions.method,
            'path':    path,
            'message': message.length > 200 ? message.substring(0, 200) : message,
            'type':    err.type.toString(),
          });
        }
        handler.next(err);
      },
    ),
  );

  // Log in debug mode only.
  assert(() {
    d.interceptors.add(LogInterceptor(
      requestBody: true,
      responseBody: true,
      logPrint: (o) => debugPrint(o.toString()),
    ));
    return true;
  }());

  return d;
}

/// Strip query string so breadcrumbs don't leak OTPs / tokens / pincodes.
String _safePath(String url) {
  final q = url.indexOf('?');
  return q < 0 ? url : url.substring(0, q);
}

// ─── Token helpers ────────────────────────────────────────────────────────────

@riverpod
class AuthTokenNotifier extends _$AuthTokenNotifier {
  @override
  Future<String?> build() async {
    final storage = ref.watch(secureStorageProvider);
    return storage.read(key: _kTokenKey);
  }

  Future<void> saveToken(String token) async {
    final storage = ref.read(secureStorageProvider);
    await storage.write(key: _kTokenKey, value: token);
    state = AsyncValue.data(token);
    // Clear guest mode — they're a real user now.
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_kGuestModeKey, false);
      ref.invalidate(guestModeNotifierProvider);
    } catch (_) {}
    // Tag Sentry with the customer id so crashes are attributable. The
    // JWT's `sub` claim carries the customer UUID — no PII, just the id.
    final customerId = _extractSubClaim(token);
    if (customerId != null) {
      await setSentryUser(id: customerId);
    }
    // Now that we're authenticated, push the FCM token to the backend so
    // this device starts receiving order-status + marketing notifications.
    unawaited(PushService.instance.onUserLoggedIn());
  }

  /// Sign the user out.
  ///
  /// IMPORTANT ordering: we set the Riverpod state to `null` BEFORE awaiting
  /// `storage.delete`. Reasoning:
  ///
  ///   • The router's `refreshListenable` listens to this provider. The
  ///     instant `state` flips to null, GoRouter re-runs `redirect`, which
  ///     synchronously navigates the user from `/account` to `/auth`.
  ///   • If we awaited `storage.delete` first, the route would dispose
  ///     mid-flight (the Account screen tearing down while delete is
  ///     pending), producing the black-frame flash the user reported.
  ///
  /// After the navigation completes, we then await storage.delete on the
  /// new (auth) screen's frame — by which point there's no race.
  ///
  /// Defensive double-check: if for any reason the key survives the delete
  /// (some Android keystore implementations have weird quirks where direct
  /// delete fails silently), we overwrite with empty then delete again. This
  /// guarantees the user is actually signed out next launch.
  Future<void> clearToken() async {
    // 1. Flip state first → router redirects immediately, no black flash.
    state = const AsyncValue.data(null);

    // 2. Now clean up persisted token. Wrapped in try/catch so storage
    //    errors never block the UI flow (user is already navigating out).
    try {
      final storage = ref.read(secureStorageProvider);
      await storage.delete(key: _kTokenKey);

      // 3. Verify the delete actually committed. On some Android devices
      //    with corrupted keystores, `delete` is a no-op. Force-overwrite
      //    then re-delete as a fallback so the token can never resurrect
      //    on next launch.
      final stillThere = await storage.read(key: _kTokenKey);
      if (stillThere != null) {
        await storage.write(key: _kTokenKey, value: '');
        await storage.delete(key: _kTokenKey);
      }
    } catch (_) {
      // Storage failures are not user-actionable — swallow but state is
      // already cleared so the user sees the right UI.
    }

    // 4. Sentry + push cleanup (non-blocking).
    try { await setSentryUser(id: null); } catch (_) {}
    unawaited(PushService.instance.onUserLoggedOut());
  }

  bool get isLoggedIn => state.valueOrNull != null;
}

// ─── Guest mode notifier ──────────────────────────────────────────────────────
//
// Tracks whether the user explicitly chose to browse without an account.
// Set to true when the user taps "Continue as guest" on AuthScreen. Cleared
// on successful sign-in (since they're now a real user) and on sign-out
// (so the next launch shows the auth screen again).
@riverpod
class GuestModeNotifier extends _$GuestModeNotifier {
  @override
  Future<bool> build() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_kGuestModeKey) ?? false;
  }

  Future<void> setEnabled(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kGuestModeKey, value);
    state = AsyncValue.data(value);
  }
}

// ─── API error helper ─────────────────────────────────────────────────────────

class ApiException implements Exception {
  final int statusCode;
  final String message;

  const ApiException(this.statusCode, this.message);

  factory ApiException.fromDioError(DioException e) {
    final data = e.response?.data;
    String msg = 'Something went wrong';
    if (data is Map) {
      msg = data['message']?.toString() ?? msg;
    }
    return ApiException(e.response?.statusCode ?? 0, msg);
  }

  @override
  String toString() => 'ApiException($statusCode): $message';
}

// ─── Biometric preference ─────────────────────────────────────────────────────

const _kBioEnabledKey = 'gifteeng.biometric.enabled';

/// Whether the USER has explicitly turned on biometric sign-in.
@riverpod
class BiometricPrefNotifier extends _$BiometricPrefNotifier {
  @override
  Future<bool> build() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_kBioEnabledKey) ?? false;
  }

  Future<void> setEnabled(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kBioEnabledKey, value);
    state = AsyncValue.data(value);
  }
}

/// Wrap any Dio call and convert DioException → ApiException.
Future<T> apiCall<T>(Future<T> Function() fn) async {
  try {
    return await fn();
  } on DioException catch (e) {
    throw ApiException.fromDioError(e);
  }
}

/// Extract the `sub` claim from a JWT without verifying the signature
/// (the server already verified it when issuing + on every request).
/// Returns null if the token is malformed.
String? _extractSubClaim(String jwt) {
  try {
    final parts = jwt.split('.');
    if (parts.length < 2) return null;
    // Base64URL-decode the payload
    String payload = parts[1];
    // Pad to multiple of 4
    final pad = (4 - payload.length % 4) % 4;
    payload = payload + ('=' * pad);
    // Base64URL → Base64 standard
    payload = payload.replaceAll('-', '+').replaceAll('_', '/');
    final bytes = base64Decode(payload);
    final json  = utf8.decode(bytes);
    final map   = jsonDecode(json) as Map<String, dynamic>;
    final sub   = map['sub'] ?? map['customerId'] ?? map['id'];
    return sub?.toString();
  } catch (_) {
    return null;
  }
}
