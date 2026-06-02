// ─── Sentry (error + performance monitoring) ─────────────────────────────────
//
// Wraps runApp() so every uncaught exception, Flutter framework error, Dio
// HTTP error, and router navigation is captured with full context.
//
// Usage from main.dart:
//
//   import 'core/monitoring/sentry_setup.dart';
//
//   void main() {
//     runGifteengApp(
//       () => runApp(const ProviderScope(child: GifteengApp())),
//     );
//   }
//
// DSN is read from the `SENTRY_DSN` dart-define so the key never lives in
// source control. Build release APKs with:
//
//   flutter build apk --release --dart-define=SENTRY_DSN=https://xxx@yyy.ingest.sentry.io/zzz
//
// If DSN is empty (debug / local dev), Sentry is skipped silently so dev
// builds don't spam the Sentry project with local errors.
//
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:package_info_plus/package_info_plus.dart';

const String _kSentryDsn = String.fromEnvironment('SENTRY_DSN');
const String _kEnvironment =
    String.fromEnvironment('SENTRY_ENV', defaultValue: 'production');

/// Bootstraps the app inside a Sentry-captured zone. Any uncaught error
/// anywhere in [appRunner] (including async microtasks) is reported.
///
/// Call this INSTEAD of `runApp` from `main()`.
Future<void> runGifteengApp(FutureOr<void> Function() appRunner) async {
  WidgetsFlutterBinding.ensureInitialized();

  // No DSN → skip Sentry entirely (dev / local builds).
  if (_kSentryDsn.isEmpty) {
    if (kDebugMode) {
      debugPrint('[sentry] SENTRY_DSN not set — skipping init (dev build)');
    }
    await appRunner();
    return;
  }

  // Read version info so Sentry can group crashes by release.
  String release = 'gifteeng@unknown';
  try {
    final info = await PackageInfo.fromPlatform();
    release = 'gifteeng@${info.version}+${info.buildNumber}';
  } catch (_) {}

  await SentryFlutter.init(
    (options) {
      options.dsn = _kSentryDsn;
      options.environment   = _kEnvironment;
      options.release       = release;

      // Capture 100% of errors. Tune performance sampling down since traces
      // are expensive and we only need a signal on hot paths.
      options.tracesSampleRate       = 0.15;
      options.profilesSampleRate     = 0.15;
      options.sampleRate             = 1.0;

      // Breadcrumbs come from Flutter framework events (tap, widget
      // lifecycle, route change). Keep them — they're gold for debugging.
      options.maxBreadcrumbs         = 60;
      options.attachScreenshot       = true;
      options.attachViewHierarchy    = true;

      // Scrub any PII before sending — emails, phone numbers, OTP codes.
      options.sendDefaultPii         = false;
      options.beforeSend = _scrubPii;

      if (kDebugMode) {
        options.debug = true;
        // Only report in debug if DSN explicitly set (we already gated above)
        options.tracesSampleRate = 0.0;
      }
    },
    appRunner: appRunner,
  );
}

// Explicit list of sensitive substring matches. Maintaining this as a
// constant beats relying on memory while editing — every key recently
// flagged in security audits gets a line here. See docs/SECURITY_AUDIT.md
// L-5: temp-password, access-token, invite-token, GST PII fields, etc.
const List<String> _kSensitiveKeyFragments = [
  // Credentials / auth
  'otp', 'password', 'tempPassword', 'temp_password', 'pin',
  'token', 'accesstoken', 'access_token', 'refreshtoken', 'refresh_token',
  'invite_token', 'invitetoken', 'invite_url', 'inviteurl',
  'apikey', 'api_key', 'authorization', 'authentication',
  // Payment
  'razorpay_signature', 'cvv', 'cardnumber', 'card_number', 'card', 'upi',
  // Secrets / config
  'secret', 'private', 'session',
  // PII
  'aadhaar', 'pan', 'gstin', 'ifsc',
];

bool _isSensitiveKey(String key) {
  final lower = key.toLowerCase();
  for (final frag in _kSensitiveKeyFragments) {
    if (lower.contains(frag)) return true;
  }
  return false;
}

/// Scrub potential PII from error payloads before shipping to Sentry.
FutureOr<SentryEvent?> _scrubPii(SentryEvent event, Hint hint) {
  try {
    // Drop any captured OTP codes, tokens, payment details, etc. that
    // may have leaked into breadcrumbs (pinput widgets, dio interceptors,
    // analytics events).
    final newBreadcrumbs = event.breadcrumbs?.map((b) {
      final data = b.data;
      if (data == null) return b;
      final scrubbed = <String, Object?>{};
      data.forEach((k, v) {
        if (_isSensitiveKey(k)) {
          scrubbed[k] = '[redacted]';
        } else if (v is String && v.length > 200) {
          // Long strings are typically request bodies or stack traces —
          // truncate so payment-page HTML/JSON doesn't ride along.
          scrubbed[k] = '${v.substring(0, 200)}…[truncated]';
        } else {
          scrubbed[k] = v;
        }
      });
      return b.copyWith(data: scrubbed);
    }).toList();

    // Strip Authorization headers + bodies from network breadcrumbs.
    // (Sentry's default Flutter integration captures dio request data.)
    final cleansed = newBreadcrumbs?.map((b) {
      if (b.category != 'http' && b.category != 'network') return b;
      final data = b.data;
      if (data == null) return b;
      final stripped = Map<String, Object?>.from(data);
      stripped.removeWhere((k, _) =>
          k.toLowerCase() == 'authorization' ||
          k.toLowerCase() == 'cookie' ||
          k.toLowerCase() == 'set-cookie');
      return b.copyWith(data: stripped);
    }).toList();

    // Tag OS for faster filtering in the Sentry UI.
    final tags = Map<String, String>.from(event.tags ?? const {});
    try { tags['os'] = Platform.operatingSystem; } catch (_) {}

    return event.copyWith(breadcrumbs: cleansed, tags: tags);
  } catch (_) {
    return event;
  }
}

/// Set (or clear) the current user context — call on login/logout so
/// Sentry groups errors by customer and lets you filter "errors for user X".
Future<void> setSentryUser({
  String? id,
  String? username,
}) async {
  if (_kSentryDsn.isEmpty) return;
  await Sentry.configureScope((scope) async {
    if (id == null) {
      await scope.setUser(null);
    } else {
      await scope.setUser(SentryUser(
        id: id,
        username: username,
      ));
    }
  });
}

/// Report a non-fatal issue with a message (for logical errors that didn't
/// throw but we still want visibility on — e.g. "pack reveal empty list").
Future<void> captureMessage(
  String message, {
  SentryLevel level = SentryLevel.warning,
  Map<String, String>? tags,
}) async {
  if (_kSentryDsn.isEmpty) return;
  await Sentry.captureMessage(
    message,
    level: level,
    withScope: tags == null
        ? null
        : (scope) {
            tags.forEach(scope.setTag);
          },
  );
}
