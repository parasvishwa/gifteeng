// Realtime cross-device sync (#50).
//
// Opens a streaming HTTP connection to /api/me/events for the logged-in
// customer (server-sent events) and invalidates the matching Riverpod
// providers on every "invalidate" event. Auto-reconnects on disconnect
// with exponential backoff capped at 30 s. Tears down on logout.
//
// Also re-runs every refresh path on app-resume (focus-pull fallback)
// so a user who backgrounded the app and is foregrounded sees the
// latest state immediately, even if SSE was suspended.

import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../features/home/presentation/screens/home_screen.dart' show coinBalanceProvider;
import '../../features/home/presentation/screens/shell_screen.dart' show cartItemCountProvider;
import '../../features/cart/presentation/screens/cart_screen.dart' show cartProvider;
import '../../features/cart/presentation/widgets/cart_winnings.dart' show rewardsProvider;
import '../../features/account/presentation/screens/account_screen.dart' show profileProvider;

const _kBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://new-api.gifteeng.com/api',
);
const _kTokenKey = 'gifteeng.b2c.token';

class _SseChannel {
  _SseChannel({required this.label, required this.url, required this.requireAuth});
  final String label;          // diagnostic only
  final String url;
  final bool   requireAuth;    // user channel needs token; public doesn't
  StreamSubscription? sub;
  Dio?  dio;
  Timer? reconnect;
  int   backoffMs = 1500;
}

class RealtimeSync extends WidgetsBindingObserver {
  RealtimeSync(this.ref);
  final Ref ref;

  late final _SseChannel _userCh = _SseChannel(
    label: 'user',
    url: '$_kBaseUrl/me/events',
    requireAuth: true,
  );
  late final _SseChannel _publicCh = _SseChannel(
    label: 'public',
    url: '$_kBaseUrl/public/events',
    requireAuth: false,
  );
  bool _stopped = false;

  Future<void> start() async {
    WidgetsBinding.instance.addObserver(this);
    _connect(_userCh);
    _connect(_publicCh);
  }

  Future<void> dispose() async {
    _stopped = true;
    WidgetsBinding.instance.removeObserver(this);
    for (final ch in [_userCh, _publicCh]) {
      ch.reconnect?.cancel();
      await ch.sub?.cancel();
      ch.dio?.close(force: true);
    }
  }

  Future<void> _connect(_SseChannel ch) async {
    if (_stopped) return;
    String? token;
    if (ch.requireAuth) {
      token = await const FlutterSecureStorage(
        aOptions: AndroidOptions(encryptedSharedPreferences: true),
      ).read(key: _kTokenKey);
      if (token == null || token.isEmpty) {
        // Not logged in → retry the user channel in 30 s. The public
        // channel keeps running independently.
        ch.reconnect = Timer(const Duration(seconds: 30), () => _connect(ch));
        return;
      }
    }

    ch.dio = Dio();
    try {
      final url = ch.requireAuth
          ? '${ch.url}?token=${Uri.encodeQueryComponent(token!)}'
          : ch.url;
      final response = await ch.dio!.get<ResponseBody>(
        url,
        options: Options(
          responseType: ResponseType.stream,
          headers: {
            'Accept':        'text/event-stream',
            'Cache-Control': 'no-cache',
            if (ch.requireAuth) 'Authorization': 'Bearer $token',
          },
          // Long-lived connection — disable receive timeout entirely.
          receiveTimeout: Duration.zero,
        ),
      );

      ch.backoffMs = 1500; // reset on successful connect

      final body = response.data;
      if (body == null) {
        _scheduleReconnect(ch);
        return;
      }
      // Dio body.stream is Stream<Uint8List>; cast to Stream<List<int>>
      // so utf8.decoder (a StreamTransformer<List<int>, String>) accepts
      // it without a generic-variance mismatch, then LineSplitter to
      // emit one SSE line at a time.
      final lines = body.stream
          .cast<List<int>>()
          .transform(utf8.decoder)
          .transform(const LineSplitter());

      String? lastEvent;
      final dataBuf = StringBuffer();

      ch.sub = lines.cast<String>().listen(
        (s) {
          if (s.isEmpty) {
            if (lastEvent == 'invalidate' && dataBuf.isNotEmpty) {
              _handleInvalidate(dataBuf.toString());
            }
            lastEvent = null;
            dataBuf.clear();
            return;
          }
          if (s.startsWith(':')) return;                  // ping comment
          if (s.startsWith('event: ')) {
            lastEvent = s.substring(7).trim();
            return;
          }
          if (s.startsWith('data: ')) {
            if (dataBuf.isNotEmpty) dataBuf.write('\n');
            dataBuf.write(s.substring(6));
            return;
          }
        },
        onError: (_) => _scheduleReconnect(ch),
        onDone:  ()  => _scheduleReconnect(ch),
        cancelOnError: true,
      );
    } catch (_) {
      _scheduleReconnect(ch);
    }
  }

  void _scheduleReconnect(_SseChannel ch) {
    if (_stopped) return;
    ch.sub?.cancel();
    ch.dio?.close(force: true);
    ch.reconnect?.cancel();
    ch.reconnect = Timer(Duration(milliseconds: ch.backoffMs), () => _connect(ch));
    ch.backoffMs = (ch.backoffMs * 2).clamp(1500, 30000);
  }

  void _handleInvalidate(String json) {
    try {
      final m = jsonDecode(json) as Map<String, dynamic>;
      final scope = (m['scope'] as String?) ?? '';
      _invalidateScope(scope);
    } catch (_) { /* ignore */ }
  }

  /// Map scope → Riverpod provider invalidations. The next `ref.watch`
  /// in any consumer triggers a fresh fetch.
  void _invalidateScope(String scope) {
    // Always-on providers (used by top-level chrome / tabs).
    switch (scope) {
      case 'cart':
        try { ref.invalidate(cartProvider); } catch (_) {}
        try { ref.invalidate(cartItemCountProvider); } catch (_) {}
        // Reward state lives on the customer; if cart changes the
        // available + applied rewards may change too (a reward
        // expired, a stack rule kicked in). Cheap to re-fetch.
        try { ref.invalidate(rewardsProvider); } catch (_) {}
        return;
      case 'goins':
        try { ref.invalidate(coinBalanceProvider); } catch (_) {}
        // New scratch-card / spin-wheel wins arrive via the goins scope.
        try { ref.invalidate(rewardsProvider); } catch (_) {}
        return;
      case 'profile':
        try { ref.invalidate(profileProvider); } catch (_) {}
        return;
    }

    // Global content scopes — the providers that read these are
    // FutureProvider.autoDispose, so calling ref.invalidate() works
    // when the screen is mounted and is a no-op otherwise (the next
    // mount will fetch fresh anyway). Broadcasting via the event bus
    // also lets each screen run a custom refetch path if needed.
    _broadcast(scope);
  }

  /// Push a scope name onto the in-app event bus so any mounted screen
  /// can listen and refetch. Mirrors the web's window CustomEvent.
  void _broadcast(String scope) {
    realtimeBus.add(scope);
  }

  // ── App lifecycle: refresh on resume (focus-pull fallback) ───────────

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Force-refresh the always-on providers + broadcast all scopes.
      _invalidateScope('cart');
      _invalidateScope('goins');
      _invalidateScope('profile');
      for (final s in const [
        'wishlist', 'orders',
        'products', 'categories', 'collections',
        'banners', 'announcements', 'testimonials',
        'settings', 'homepage', 'customizer',
      ]) {
        _broadcast(s);
      }
      // Re-open dead channels.
      if (_userCh.sub == null)   _connect(_userCh);
      if (_publicCh.sub == null) _connect(_publicCh);
    }
  }
}

/// In-app event bus — RealtimeSync emits scope names here. Any screen
/// can subscribe via `realtimeBus.stream.listen(...)` to refetch its
/// own data when the relevant scope changes. Web's equivalent is the
/// window CustomEvent("gifteeng:invalidate").
final StreamController<String> realtimeBus =
    StreamController<String>.broadcast();

final realtimeSyncProvider = Provider<RealtimeSync>((ref) {
  final s = RealtimeSync(ref);
  ref.onDispose(s.dispose);
  return s;
});
