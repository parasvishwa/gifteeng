// ─── Coin-fly overlay system ──────────────────────────────────────────────────
//
// Global reward animation. When a user earns coins anywhere in the app,
// physical gold coins fly from the source position along a bezier arc to the
// registered coin-balance chip, then the chip elastically pulses.
//
// Setup (done once):
//   Wrap the coin-balance chip in `CoinTarget(child: ...)`. It registers a
//   GlobalKey and listens for pulse events.
//
// Trigger (anywhere coins are earned):
//   CoinFly.burstFromContext(context, amount: 8);
//   CoinFly.burst(context, from: anyOffset, amount: 12);
//
// Tunables:
//   amount — number of coins (clamped 3..24)
//   baseDuration — mean flight duration (jittered per coin)
//
// Design notes:
// * Each coin: randomised scatter origin, unique bezier control point,
//   2–5 full rotations, size jitter (26–36px), stagger delay, solo duration.
// * Path: quadratic bezier from→control→target. Control point is 80–180 px
//   above the midpoint with horizontal sway → natural arc, not a straight
//   line. Coins accelerate into target (easeInQuart).
// * Glow: radial gold gradient + soft outer bloom. Rupee glyph for Indian
//   context (swap to ₹ by default — matches "Goins" currency design).
// * Arrival: target widget does an elastic scale-bump via ValueNotifier
//   pulse + mediumImpact haptic.
//
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

// ─── Registry ─────────────────────────────────────────────────────────────────

class CoinFlyRegistry {
  CoinFlyRegistry._();
  static final instance = CoinFlyRegistry._();

  GlobalKey? _targetKey;
  final ValueNotifier<int> _pulse = ValueNotifier<int>(0);

  ValueListenable<int> get pulseListenable => _pulse;

  void registerTarget(GlobalKey key) {
    _targetKey = key;
  }

  void unregisterTarget(GlobalKey key) {
    if (_targetKey == key) _targetKey = null;
  }

  Offset? get targetCenter {
    final ctx = _targetKey?.currentContext;
    if (ctx == null) return null;
    final box = ctx.findRenderObject() as RenderBox?;
    if (box == null || !box.attached || !box.hasSize) return null;
    final tl = box.localToGlobal(Offset.zero);
    return tl + Offset(box.size.width / 2, box.size.height / 2);
  }

  void pulse() {
    _pulse.value++;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

class CoinFly {
  CoinFly._();

  /// Launch [amount] coins flying from [from] to the registered target.
  /// Completes after the last coin lands; calls [onArrive] too.
  static Future<void> burst(
    BuildContext context, {
    required Offset from,
    int amount = 8,
    Duration baseDuration = const Duration(milliseconds: 900),
    VoidCallback? onArrive,
  }) async {
    final to = CoinFlyRegistry.instance.targetCenter;
    if (to == null) {
      // No target registered — at least pulse a haptic so the user still feels
      // the reward.
      HapticFeedback.lightImpact();
      onArrive?.call();
      return;
    }

    final overlay = Overlay.maybeOf(context, rootOverlay: true);
    if (overlay == null) {
      onArrive?.call();
      return;
    }

    final completer = Completer<void>();
    final n = amount.clamp(3, 24);

    HapticFeedback.lightImpact();

    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (_) => _CoinFlyLayer(
        from: from,
        to: to,
        count: n,
        baseDuration: baseDuration,
        onFinish: () {
          try {
            entry.remove();
          } catch (_) {}
          CoinFlyRegistry.instance.pulse();
          HapticFeedback.mediumImpact();
          onArrive?.call();
          if (!completer.isCompleted) completer.complete();
        },
      ),
    );
    overlay.insert(entry);
    return completer.future;
  }

  /// Fly from the center of the passed [context]'s widget.
  static Future<void> burstFromContext(
    BuildContext context, {
    int amount = 8,
    Duration baseDuration = const Duration(milliseconds: 900),
    VoidCallback? onArrive,
  }) async {
    final box = context.findRenderObject() as RenderBox?;
    if (box == null || !box.attached || !box.hasSize) return;
    final center =
        box.localToGlobal(Offset.zero) +
            Offset(box.size.width / 2, box.size.height / 2);
    return burst(
      context,
      from: center,
      amount: amount,
      baseDuration: baseDuration,
      onArrive: onArrive,
    );
  }

  /// Fly from the center of the widget tied to [fromKey].
  /// The context must still be valid (use any ancestor context for overlay lookup).
  static Future<void> burstFromKey(
    BuildContext overlayContext,
    GlobalKey fromKey, {
    int amount = 8,
    Duration baseDuration = const Duration(milliseconds: 900),
    VoidCallback? onArrive,
  }) async {
    final ctx = fromKey.currentContext;
    if (ctx == null) return;
    final box = ctx.findRenderObject() as RenderBox?;
    if (box == null || !box.attached || !box.hasSize) return;
    final center =
        box.localToGlobal(Offset.zero) +
            Offset(box.size.width / 2, box.size.height / 2);
    return burst(
      overlayContext,
      from: center,
      amount: amount,
      baseDuration: baseDuration,
      onArrive: onArrive,
    );
  }

  /// Pulse the target widget without flying coins (e.g. for silent grants).
  static void pulseTarget() => CoinFlyRegistry.instance.pulse();
}

// ─── CoinTarget wrapper ───────────────────────────────────────────────────────

/// Wrap the coin-balance widget with this. Registers as the fly-in target,
/// and elastically scales when coins arrive.
class CoinTarget extends StatefulWidget {
  final Widget child;
  final double maxScale; // peak pulse scale
  const CoinTarget({super.key, required this.child, this.maxScale = 1.28});

  @override
  State<CoinTarget> createState() => _CoinTargetState();
}

class _CoinTargetState extends State<CoinTarget>
    with SingleTickerProviderStateMixin {
  final GlobalKey _key = GlobalKey();
  late final AnimationController _pulseCtrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 560),
  );
  int _lastPulse = 0;

  @override
  void initState() {
    super.initState();
    CoinFlyRegistry.instance.registerTarget(_key);
    CoinFlyRegistry.instance.pulseListenable.addListener(_onPulse);
  }

  void _onPulse() {
    if (!mounted) return;
    final now = CoinFlyRegistry.instance.pulseListenable.value;
    if (now == _lastPulse) return;
    _lastPulse = now;
    _pulseCtrl.forward(from: 0);
  }

  @override
  void dispose() {
    CoinFlyRegistry.instance.pulseListenable.removeListener(_onPulse);
    CoinFlyRegistry.instance.unregisterTarget(_key);
    _pulseCtrl.dispose();
    super.dispose();
  }

  double _scaleFor(double v) {
    if (v == 0) return 1.0;
    // Phase 1 (0..0.35): bump up to maxScale with easeOutBack
    // Phase 2 (0.35..1):  settle back to 1 with easeOutCubic
    if (v < 0.35) {
      final t = v / 0.35;
      return 1.0 +
          Curves.easeOutBack.transform(t) * (widget.maxScale - 1.0);
    } else {
      final t = (v - 0.35) / 0.65;
      return widget.maxScale -
          Curves.easeOutCubic.transform(t) * (widget.maxScale - 1.0);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Use SizedBox (a plain RenderObjectWidget) rather than KeyedSubtree so
    // that the GlobalKey is never subject to Flutter's element-reparenting
    // semantics.  KeyedSubtree was causing "element._lifecycleState ==
    // _ElementLifecycle.inactive: is not true" assertion failures when two
    // CoinTarget instances were live simultaneously (e.g. home + casino).
    return SizedBox(
      key: _key,
      child: AnimatedBuilder(
        animation: _pulseCtrl,
        builder: (_, child) => Transform.scale(
          scale: _scaleFor(_pulseCtrl.value),
          child: child,
        ),
        child: widget.child,
      ),
    );
  }
}

// ─── Overlay layer ────────────────────────────────────────────────────────────

class _CoinFlyLayer extends StatefulWidget {
  final Offset from;
  final Offset to;
  final int count;
  final Duration baseDuration;
  final VoidCallback onFinish;
  const _CoinFlyLayer({
    required this.from,
    required this.to,
    required this.count,
    required this.baseDuration,
    required this.onFinish,
  });

  @override
  State<_CoinFlyLayer> createState() => _CoinFlyLayerState();
}

class _CoinFlyLayerState extends State<_CoinFlyLayer> {
  late List<_CoinSpec> _specs;
  int _finished = 0;
  bool _done = false;

  @override
  void initState() {
    super.initState();
    final rng = math.Random();
    _specs = List.generate(widget.count, (i) {
      // Scatter origin: small random disc around the source point
      final scatterAngle = rng.nextDouble() * math.pi * 2;
      final scatterR = rng.nextDouble() * 14;
      final origin = widget.from +
          Offset(
              math.cos(scatterAngle) * scatterR,
              math.sin(scatterAngle) * scatterR);

      final mid = Offset(
        (origin.dx + widget.to.dx) / 2,
        (origin.dy + widget.to.dy) / 2,
      );
      final lift = 80 + rng.nextDouble() * 120;
      final sway = (rng.nextDouble() - 0.5) * 140;
      final control = mid + Offset(sway, -lift);

      final delay = Duration(milliseconds: (i * 45) + rng.nextInt(35));
      final jitter = rng.nextInt(260) - 100;
      final duration = Duration(
        milliseconds:
            (widget.baseDuration.inMilliseconds + jitter).clamp(500, 1600),
      );
      final rotations = 2.0 + rng.nextDouble() * 3;
      final clockwise = rng.nextBool();
      final size = 26.0 + rng.nextDouble() * 10;

      return _CoinSpec(
        origin: origin,
        target: widget.to,
        control: control,
        delay: delay,
        duration: duration,
        rotations: rotations,
        clockwise: clockwise,
        size: size,
      );
    });
  }

  void _coinDone() {
    _finished++;
    if (!_done && _finished >= widget.count) {
      _done = true;
      widget.onFinish();
    }
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Stack(
        fit: StackFit.expand,
        children: [
          for (final spec in _specs)
            _FlyingCoin(spec: spec, onDone: _coinDone),
        ],
      ),
    );
  }
}

// ─── Per-coin flight ──────────────────────────────────────────────────────────

class _CoinSpec {
  final Offset origin, target, control;
  final Duration delay, duration;
  final double rotations;
  final bool clockwise;
  final double size;
  const _CoinSpec({
    required this.origin,
    required this.target,
    required this.control,
    required this.delay,
    required this.duration,
    required this.rotations,
    required this.clockwise,
    required this.size,
  });
}

class _FlyingCoin extends StatefulWidget {
  final _CoinSpec spec;
  final VoidCallback onDone;
  const _FlyingCoin({required this.spec, required this.onDone});

  @override
  State<_FlyingCoin> createState() => _FlyingCoinState();
}

class _FlyingCoinState extends State<_FlyingCoin>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl =
      AnimationController(vsync: this, duration: widget.spec.duration);
  bool _started = false;
  bool _finishedReported = false;

  @override
  void initState() {
    super.initState();
    _ctrl.addStatusListener((s) {
      if (s == AnimationStatus.completed && !_finishedReported) {
        _finishedReported = true;
        widget.onDone();
      }
    });
    Future.delayed(widget.spec.delay, () {
      if (!mounted) return;
      setState(() => _started = true);
      _ctrl.forward();
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  /// Quadratic bezier p(t) = (1-t)² P₀ + 2(1-t)t P₁ + t² P₂
  Offset _bezier(double t) {
    final o = widget.spec.origin;
    final c = widget.spec.control;
    final e = widget.spec.target;
    final omt = 1 - t;
    return Offset(
      omt * omt * o.dx + 2 * omt * t * c.dx + t * t * e.dx,
      omt * omt * o.dy + 2 * omt * t * c.dy + t * t * e.dy,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!_started) return const SizedBox.shrink();
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, __) {
        // Ease-in: coins accelerate into the target for a satisfying snap
        final t = Curves.easeInQuart.transform(_ctrl.value);
        final pos = _bezier(t);

        // Scale envelope: small → bigger at mid → converging at end
        final s = 0.45 + 0.75 * math.sin(math.pi * t);
        // Rotation (spin)
        final angle = widget.spec.rotations *
            2 *
            math.pi *
            t *
            (widget.spec.clockwise ? 1 : -1);
        // Opacity: fade in fast, fade out near the end
        final opacity = (t < 0.1)
            ? (t / 0.1)
            : (t > 0.92 ? (1 - (t - 0.92) / 0.08) : 1.0);

        return Positioned(
          left: pos.dx - widget.spec.size / 2,
          top: pos.dy - widget.spec.size / 2,
          child: Opacity(
            opacity: opacity.clamp(0.0, 1.0),
            child: Transform.rotate(
              angle: angle,
              child: Transform.scale(
                scale: s.clamp(0.3, 1.8),
                child: _CoinGlyph(size: widget.spec.size),
              ),
            ),
          ),
        );
      },
    );
  }
}

// ─── Coin glyph ───────────────────────────────────────────────────────────────

class _CoinGlyph extends StatelessWidget {
  final double size;
  const _CoinGlyph({required this.size});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const RadialGradient(
          colors: [
            Color(0xFFFFF4C2),
            Color(0xFFFFD76A),
            Color(0xFFB45309),
          ],
          stops: [0.0, 0.6, 1.0],
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFFFD76A).withValues(alpha: 0.7),
            blurRadius: size * 0.65,
            spreadRadius: 1,
          ),
        ],
        border: Border.all(
          color: const Color(0xFFFBCF47),
          width: 1.5,
        ),
      ),
      alignment: Alignment.center,
      child: Text(
        '₹',
        style: TextStyle(
          fontSize: size * 0.55,
          fontWeight: FontWeight.w900,
          color: const Color(0xFF7C2D12),
          height: 1.0,
        ),
      ),
    );
  }
}
