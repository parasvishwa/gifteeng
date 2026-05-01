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
  defaultValue: 'https://new-api.gifteeng.com/api',
);

const _kTokenKey   = 'gifteeng.b2c.token';
const _kSessionKey = 'gifteeng.cart.session';

// ─── Storage provider ────────────────────────────────────────────────────────

@riverpod
FlutterSecureStorage secureStorage(Ref ref) =>
    const FlutterSecureStorage(
      aOptions: AndroidOptions(encryptedSharedPreferences: true),
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

  Future<void> clearToken() async {
    final storage = ref.read(secureStorageProvider);
    await storage.delete(key: _kTokenKey);
    state = const AsyncValue.data(null);
    // Clear Sentry user — subsequent errors are attributed to anon session
    await setSentryUser(id: null);
    // Tell the backend to stop pushing to this device.
    unawaited(PushService.instance.onUserLoggedOut());
  }

  bool get isLoggedIn => state.valueOrNull != null;
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
