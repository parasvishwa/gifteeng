// ─── Mobile analytics service (event tracking) ───────────────────────────────
//
// Fires lightweight events to the backend for product-analytics and admin
// observability. Design priorities:
//
//  1. Never block the UI — all calls return instantly; IO happens on a queue
//  2. Batch to reduce network chatter — flush every 10s or on app pause
//  3. Survive offline — queue persists to SharedPreferences until flush OK
//  4. Drop gracefully — a 404/500 loses the event, not the user's session
//  5. Privacy-safe — no PII in props; admin can scrub via the existing
//     backend-side sanitizer if needed
//
// Usage from anywhere in the app:
//
//   Analytics.track('category_tap', {'id': catId, 'slot': 'bento_hero'});
//   Analytics.screen('/shop/:slug', props: {'productId': id});
//
// Init once in main.dart after `runApp`:
//
//   Analytics.instance.start(ref);
//
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';

/// A single event in the pending queue.
class _QueuedEvent {
  final String path;
  final String? event;
  final Map<String, dynamic>? props;
  final int tsMs;

  const _QueuedEvent({
    required this.path,
    this.event,
    this.props,
    required this.tsMs,
  });

  Map<String, dynamic> toJson() => {
        'path':      path,
        if (event != null) 'event': event,
        if (props != null) 'props': props,
        'timestamp': tsMs,
      };

  factory _QueuedEvent.fromJson(Map<String, dynamic> j) => _QueuedEvent(
        path:  (j['path'] ?? '/').toString(),
        event: j['event'] as String?,
        props: j['props'] is Map ? Map<String, dynamic>.from(j['props']) : null,
        tsMs:  (j['timestamp'] as num?)?.toInt() ?? DateTime.now().millisecondsSinceEpoch,
      );
}

class Analytics with WidgetsBindingObserver {
  Analytics._();
  static final Analytics instance = Analytics._();

  /// Fire-and-forget event track. Safe to call from any isolate/widget.
  static void track(String event, [Map<String, dynamic>? props]) =>
      instance._enqueue(path: '/event', event: event, props: props);

  /// Screen-view track (maps to `event` = null which backend treats as "page_view").
  static void screen(String path, {Map<String, dynamic>? props}) =>
      instance._enqueue(path: path, event: null, props: props);

  // ── Internals ──────────────────────────────────────────────────────────

  static const _kQueueKey    = 'analytics.queue.v1';
  static const _kSessionKey  = 'analytics.session.v1';
  static const _kMaxQueue    = 500;           // cap to prevent unbounded growth
  static const _kFlushEvery  = Duration(seconds: 10);
  static const _kBatchUrl    = '/analytics/track-batch';

  final List<_QueuedEvent> _queue = [];
  Timer? _flushTimer;
  bool _started = false;
  WidgetRef? _ref;
  String? _sessionId;
  String? _appVersion;
  String? _platform;

  /// Wire up the service once on app startup. Call from the root ConsumerState
  /// after ProviderScope is available.
  Future<void> start(WidgetRef ref) async {
    if (_started) return;
    _started = true;
    _ref = ref;

    try {
      _platform = Platform.isIOS ? 'ios' : (Platform.isAndroid ? 'android' : 'other');
    } catch (_) {
      _platform = 'unknown';
    }

    try {
      final info = await PackageInfo.fromPlatform();
      _appVersion = '${info.version}+${info.buildNumber}';
    } catch (_) {}

    // Load session id (stable per install) and any persisted queue.
    final sp = await SharedPreferences.getInstance();
    _sessionId = sp.getString(_kSessionKey);
    if (_sessionId == null) {
      _sessionId = _generateSessionId();
      await sp.setString(_kSessionKey, _sessionId!);
    }
    final persisted = sp.getString(_kQueueKey);
    if (persisted != null && persisted.isNotEmpty) {
      try {
        final list = jsonDecode(persisted) as List;
        for (final raw in list) {
          if (raw is Map) _queue.add(_QueuedEvent.fromJson(Map<String, dynamic>.from(raw)));
        }
      } catch (_) {}
      // Fire a first flush immediately to drain anything left from last run.
      unawaited(_flush());
    }

    // Start the periodic flush loop.
    _flushTimer?.cancel();
    _flushTimer = Timer.periodic(_kFlushEvery, (_) => _flush());

    // Flush on lifecycle transitions (app backgrounding)
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      // Don't await — we don't want to block lifecycle transitions.
      unawaited(_flush());
    }
  }

  void _enqueue({
    required String path,
    String? event,
    Map<String, dynamic>? props,
  }) {
    if (kDebugMode) {
      // Surface in debug console so devs can verify events fire
      debugPrint('[analytics] $event $path ${props ?? ""}');
    }

    if (_queue.length >= _kMaxQueue) {
      // Drop the oldest to keep memory bounded.
      _queue.removeAt(0);
    }
    _queue.add(_QueuedEvent(
      path:  path,
      event: event,
      props: props,
      tsMs:  DateTime.now().millisecondsSinceEpoch,
    ));

    // Persist asynchronously so a crash doesn't lose events.
    unawaited(_persist());
  }

  Future<void> _persist() async {
    try {
      final sp = await SharedPreferences.getInstance();
      final json = jsonEncode(_queue.map((e) => e.toJson()).toList());
      await sp.setString(_kQueueKey, json);
    } catch (_) {}
  }

  Future<void> _flush() async {
    if (_queue.isEmpty || _ref == null || _sessionId == null) return;

    // Snapshot + clear the queue so new events don't interfere with this flush.
    final batch = List<_QueuedEvent>.from(_queue);
    _queue.clear();
    await _persist();

    try {
      final dio = _ref!.read(dioProvider);
      await dio.post(_kBatchUrl, data: {
        'sessionId':  _sessionId,
        'platform':   _platform,
        'appVersion': _appVersion,
        'events':     batch.map((e) => e.toJson()).toList(),
      });
    } catch (_) {
      // On failure, re-queue the batch so we can try again on next flush.
      _queue.insertAll(0, batch);
      // Trim to cap so a long-offline session doesn't grow unboundedly.
      while (_queue.length > _kMaxQueue) {
        _queue.removeAt(0);
      }
      await _persist();
    }
  }

  String _generateSessionId() {
    // Short, stable per-install identifier. Not cryptographic — just needs
    // to be unique enough to group a user's events across sessions.
    final now = DateTime.now().millisecondsSinceEpoch;
    final rand = (now ^ (now >> 17)).toRadixString(36);
    return 'm-$rand';
  }
}
