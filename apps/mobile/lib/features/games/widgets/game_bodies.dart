import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_fortune_wheel/flutter_fortune_wheel.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lottie/lottie.dart';

/// ─────────────────────────────────────────────────────────────────────
/// Each widget below is a self-contained "body" for a specific game
/// type. They share a common contract:
///
///   • `won`         — outcome decided by the backend `/games/:id/play`
///   • `onReveal()`  — called when the user has completed the reveal
///     animation (i.e. time to show confetti + prize). Guarded so it
///     fires at most once.
/// ─────────────────────────────────────────────────────────────────────

// Shared palette (matches play_screen.dart)
const _kGold    = Color(0xFFFCBF17);
const _kRose    = Color(0xFFEF4781);
const _kViolet  = Color(0xFF8B5CF6);
const _kEmerald = Color(0xFF34D399);
const _kCard    = Color(0xFF0F1420);
const _kCard2   = Color(0xFF141B28);
const _kBorder  = Color(0xFF1C2333);
const _kText0   = Color(0xFFF0F4FF);
const _kText1   = Color(0xFF8892AA);
const _kText2   = Color(0xFF4A5068);

// ─── SPIN WHEEL ────────────────────────────────────────────────────────

class WheelGameBody extends StatefulWidget {
  final bool won;
  final VoidCallback onReveal;
  const WheelGameBody({super.key, required this.won, required this.onReveal});
  @override State<WheelGameBody> createState() => _WheelGameBodyState();
}

class _WheelGameBodyState extends State<WheelGameBody> {
  final StreamController<int> _ctrl = StreamController<int>.broadcast();
  bool _spun = false;
  int? _winningIdx;

  static const _slots = [
    ('🎁', 'Mystery Gift',  _kGold),
    ('❌', 'No luck',         _kText2),
    ('🪙', '100 Goins',      _kGold),
    ('❌', 'No luck',         _kText2),
    ('💎', '500 Goins',      _kViolet),
    ('❌', 'No luck',         _kText2),
    ('🎉', 'Bonus Spin',     _kRose),
    ('❌', 'No luck',         _kText2),
  ];

  @override
  void dispose() { _ctrl.close(); super.dispose(); }

  void _spin() {
    if (_spun) return;
    _spun = true;
    HapticFeedback.mediumImpact();
    // Winning slots = even indices (0, 2, 4, 6). Losing = odd (1, 3, 5, 7).
    final rnd = math.Random();
    final wins = [0, 2, 4, 6];
    final losses = [1, 3, 5, 7];
    final idx = widget.won ? wins[rnd.nextInt(wins.length)]
                            : losses[rnd.nextInt(losses.length)];
    _winningIdx = idx;
    _ctrl.add(idx);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          height: 240, width: 240,
          child: FortuneWheel(
            selected: _ctrl.stream,
            animateFirst: false,
            onAnimationEnd: () {
              HapticFeedback.mediumImpact();
              widget.onReveal();
            },
            items: [
              for (final s in _slots)
                FortuneItem(
                  style: FortuneItemStyle(
                    color: s.$3.withValues(alpha: 0.18),
                    borderColor: s.$3,
                    borderWidth: 1.5,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(s.$1, style: const TextStyle(fontSize: 20)),
                      Text(s.$2, style: GoogleFonts.inter(
                        fontSize: 9, fontWeight: FontWeight.w700,
                        color: _kText0,
                      )),
                    ],
                  ),
                ),
            ],
            indicators: [
              FortuneIndicator(
                alignment: Alignment.topCenter,
                child: TriangleIndicator(color: _kGold),
              ),
            ],
          ),
        ),
        const Gap(16),
        if (!_spun)
          _PlayButton(label: 'SPIN THE WHEEL', onTap: _spin)
        else
          Text('Spinning…', style: GoogleFonts.inter(
            fontSize: 13, color: _kText1, fontWeight: FontWeight.w600)),
      ],
    );
  }
}

// ─── MYSTERY BOX ───────────────────────────────────────────────────────

class MysteryBoxBody extends StatefulWidget {
  final bool won;
  final VoidCallback onReveal;
  const MysteryBoxBody({super.key, required this.won, required this.onReveal});
  @override State<MysteryBoxBody> createState() => _MysteryBoxBodyState();
}

class _MysteryBoxBodyState extends State<MysteryBoxBody>
    with SingleTickerProviderStateMixin {
  late AnimationController _shakeCtrl;
  bool _opening = false;

  @override
  void initState() {
    super.initState();
    _shakeCtrl = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 500))..repeat();
  }

  @override
  void dispose() { _shakeCtrl.dispose(); super.dispose(); }

  void _open() async {
    if (_opening) return;
    HapticFeedback.mediumImpact();
    _shakeCtrl.stop();
    setState(() => _opening = true);
    await Future.delayed(const Duration(milliseconds: 1600));
    if (mounted) widget.onReveal();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          height: 200,
          child: _opening
              ? Lottie.asset('assets/animations/mystery_box.json',
                  repeat: false, animate: true)
              : GestureDetector(
                  onTap: _open,
                  child: AnimatedBuilder(
                    animation: _shakeCtrl,
                    builder: (_, __) {
                      final t = _shakeCtrl.value;
                      final dx = math.sin(t * math.pi * 4) * 6;
                      final rot = math.sin(t * math.pi * 4) * 0.04;
                      return Transform.translate(
                        offset: Offset(dx, 0),
                        child: Transform.rotate(
                          angle: rot,
                          child: Container(
                            width: 160, height: 160,
                            decoration: BoxDecoration(
                              color: _kRose,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: const Center(
                              child: Text('🎁', style: TextStyle(fontSize: 90)),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
        ),
        const Gap(16),
        if (!_opening)
          _PlayButton(label: 'TAP TO OPEN', onTap: _open),
      ],
    );
  }
}

// ─── JACKPOT / FLASH / SLOT REELS ──────────────────────────────────────

class JackpotBody extends StatefulWidget {
  final bool won;
  final VoidCallback onReveal;
  /// Optional remaining seconds (for Flash Jackpot). null → no timer.
  final int? endsInSec;
  const JackpotBody({
    super.key, required this.won, required this.onReveal, this.endsInSec,
  });
  @override State<JackpotBody> createState() => _JackpotBodyState();
}

class _JackpotBodyState extends State<JackpotBody> {
  static const _symbols = ['🍒', '🔔', '⭐', '🎁', '🪙', '💎', '7️⃣'];
  static const _winSymbol = '💎';
  final _reels = [_Reel(), _Reel(), _Reel()];
  int _stopped = 0;
  bool _spinning = false;
  Timer? _countdown;
  late int _remaining;

  @override
  void initState() {
    super.initState();
    _remaining = widget.endsInSec ?? 0;
    if (widget.endsInSec != null) {
      _countdown = Timer.periodic(const Duration(seconds: 1), (t) {
        if (!mounted) return;
        setState(() => _remaining = (_remaining - 1).clamp(0, 1 << 30));
        if (_remaining == 0) t.cancel();
      });
    }
  }

  @override
  void dispose() {
    _countdown?.cancel();
    for (final r in _reels) { r.dispose(); }
    super.dispose();
  }

  void _pull() async {
    if (_spinning) return;
    setState(() => _spinning = true);
    HapticFeedback.heavyImpact();

    final rnd = math.Random();
    // For a win, pick one non-default symbol and make all 3 match.
    // For a loss, randomize all 3 (making sure they don't all match).
    late final List<String> finals;
    if (widget.won) {
      final s = _symbols[rnd.nextInt(_symbols.length)];
      finals = [s, s, s];
    } else {
      do {
        finals = [
          _symbols[rnd.nextInt(_symbols.length)],
          _symbols[rnd.nextInt(_symbols.length)],
          _symbols[rnd.nextInt(_symbols.length)],
        ];
      } while (finals[0] == finals[1] && finals[1] == finals[2]);
    }

    // Spin all three, stop sequentially.
    for (var i = 0; i < 3; i++) {
      _reels[i].spin();
    }

    for (var i = 0; i < 3; i++) {
      await Future.delayed(Duration(milliseconds: 800 + i * 500));
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      _reels[i].stopOn(finals[i]);
      setState(() => _stopped = i + 1);
    }
    await Future.delayed(const Duration(milliseconds: 400));
    if (mounted) widget.onReveal();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (widget.endsInSec != null) ...[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: _kRose.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: _kRose.withValues(alpha: 0.4)),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Text('⚡', style: TextStyle(fontSize: 14)),
              const Gap(5),
              Text('Ends in ${_fmtTime(_remaining)}',
                style: GoogleFonts.inter(
                  fontSize: 11, fontWeight: FontWeight.w800, color: _kRose)),
            ]),
          ),
          const Gap(16),
        ],
        // 3 reels
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: _kCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: _kBorder, width: 2),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: List.generate(3, (i) => Padding(
              padding: EdgeInsets.only(right: i < 2 ? 8 : 0),
              child: _ReelWidget(reel: _reels[i]),
            )),
          ),
        ),
        const Gap(18),
        if (!_spinning)
          _PlayButton(label: 'PULL TO SPIN', onTap: _pull)
        else
          Text('Reel ${_stopped.clamp(1, 3)} of 3',
            style: GoogleFonts.inter(
              fontSize: 13, color: _kText1, fontWeight: FontWeight.w700)),
      ],
    );
  }

  String _fmtTime(int s) {
    final m = (s ~/ 60).toString().padLeft(2, '0');
    final ss = (s % 60).toString().padLeft(2, '0');
    return '$m:$ss';
  }
}

class _Reel {
  String? finalSymbol;
  ValueNotifier<int> scrollTick = ValueNotifier(0);
  Timer? _timer;
  void spin() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(milliseconds: 60), (_) {
      scrollTick.value++;
    });
  }
  void stopOn(String s) {
    _timer?.cancel();
    finalSymbol = s;
    scrollTick.value++; // trigger rebuild
  }
  void dispose() { _timer?.cancel(); scrollTick.dispose(); }
}

class _ReelWidget extends StatelessWidget {
  final _Reel reel;
  const _ReelWidget({required this.reel});

  static const _symbols = ['🍒', '🔔', '⭐', '🎁', '🪙', '💎', '7️⃣'];

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 64, height: 80,
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _kBorder),
      ),
      clipBehavior: Clip.antiAlias,
      child: ValueListenableBuilder<int>(
        valueListenable: reel.scrollTick,
        builder: (_, tick, __) {
          final emoji = reel.finalSymbol
              ?? _symbols[tick % _symbols.length];
          return AnimatedSwitcher(
            duration: const Duration(milliseconds: 60),
            transitionBuilder: (c, anim) => SlideTransition(
              position: Tween<Offset>(
                begin: const Offset(0, -1), end: Offset.zero,
              ).animate(anim),
              child: c,
            ),
            child: Center(
              key: ValueKey('$tick-$emoji'),
              child: Text(emoji, style: const TextStyle(fontSize: 40)),
            ),
          );
        },
      ),
    );
  }
}

// ─── TREASURE HUNT ─────────────────────────────────────────────────────

class TreasureHuntBody extends StatefulWidget {
  final bool won;
  final VoidCallback onReveal;
  const TreasureHuntBody({super.key, required this.won, required this.onReveal});
  @override State<TreasureHuntBody> createState() => _TreasureHuntBodyState();
}

class _TreasureHuntBodyState extends State<TreasureHuntBody> {
  int? _picked;
  int? _winningBox;

  @override
  void initState() {
    super.initState();
    // Pre-decide a random "winning" box (only matters if won==true).
    _winningBox = math.Random().nextInt(12);
  }

  void _pick(int i) {
    if (_picked != null) return;
    HapticFeedback.heavyImpact();
    setState(() {
      // If winning, force picked box to be the winner.
      _picked = widget.won ? _winningBox : i;
      _winningBox = widget.won ? _picked : _winningBox;
    });
    Future.delayed(const Duration(milliseconds: 900), widget.onReveal);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('Pick a chest to uncover the treasure',
          style: GoogleFonts.inter(
            fontSize: 12, color: _kText1, fontWeight: FontWeight.w600)),
        const Gap(14),
        GridView.count(
          crossAxisCount: 4,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 8, crossAxisSpacing: 8,
          children: List.generate(12, (i) {
            final isPicked = _picked == i;
            final isWinner = _winningBox == i && _picked != null;
            final revealed = isPicked;
            return GestureDetector(
              onTap: () => _pick(i),
              child: AnimatedContainer(
                duration: 300.ms,
                decoration: BoxDecoration(
                  color: revealed
                      ? (isWinner && widget.won ? _kRose : _kCard2)
                      : _kCard2,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: revealed ? _kRose : _kBorder,
                    width: revealed ? 2 : 1,
                  ),
                ),
                child: Center(
                  child: Text(
                    revealed
                        ? (isWinner && widget.won ? '💎' : '🪨')
                        : '📦',
                    style: const TextStyle(fontSize: 26),
                  ),
                ),
              ).animate(target: revealed ? 1 : 0)
                  .rotate(begin: 0, end: 0.5, duration: 300.ms)
                  .scaleXY(begin: 1, end: 1.1, duration: 300.ms),
            );
          }),
        ),
      ],
    );
  }
}

// ─── DICE (Goin Wager) ─────────────────────────────────────────────────

class DiceBody extends StatefulWidget {
  final bool won;
  final VoidCallback onReveal;
  const DiceBody({super.key, required this.won, required this.onReveal});
  @override State<DiceBody> createState() => _DiceBodyState();
}

class _DiceBodyState extends State<DiceBody>
    with SingleTickerProviderStateMixin {
  int _dice = 1;
  bool _rolling = false;
  String? _pick; // 'high' | 'low'

  void _roll(String pick) async {
    if (_rolling) return;
    HapticFeedback.heavyImpact();
    setState(() { _pick = pick; _rolling = true; });
    final rnd = math.Random();
    // Roll for 1.5s visualising random faces.
    final end = DateTime.now().add(const Duration(milliseconds: 1500));
    while (DateTime.now().isBefore(end)) {
      setState(() => _dice = rnd.nextInt(6) + 1);
      await Future.delayed(const Duration(milliseconds: 90));
    }
    // Final face matches the outcome + user's pick.
    final finalFace = widget.won
        ? (pick == 'high' ? 4 + rnd.nextInt(3) : 1 + rnd.nextInt(3))
        : (pick == 'high' ? 1 + rnd.nextInt(3) : 4 + rnd.nextInt(3));
    setState(() => _dice = finalFace);
    await Future.delayed(const Duration(milliseconds: 400));
    if (mounted) widget.onReveal();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Dice face
        AnimatedContainer(
          duration: 120.ms,
          width: 120, height: 120,
          decoration: BoxDecoration(
            color: _kRose,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Center(
            child: Text('$_dice', style: GoogleFonts.inter(
              fontSize: 68, fontWeight: FontWeight.w900, color: Colors.white,
            )),
          ),
        ).animate(target: _rolling ? 1 : 0)
            .shakeX(hz: 12, amount: 6, duration: 200.ms),
        const Gap(22),
        if (!_rolling)
          Row(mainAxisSize: MainAxisSize.min, children: [
            _PlayButton(label: 'LOW (1-3)',
              compact: true, onTap: () => _roll('low')),
            const Gap(10),
            _PlayButton(label: 'HIGH (4-6)',
              compact: true, onTap: () => _roll('high')),
          ])
        else
          Text('Rolling for $_pick…', style: GoogleFonts.inter(
            fontSize: 13, color: _kText1, fontWeight: FontWeight.w700)),
      ],
    );
  }
}

// ─── STREAK LADDER ─────────────────────────────────────────────────────

class StreakLadderBody extends StatefulWidget {
  final bool won;
  final VoidCallback onReveal;
  const StreakLadderBody({super.key, required this.won, required this.onReveal});
  @override State<StreakLadderBody> createState() => _StreakLadderBodyState();
}

class _StreakLadderBodyState extends State<StreakLadderBody> {
  int _step = 0;
  bool _climbing = false;

  void _climb() async {
    if (_climbing) return;
    HapticFeedback.mediumImpact();
    setState(() => _climbing = true);
    // 7 steps. If won, climb all 7. If lost, stop at 3-5.
    final maxStep = widget.won ? 7 : 3 + math.Random().nextInt(3);
    for (var i = 1; i <= maxStep; i++) {
      await Future.delayed(const Duration(milliseconds: 250));
      if (!mounted) return;
      HapticFeedback.selectionClick();
      setState(() => _step = i);
    }
    await Future.delayed(const Duration(milliseconds: 400));
    if (mounted) widget.onReveal();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          height: 200,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.end,
            children: List.generate(7, (i) {
              final rung = 7 - i;
              final reached = _step >= rung;
              return Container(
                height: 24,
                width: 180,
                margin: const EdgeInsets.only(bottom: 2),
                decoration: BoxDecoration(
                  color: reached
                      ? Color.lerp(_kEmerald, _kRose, rung / 7)!
                          .withValues(alpha: 0.8)
                      : _kCard2,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: reached ? _kRose : _kBorder, width: 1,
                  ),
                ),
                child: Row(children: [
                  const Gap(8),
                  if (reached) const Text('🔥', style: TextStyle(fontSize: 14)),
                  const Gap(6),
                  Text('Day $rung', style: GoogleFonts.inter(
                    fontSize: 11, fontWeight: FontWeight.w800,
                    color: reached ? Colors.black : _kText2)),
                  const Spacer(),
                  if (reached)
                    Text('🏆', style: TextStyle(
                        fontSize: rung == 7 ? 16 : 11)),
                  const Gap(8),
                ]),
              ).animate(target: reached ? 1 : 0)
                  .scaleX(begin: 0, end: 1, duration: 250.ms);
            }),
          ),
        ),
        const Gap(16),
        if (!_climbing)
          _PlayButton(label: 'CLAIM STREAK', onTap: _climb),
      ],
    );
  }
}

// ─── DAILY QUEST ───────────────────────────────────────────────────────

class QuestBody extends StatefulWidget {
  final bool won;
  final VoidCallback onReveal;
  const QuestBody({super.key, required this.won, required this.onReveal});
  @override State<QuestBody> createState() => _QuestBodyState();
}

class _QuestBodyState extends State<QuestBody> {
  final _tasks = <({String emoji, String label, bool done})>[
    (emoji: '🛍️', label: 'Browse 3 products', done: false),
    (emoji: '💬', label: 'Share a gift idea',  done: false),
    (emoji: '⭐', label: 'Rate an order',        done: false),
  ];
  bool _claiming = false;
  int _completed = 0;

  void _claim() async {
    if (_claiming) return;
    HapticFeedback.mediumImpact();
    setState(() => _claiming = true);
    for (var i = 0; i < _tasks.length; i++) {
      await Future.delayed(const Duration(milliseconds: 380));
      if (!mounted) return;
      AudioService_tap();
      setState(() {
        _tasks[i] = (emoji: _tasks[i].emoji,
            label: _tasks[i].label, done: true);
        _completed++;
      });
    }
    await Future.delayed(const Duration(milliseconds: 300));
    if (mounted) widget.onReveal();
  }

  void AudioService_tap() { HapticFeedback.selectionClick(); }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final t in _tasks)
          Container(
            width: double.infinity,
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: t.done ? _kEmerald.withValues(alpha: 0.08) : _kCard2,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: t.done ? _kEmerald : _kBorder,
                width: t.done ? 1.5 : 1,
              ),
            ),
            child: Row(children: [
              Text(t.emoji, style: const TextStyle(fontSize: 20)),
              const Gap(12),
              Expanded(child: Text(t.label,
                style: GoogleFonts.inter(
                  fontSize: 13, fontWeight: FontWeight.w600, color: _kText0))),
              AnimatedContainer(
                duration: 200.ms,
                width: 24, height: 24,
                decoration: BoxDecoration(
                  color: t.done ? _kEmerald : Colors.transparent,
                  shape: BoxShape.circle,
                  border: Border.all(
                      color: t.done ? _kEmerald : _kText2, width: 2),
                ),
                child: t.done
                    ? const Icon(Icons.check_rounded,
                        size: 14, color: Colors.black)
                    : null,
              ),
            ]),
          ),
        const Gap(6),
        if (!_claiming)
          _PlayButton(label: 'CLAIM QUEST', onTap: _claim)
        else
          Text('Completing $_completed/3…', style: GoogleFonts.inter(
            fontSize: 12, color: _kText1, fontWeight: FontWeight.w700)),
      ],
    );
  }
}

// ─── SECRET BID ────────────────────────────────────────────────────────

class SecretBidBody extends StatefulWidget {
  final bool won;
  final VoidCallback onReveal;
  const SecretBidBody({super.key, required this.won, required this.onReveal});
  @override State<SecretBidBody> createState() => _SecretBidBodyState();
}

class _SecretBidBodyState extends State<SecretBidBody> {
  double _bid = 250;
  bool _submitted = false;

  void _submit() async {
    if (_submitted) return;
    HapticFeedback.heavyImpact();
    setState(() => _submitted = true);
    await Future.delayed(const Duration(milliseconds: 1600));
    if (mounted) widget.onReveal();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text('🤫', style: TextStyle(fontSize: 60)),
        const Gap(8),
        Text('Sealed envelope bid',
          style: GoogleFonts.inter(
            fontSize: 13, color: _kText1, fontWeight: FontWeight.w600)),
        const Gap(16),
        if (!_submitted) ...[
          Text('Bid: ${_bid.toInt()} Goins',
            style: GoogleFonts.inter(
              fontSize: 18, fontWeight: FontWeight.w800, color: _kGold)),
          Slider(
            value: _bid, min: 50, max: 1000, divisions: 19,
            activeColor: _kGold, inactiveColor: _kBorder,
            onChanged: (v) => setState(() => _bid = v),
          ),
          _PlayButton(label: 'SEAL BID', onTap: _submit),
        ] else
          Column(children: [
            const CircularProgressIndicator(color: _kRose, strokeWidth: 2),
            const Gap(12),
            Text('Comparing with other players…',
              style: GoogleFonts.inter(
                fontSize: 12, color: _kText1, fontWeight: FontWeight.w600)),
          ]),
      ],
    );
  }
}

// ─── Shared Play button ───────────────────────────────────────────────

class _PlayButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  final bool compact;
  const _PlayButton({
    required this.label, required this.onTap, this.compact = false,
  });
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: EdgeInsets.symmetric(
            horizontal: compact ? 16 : 32, vertical: compact ? 10 : 14),
        decoration: BoxDecoration(
          color: _kRose,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(label, style: GoogleFonts.inter(
          fontSize: compact ? 12 : 15,
          fontWeight: FontWeight.w900,
          color: Colors.white, letterSpacing: 0.8,
        )),
      ),
    );
  }
}
