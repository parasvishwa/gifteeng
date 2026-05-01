import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:confetti/confetti.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:gap/gap.dart';
import 'package:lottie/lottie.dart';
import 'package:scratcher/scratcher.dart';
import 'package:animated_digit/animated_digit.dart';
import 'package:flutter_fortune_wheel/flutter_fortune_wheel.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/services/audio_service.dart';
import '../../../../core/widgets/coin_fly.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../home/presentation/screens/home_screen.dart' show coinBalanceProvider;
import '../../../account/presentation/screens/account_screen.dart' show profileProvider;
import '../../widgets/game_bodies.dart';
import 'sticker_album_screen.dart' show albumProvider;

// ─── Color palette — mapped to design system ─────────────────────────────────

const _kBg      = GColors.bg0;
const _kCard    = GColors.bg1;
const _kCard2   = GColors.bg2;
const _kBorder  = GColors.border;
const _kText0   = GColors.text0;
const _kText1   = GColors.text1;
const _kText2   = GColors.text2;
const _kGold    = GColors.gold;
const _kRose    = GColors.brand;    // rose → brand red (no accent soup)
const _kViolet  = GColors.brand;   // violet → brand red
const _kEmerald = GColors.emerald;

// ─── Providers ────────────────────────────────────────────────────────────────

final gamesHubProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/games/hub');
    return Map<String, dynamic>.from(res.data as Map);
  } catch (_) {
    return {'coinBalance': 0, 'streakDays': 0, 'games': []};
  }
});

// ─── Static game data (all 10 games) ─────────────────────────────────────────

final _kGames = [
  {
    'id': 'scratch_1',
    'title': 'Scratch Card',
    'type': 'scratch',
    'coinCost': 50,
    'emoji': '✨',
    'played': 201782,
    'gradient': [const Color(0xFF2E1A5C), const Color(0xFF14141B)],
    'tint': _kViolet,
    'dailyLimit': 5,
  },
  {
    'id': 'jackpot_1',
    'title': 'Gift Jackpot',
    'type': 'jackpot',
    'coinCost': 500,
    'emoji': '🏆',
    'played': 12890,
    'gradient': [const Color(0xFF2B1014), const Color(0xFF14141B)],
    'tint': _kRose,
    'dailyLimit': 2,
  },
  {
    'id': 'mystery_1',
    'title': 'Mystery Box',
    'type': 'mystery',
    'coinCost': 200,
    'emoji': '🎁',
    'played': 34567,
    'gradient': [const Color(0xFF3D1A00), const Color(0xFF14141B)],
    'tint': _kGold,
    'dailyLimit': 3,
  },
  {
    'id': 'wheel_1',
    'title': 'Spin Wheel',
    'type': 'wheel',
    'coinCost': 100,
    'emoji': '🎡',
    'played': 89421,
    'gradient': [const Color(0xFF0F3D38), const Color(0xFF14141B)],
    'tint': _kEmerald,
    'dailyLimit': 5,
  },
  {
    'id': 'quest_1',
    'title': 'Daily Quest',
    'type': 'quest',
    'coinCost': 0,
    'emoji': '🗺️',
    'played': 55230,
    'gradient': [const Color(0xFF0F2D3D), const Color(0xFF14141B)],
    'tint': const Color(0xFF38BDF8),
    'dailyLimit': 1,
  },
  {
    'id': 'streak_1',
    'title': 'Streak Ladder',
    'type': 'streak',
    'coinCost': 0,
    'emoji': '🔥',
    'played': 44100,
    'gradient': [const Color(0xFF3D1500), const Color(0xFF14141B)],
    'tint': const Color(0xFFFB923C),
    'dailyLimit': 1,
  },
  {
    'id': 'treasure_1',
    'title': 'Treasure Hunt',
    'type': 'treasure',
    'coinCost': 150,
    'emoji': '🗝️',
    'played': 22340,
    'gradient': [const Color(0xFF1A2E0F), const Color(0xFF14141B)],
    'tint': _kEmerald,
    'dailyLimit': 3,
  },
  {
    'id': 'wager_1',
    'title': 'Goin Wager',
    'type': 'wager',
    'coinCost': 300,
    'emoji': '⚡',
    'played': 18760,
    'gradient': [const Color(0xFF1A0F2E), const Color(0xFF14141B)],
    'tint': const Color(0xFFA855F7),
    'dailyLimit': 3,
  },
  {
    'id': 'bid_1',
    'title': 'Secret Bid',
    'type': 'bid',
    'coinCost': 100,
    'emoji': '🤫',
    'played': 9820,
    'gradient': [const Color(0xFF001A1A), const Color(0xFF14141B)],
    'tint': const Color(0xFF2DD4BF),
    'dailyLimit': 3,
  },
  {
    'id': 'flash_1',
    'title': 'Flash Jackpot',
    'type': 'flash',
    'coinCost': 250,
    'emoji': '🎰',
    'played': 7560,
    'gradient': [const Color(0xFF2E1A00), const Color(0xFF14141B)],
    'tint': const Color(0xFFFBBF24),
    'isFlash': true,
    'endsIn': 3540, // seconds remaining, backend-driven
    'dailyLimit': 2,
  },
];

final _kWinners = [
  {'name': 'Priya S.', 'prize': 'Amazon ₹500 Gift Card', 'ago': 2},
  {'name': 'Rahul M.', 'prize': '500 Goins', 'ago': 5},
  {'name': 'Sneha K.', 'prize': 'Flipkart Voucher', 'ago': 11},
  {'name': 'Arjun T.', 'prize': 'Mystery Box Prize', 'ago': 18},
  {'name': 'Meera V.', 'prize': 'Jackpot — ₹2000!', 'ago': 25},
];

// ─── Daily play-limit tracker ─────────────────────────────────────────────────
// Persists per-game play counts to SharedPreferences keyed by today's date.
// The backend's /games/hub response can override via `playedToday` on each
// game map; this client-side counter works even when the backend is offline.

final _todayGamePlaysProvider =
    StateNotifierProvider<_TodayPlaysNotifier, Map<String, int>>(
  (ref) => _TodayPlaysNotifier(),
);

class _TodayPlaysNotifier extends StateNotifier<Map<String, int>> {
  static const _kPfx = 'gifteeng.casino.plays.';

  _TodayPlaysNotifier() : super(const {}) {
    _load();
  }

  String get _dayKey {
    final n = DateTime.now();
    return '${n.year}${n.month.toString().padLeft(2, '0')}${n.day.toString().padLeft(2, '0')}';
  }

  Future<void> _load() async {
    try {
      final prefs  = await SharedPreferences.getInstance();
      final prefix = '${_kPfx}${_dayKey}_';
      final map    = <String, int>{};
      for (final k in prefs.getKeys()) {
        if (k.startsWith(prefix)) {
          map[k.substring(prefix.length)] = prefs.getInt(k) ?? 0;
        }
      }
      state = map;
    } catch (_) {}
  }

  Future<void> recordPlay(String gameId) async {
    if (gameId.isEmpty) return;
    final updated = (state[gameId] ?? 0) + 1;
    state = {...state, gameId: updated};
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt('${_kPfx}${_dayKey}_$gameId', updated);
    } catch (_) {}
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

class PlayScreen extends ConsumerWidget {
  const PlayScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Gift Casino is always rendered in dark mode — immersive gambling aesthetic
    // regardless of the user's light / dark theme preference in the rest of the app.
    final hubAsync = ref.watch(gamesHubProvider);
    return Theme(
      data: Theme.of(context).copyWith(brightness: Brightness.dark),
      child: Scaffold(
        backgroundColor: GColors.bg0, // always dark casino background
        body: hubAsync.when(
          loading: () => const _LoadingShimmer(),
          error:   (_, __) => const _PlayBody(hub: null),
          data:    (hub)   => _PlayBody(hub: hub),
        ),
      ),
    );
  }
}

// ─── Loading shimmer ──────────────────────────────────────────────────────────

class _LoadingShimmer extends StatelessWidget {
  const _LoadingShimmer();
  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kCard   = _c.bg1;
    final _kCard2  = _c.bg2;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Lottie.asset('assets/animations/glow_loading.json',
              width: 80, height: 80, repeat: true),
          const Gap(16),
          Text('Loading Gift Casino…',
            style: GoogleFonts.inter(
              fontSize: 14, color: _kText1, fontWeight: FontWeight.w500,
            )),
        ],
      ),
    );
  }
}

// ─── Body ─────────────────────────────────────────────────────────────────────

class _PlayBody extends StatelessWidget {
  final Map<String, dynamic>? hub;
  const _PlayBody({required this.hub});

  List<Map<String, dynamic>> get _games {
    if (hub == null) return _kGames;
    final raw = hub!['games'];
    if (raw is! List || raw.isEmpty) return _kGames;

    // Merge backend games with fallback visual data (emoji/tint/gradient)
    // by matching on `type` or `id`.
    return raw.map<Map<String, dynamic>>((e) {
      final b = Map<String, dynamic>.from(e as Map);
      final type = b['type']?.toString() ?? '';
      final id   = b['id']?.toString()   ?? '';
      // Find matching fallback for visual defaults
      final fallback = _kGames.firstWhere(
        (f) => f['type'] == type || f['id'] == id,
        orElse: () => _kGames.first,
      );
      // Backend values win for non-visual data (counts, limits, prices)
      // but the local fallback owns the icon / tint / gradient so games
      // always look distinct. Earlier the backend's seed value 'emoji':
      // '✨' was overriding the type-keyed fallback for every game,
      // making them all look identical (issue #44).
      final mergedEmoji = (b['emoji'] is String && (b['emoji'] as String).isNotEmpty
              && b['emoji'] != '✨' && b['emoji'] != '🎮')
          ? b['emoji']
          : fallback['emoji'];
      return {
        ...fallback,
        ...b,
        'emoji':    mergedEmoji,
        'tint':     fallback['tint']     ?? b['tint'],
        'gradient': fallback['gradient'] ?? b['gradient'],
      };
    }).toList();
  }

  int get _balance => (hub?['coinBalance'] as num?)?.toInt() ?? 0;

  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kCard   = _c.bg1;
    final _kCard2  = _c.bg2;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;
    final topPad = MediaQuery.of(context).padding.top;
    final games  = _games;

    return CustomScrollView(
      physics: const BouncingScrollPhysics(),
      slivers: [

        // ── 1. App bar ──────────────────────────────────────────────────────
        SliverToBoxAdapter(
          child: _AppBar(balance: _balance, topPad: topPad),
        ),

        // ── 2. Live ticker ──────────────────────────────────────────────────
        SliverToBoxAdapter(
          child: _MarqueeTicker(),
        ),

        const SliverToBoxAdapter(child: Gap(20)),

        // ── 3. Story banner ─────────────────────────────────────────────────
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: const _StoryBanner(),
          ),
        ),

        const SliverToBoxAdapter(child: Gap(20)),

        // ── 4. Free Daily Spin card ─────────────────────────────────────────
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: const _FreeDailySpinCard(),
          ),
        ),

        const SliverToBoxAdapter(child: Gap(28)),

        // ── 5. Section header ───────────────────────────────────────────────
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _SectionHeader(
              title: "Today's Games",
              subtitle: 'PICK A GAME TO PLAY',
            ),
          ),
        ),

        const SliverToBoxAdapter(child: Gap(16)),

        // ── 6. 2×2 game grid ────────────────────────────────────────────────
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          sliver: SliverGrid(
            delegate: SliverChildBuilderDelegate(
              (ctx, i) => _GameCard(
                game: games[i % games.length],
                index: i,
                onTap: (game) => _showGameDialog(ctx, game),
              ),
              childCount: games.length,
            ),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 0.85,
            ),
          ),
        ),

        const SliverToBoxAdapter(child: Gap(32)),

        // ── 7. How to Play ──────────────────────────────────────────────────
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: const _HowToPlaySection(),
          ),
        ),

        const SliverToBoxAdapter(child: Gap(28)),

        // ── 8. Streak stats ─────────────────────────────────────────────────
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _StreakStatsSection(hub: hub),
          ),
        ),

        const SliverToBoxAdapter(child: Gap(28)),

        // ── 9. Sticker Album teaser ─────────────────────────────────────────
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: const _StickerAlbumCard(),
          ),
        ),

        const SliverToBoxAdapter(child: Gap(28)),

        // ── 10. Recent Winners ──────────────────────────────────────────────
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: const _RecentWinnersSection(),
          ),
        ),

        const SliverToBoxAdapter(child: Gap(100)),
      ],
    );
  }

  void _showGameDialog(BuildContext context, Map<String, dynamic> game) {
    showGeneralDialog(
      context: context,
      barrierDismissible: true,
      barrierColor: Colors.black.withValues(alpha: 0.85),
      barrierLabel: 'close',
      transitionDuration: const Duration(milliseconds: 300),
      transitionBuilder: (ctx, anim, _, child) => ScaleTransition(
        scale: CurvedAnimation(parent: anim, curve: Curves.easeOutBack),
        child: FadeTransition(opacity: anim, child: child),
      ),
      pageBuilder: (ctx, _, __) => Center(
        child: _GamePlayDialog(game: game),
      ),
    );
  }
}

// ─── App bar ──────────────────────────────────────────────────────────────────

class _AppBar extends StatelessWidget {
  final int balance;
  final double topPad;
  const _AppBar({required this.balance, required this.topPad});

  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kCard   = _c.bg1;
    final _kCard2  = _c.bg2;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            const Color(0xFF0F0A00),
            _kBg,
          ],
        ),
      ),
      padding: EdgeInsets.only(
        top: topPad + 12,
        left: 20,
        right: 20,
        bottom: 14,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Tab-root screen (Gift Casino) — no back button. Pressing back
          // here used to call context.pop() which crashed when there was
          // nothing to pop, or worse, popped the shell. Tab roots rely on
          // the bottom-nav for navigation; the system back-button handles
          // app-exit / branch-switch via go_router's StatefulShellRoute.
          // Title with subtitle
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Gift Casino 🎰',
                style: GoogleFonts.inter(
                  fontSize: 26,
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                  letterSpacing: -0.5,
                  height: 1.0,
                ),
              ),
              const Gap(3),
              Text('Play. Win. Get gifted.',
                style: GoogleFonts.inter(
                  fontSize: 11, fontWeight: FontWeight.w500,
                  color: _kGold.withValues(alpha: 0.7))),
            ],
          ),
          const Spacer(),
          // Balance chip — CoinTarget marks it as fly-in destination + pulses
          CoinTarget(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              decoration: BoxDecoration(
                color: _kGold.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: _kGold.withValues(alpha: 0.35), width: 1.5),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('🪙', style: TextStyle(fontSize: 14)),
                  const Gap(5),
                  // Animated counter — tweens smoothly when balance changes
                  AnimatedDigitWidget(
                    value: balance,
                    duration: const Duration(milliseconds: 900),
                    curve: Curves.easeOutCubic,
                    enableSeparator: true,
                    textStyle: GoogleFonts.inter(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: _kGold,
                    ),
                  ).animate(key: ValueKey('bal-$balance'))
                      .scaleXY(begin: 0.9, end: 1.0, duration: 300.ms,
                          curve: Curves.elasticOut),
                  Gap(2),
                  Text('G', style: GoogleFonts.inter(
                    fontSize: 14, fontWeight: FontWeight.w800, color: _kGold,
                  )),
                ],
              ),
            ),
          ),
          const Gap(10),
          // Mute button
          GestureDetector(
            onTap: () {
              AudioService.instance.toggleMute();
              HapticFeedback.selectionClick();
            },
            child: Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: _kCard,
                shape: BoxShape.circle,
                border: Border.all(color: _kBorder),
              ),
              child: Icon(Icons.volume_up_rounded,
                  size: 16, color: _kText1),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Marquee ticker ───────────────────────────────────────────────────────────

class _MarqueeTicker extends StatefulWidget {
  const _MarqueeTicker();
  @override
  State<_MarqueeTicker> createState() => _MarqueeTickerState();
}

class _MarqueeTickerState extends State<_MarqueeTicker>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;

  static const _text =
      '  🟢 LIVE  ✦  🪙 2,40,16,166 Goins earned today   ✦  '
      '🎁 Priya S. just won an Amazon Gift Card   ✦  '
      '🏆 432 winners today   ✦  '
      '🎰 Rahul M. won 500 Goins   ✦  '
      '⭐ New games added daily   ✦  ';

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 20),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kCard   = _c.bg1;
    final _kCard2  = _c.bg2;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;
    return Container(
      height: 32,
      color: _kGold.withValues(alpha: 0.07),
      child: AnimatedBuilder(
        animation: _ctrl,
        builder: (_, __) {
          return ClipRect(
            child: OverflowBox(
              maxWidth: double.infinity,
              alignment: Alignment.centerLeft,
              child: Transform.translate(
                offset: Offset(-_ctrl.value * 700, 0),
                child: Text(
                  _text + _text,
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: _kGold.withValues(alpha: 0.85),
                    letterSpacing: 0.3,
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ─── Story Banner → Live Stats Banner ────────────────────────────────────────

class _StoryBanner extends StatelessWidget {
  const _StoryBanner();

  @override
  Widget build(BuildContext context) {
    final _c = GColors.of(context);
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF1A0A00), Color(0xFF0D0D1A)],
        ),
        borderRadius: BorderRadius.all(Radius.circular(20)),
        border: Border.all(
            color: _kRose.withValues(alpha: 0.22)),
      ),
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Headline row
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: _kRose.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: _kRose.withValues(alpha: 0.35)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 6, height: 6,
                      decoration: const BoxDecoration(
                          color: Color(0xFF4ADE80), shape: BoxShape.circle),
                    ),
                    const Gap(5),
                    Text('LIVE NOW',
                      style: GoogleFonts.inter(
                        fontSize: 9, fontWeight: FontWeight.w900,
                        color: _kRose, letterSpacing: 0.8)),
                  ],
                ),
              ),
              const Spacer(),
              Text('🏆 432 winners today',
                style: GoogleFonts.inter(
                  fontSize: 11, fontWeight: FontWeight.w700,
                  color: _kGold)),
            ],
          ),
          const Gap(16),
          Text(
            'Win Real\nGifts Every Day',
            style: GoogleFonts.inter(
              fontSize: 26, fontWeight: FontWeight.w900,
              color: Colors.white, height: 1.1, letterSpacing: -0.5),
          ),
          const Gap(8),
          Text(
            'Spin wheels, scratch cards & open mystery\nboxes — real prizes delivered to your door.',
            style: GoogleFonts.inter(
              fontSize: 12, color: Colors.white.withValues(alpha: 0.55),
              height: 1.5),
          ),
          const Gap(18),

          // 3 stat pills
          Row(
            children: [
              _StatPill(value: '2.4 Cr', label: 'Goins Earned', color: _kGold),
              const Gap(8),
              _StatPill(value: '48K+', label: 'Winners', color: _kEmerald),
              const Gap(8),
              _StatPill(value: '10 Games', label: 'Available', color: _kRose),
            ],
          ),
        ],
      ),
    ).animate().fadeIn(duration: 500.ms).slideY(begin: 0.05, end: 0);
  }
}

class _StatPill extends StatelessWidget {
  final String value, label;
  final Color color;
  const _StatPill({required this.value, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.25)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value,
              style: GoogleFonts.inter(
                fontSize: 13, fontWeight: FontWeight.w900, color: color)),
            Text(label,
              style: GoogleFonts.inter(
                fontSize: 9, fontWeight: FontWeight.w600,
                color: Colors.white.withValues(alpha: 0.45))),
          ],
        ),
      ),
    );
  }
}

class _StepBox extends StatelessWidget {
  final String emoji, title, subtitle;
  final Color color;
  const _StepBox({
    required this.emoji,
    required this.title,
    required this.subtitle,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kCard   = _c.bg1;
    final _kCard2  = _c.bg2;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;
    return Column(
      children: [
        Container(
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: color.withValues(alpha: 0.12),
            border: Border.all(color: color.withValues(alpha: 0.3), width: 1.5),
          ),
          child: Center(
            child: Text(emoji, style: const TextStyle(fontSize: 22)),
          ),
        ),
        const Gap(6),
        Text(title,
          style: GoogleFonts.inter(
            fontSize: 12,
            fontWeight: FontWeight.w800,
            color: color,
          )),
        Text(subtitle,
          style: GoogleFonts.inter(
            fontSize: 10,
            fontWeight: FontWeight.w500,
            color: _kText1,
          )),
      ],
    );
  }
}

// ─── Free Daily Spin card ─────────────────────────────────────────────────────

class _FreeDailySpinCard extends StatelessWidget {
  const _FreeDailySpinCard();

  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kCard   = _c.bg1;
    final _kCard2  = _c.bg2;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        // Rich gradient hero card
        Container(
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF1A0A00), Color(0xFF0D0D14)],
            ),
            borderRadius: BorderRadius.all(Radius.circular(20)),
            border: Border.all(
                color: _kGold.withValues(alpha: 0.30), width: 1.5),
            boxShadow: [
              BoxShadow(
                color: _kGold.withValues(alpha: 0.12),
                blurRadius: 24,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          padding: const EdgeInsets.fromLTRB(22, 26, 22, 22),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // FREE label pill
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: _kEmerald.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                            color: _kEmerald.withValues(alpha: 0.4)),
                      ),
                      child: Text('✨  FREE EVERY DAY',
                        style: GoogleFonts.inter(
                          fontSize: 9, fontWeight: FontWeight.w900,
                          color: _kEmerald, letterSpacing: 0.6)),
                    ),
                    const Gap(14),
                    Text(
                      'Free\nDaily Spin',
                      style: GoogleFonts.inter(
                        fontSize: 28,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        letterSpacing: -0.5,
                        height: 1.1,
                      ),
                    ),
                    const Gap(8),
                    Text(
                      'No Goins needed — spin once\nper day, win real prizes!',
                      style: GoogleFonts.inter(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w500,
                        color: Colors.white.withValues(alpha: 0.55),
                        height: 1.5,
                      ),
                    ),
                    const Gap(22),

                    // SPIN NOW button
                    GestureDetector(
                      onTap: () {
                        AudioService.instance.tap();
                        HapticFeedback.mediumImpact();
                      },
                      child: Container(
                        height: 50,
                        decoration: BoxDecoration(
                          color: _kGold,
                          borderRadius: BorderRadius.all(Radius.circular(12)),
                          boxShadow: [
                            BoxShadow(
                              color: _kGold.withValues(alpha: 0.50),
                              blurRadius: 14,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Center(
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                'SPIN NOW',
                                style: GoogleFonts.inter(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.black,
                                  letterSpacing: 0.5,
                                ),
                              ),
                              const Gap(8),
                              const Icon(Icons.arrow_forward_rounded,
                                  size: 16, color: Colors.black),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const Gap(16),
              // Big spin wheel decoration
              Container(
                width: 80, height: 80,
                decoration: BoxDecoration(
                  color: _kGold.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                  border: Border.all(
                      color: _kGold.withValues(alpha: 0.30), width: 2),
                  boxShadow: [
                    BoxShadow(
                      color: _kGold.withValues(alpha: 0.15),
                      blurRadius: 18,
                    ),
                  ],
                ),
                child: const Center(
                  child: Text('🎡', style: TextStyle(fontSize: 38)),
                ),
              ),
            ],
          ),
        ),
      ],
    ).animate().fadeIn(duration: 500.ms, delay: 100.ms).slideY(begin: 0.05, end: 0);
  }
}

// ─── Section header ───────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final String title, subtitle;
  const _SectionHeader({required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kCard   = _c.bg1;
    final _kCard2  = _c.bg2;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: GoogleFonts.inter(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: _kText0,
            letterSpacing: -0.3,
          ),
        ),
        const Gap(2),
        Text(
          subtitle,
          style: GoogleFonts.inter(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            color: _kText2,
            letterSpacing: 1.5,
          ),
        ),
      ],
    );
  }
}

// ─── Game card ────────────────────────────────────────────────────────────────

class _GameCard extends ConsumerStatefulWidget {
  final Map<String, dynamic> game;
  final int index;
  final void Function(Map<String, dynamic>) onTap;
  const _GameCard({
    required this.game,
    required this.index,
    required this.onTap,
  });
  @override
  ConsumerState<_GameCard> createState() => _GameCardState();
}

class _GameCardState extends ConsumerState<_GameCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _pressCtrl;

  @override
  void initState() {
    super.initState();
    _pressCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 100),
      lowerBound: 0.93,
      upperBound: 1.0,
    )..value = 1.0;
  }

  @override
  void dispose() {
    _pressCtrl.dispose();
    super.dispose();
  }

  // Per-game emoji with a type-keyed fallback so backend payloads that
  // omit `emoji` (or send the default '🎮') still render visually distinct
  // icons on the cards. Goin-Wager uses ⚡ explicitly; Flash-Jackpot uses
  // 🎰 here so the two no longer collide on ⚡.
  static const Map<String, String> _typeEmoji = {
    'scratch':  '✨',
    'jackpot':  '🏆',
    'mystery':  '🎁',
    'wheel':    '🎡',
    'quest':    '🗺️',
    'streak':   '🔥',
    'treasure': '🗝️',
    'wager':    '⚡',
    'bid':      '🤫',
    'flash':    '🎰',
  };
  String get _emoji {
    final raw = widget.game['emoji'] as String?;
    final type = (widget.game['type'] as String? ?? '').toLowerCase();
    if (raw != null && raw.isNotEmpty && raw != '🎮') return raw;
    return _typeEmoji[type] ?? '🎮';
  }
  String get _title    => widget.game['title']    as String? ?? 'Game';
  int    get _cost     => (widget.game['coinCost'] as num?)?.toInt() ?? 100;
  int    get _played   => (widget.game['played']  as num?)?.toInt() ?? 0;
  Color  get _tint     => widget.game['tint']     as Color? ?? _kGold;
  List<Color> get _grad {
    final g = widget.game['gradient'];
    if (g is List && g.length == 2) return [g[0] as Color, g[1] as Color];
    return [_kCard2, _kCard];
  }

  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kCard   = _c.bg1;
    final _kCard2  = _c.bg2;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;

    // ── Daily limit check ──────────────────────────────────────────────────
    final gameId      = widget.game['id'] as String? ?? '';
    final todayPlays  = ref.watch(_todayGamePlaysProvider);
    final myPlays     = math.max(
      todayPlays[gameId] ?? 0,
      (widget.game['playedToday'] as num?)?.toInt() ?? 0,
    );
    final dailyLimit  = (widget.game['dailyLimit'] as num?)?.toInt() ?? 99;
    final limitReached = dailyLimit < 99 && myPlays >= dailyLimit;

    return AnimatedBuilder(
      animation: _pressCtrl,
      builder: (_, child) =>
          Transform.scale(scale: _pressCtrl.value, child: child),
      child: GestureDetector(
        onTapDown: (_) { if (!limitReached) _pressCtrl.reverse(); },
        onTapUp: (_) {
          _pressCtrl.forward();
          if (limitReached) return;
          AudioService.instance.tap();
          HapticFeedback.mediumImpact();
          ref.read(_todayGamePlaysProvider.notifier).recordPlay(gameId);
          widget.onTap(widget.game);
        },
        onTapCancel: () => _pressCtrl.forward(),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            // Main card — rich gradient + tint border
            Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: _grad,
                ),
                borderRadius: BorderRadius.all(Radius.circular(18)),
                border: Border.all(
                    color: _tint.withValues(alpha: 0.30), width: 1),
                boxShadow: [
                  BoxShadow(
                    color: _tint.withValues(alpha: 0.12),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              padding: const EdgeInsets.fromLTRB(10, 22, 10, 12),
              child: Column(
                children: [
                  // Giant emoji with soft glow backdrop
                  Expanded(
                    child: Center(
                      child: Container(
                        width: 72, height: 72,
                        decoration: BoxDecoration(
                          color: _tint.withValues(alpha: 0.12),
                          shape: BoxShape.circle,
                        ),
                        child: Center(
                          child: Text(
                            _emoji,
                            style: const TextStyle(fontSize: 38),
                          ),
                        ),
                      ),
                    ),
                  ),

                  const Gap(6),
                  // Name
                  Text(
                    _title,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                      letterSpacing: -0.2,
                    ),
                  ),
                  const Gap(3),

                  // Social proof
                  Text(
                    '${_fmt(_played)} played',
                    style: GoogleFonts.inter(
                      fontSize: 10,
                      fontWeight: FontWeight.w500,
                      color: Colors.white.withValues(alpha: 0.45),
                    ),
                  ),
                  const Gap(10),

                  // PLAY / LIMIT REACHED button
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    width: double.infinity,
                    height: 36,
                    decoration: BoxDecoration(
                      color: limitReached
                          ? Colors.white.withValues(alpha: 0.08)
                          : _tint,
                      borderRadius: const BorderRadius.all(Radius.circular(10)),
                      boxShadow: limitReached
                          ? null
                          : [
                              BoxShadow(
                                color: _tint.withValues(alpha: 0.45),
                                blurRadius: 8,
                                offset: const Offset(0, 2),
                              ),
                            ],
                    ),
                    child: Center(
                      child: limitReached
                          ? Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.lock_outline_rounded,
                                    color: Colors.white.withValues(alpha: 0.35),
                                    size: 13),
                                const Gap(4),
                                Text(
                                  'LIMIT REACHED',
                                  style: GoogleFonts.inter(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.white38,
                                    letterSpacing: 0.3,
                                  ),
                                ),
                              ],
                            )
                          : Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.play_arrow_rounded,
                                    color: Colors.white, size: 16),
                                const Gap(3),
                                Text(
                                  'PLAY',
                                  style: GoogleFonts.inter(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800,
                                    color: Colors.white,
                                    letterSpacing: 0.6,
                                  ),
                                ),
                              ],
                            ),
                    ),
                  ),
                ],
              ),
            ),

            // Cost / FREE badge — top-right corner
            Positioned(
              top: 10,
              right: 10,
              child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.45),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                        color: _tint.withValues(alpha: 0.4)),
                  ),
                  child: _cost == 0
                    ? Text('FREE', style: GoogleFonts.inter(
                        fontSize: 9, fontWeight: FontWeight.w900,
                        color: _kEmerald, letterSpacing: 0.4))
                    : Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text('🪙', style: TextStyle(fontSize: 9)),
                          const Gap(3),
                          Text('$_cost', style: GoogleFonts.inter(
                            fontSize: 9, fontWeight: FontWeight.w900,
                            color: _kGold,
                          )),
                        ],
                      ),
                ),
            ),

            // Flash badge (top-right for flash games)
            if (widget.game['isFlash'] == true)
              Positioned(
                top: 8, right: 8,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                  decoration: BoxDecoration(
                    color: GColors.brand,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text('⚡ LIVE', style: GoogleFonts.inter(
                    fontSize: 8, fontWeight: FontWeight.w900, color: Colors.white,
                    letterSpacing: 0.5,
                  )),
                ),
              ),
          ],
        ),
      ),
    )
        .animate(delay: (widget.index * 80).ms)
        .fadeIn(duration: 400.ms)
        .slideY(begin: 0.08, end: 0, curve: Curves.easeOut);
  }
}

// ─── How to Play section ──────────────────────────────────────────────────────

class _HowToPlaySection extends StatelessWidget {
  const _HowToPlaySection();

  static const _steps = [
    (
      number: '1',
      title: 'Earn Goins',
      subtitle: 'Shop, write reviews & share to earn Goins every day.',
      color: _kGold,
    ),
    (
      number: '2',
      title: 'Choose a Game',
      subtitle: 'Pick from Scratch & Win, Slots, Mystery Box and more.',
      color: _kViolet,
    ),
    (
      number: '3',
      title: 'Claim Your Prize',
      subtitle: 'Real gifts, discounts & Goins — delivered to your door!',
      color: _kEmerald,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kCard   = _c.bg1;
    final _kCard2  = _c.bg2;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(
          title: 'How to Play',
          subtitle: '3 EASY STEPS',
        ),
        const Gap(14),
        Container(
          decoration: BoxDecoration(
            color: _kCard,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: _kBorder),
          ),
          child: Column(
            children: List.generate(_steps.length, (i) {
              final s = _steps[i];
              return Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: s.color.withValues(alpha: 0.12),
                            border: Border.all(
                                color: s.color.withValues(alpha: 0.4),
                                width: 1.5),
                          ),
                          child: Center(
                            child: Text(
                              s.number,
                              style: GoogleFonts.inter(
                                fontSize: 14,
                                fontWeight: FontWeight.w900,
                                color: s.color,
                              ),
                            ),
                          ),
                        ),
                        const Gap(14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                s.title,
                                style: GoogleFonts.inter(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: _kText0,
                                ),
                              ),
                              const Gap(3),
                              Text(
                                s.subtitle,
                                style: GoogleFonts.inter(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w400,
                                  color: _kText1,
                                  height: 1.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (i < _steps.length - 1)
                    Container(height: 1, color: _kBorder),
                ],
              );
            }),
          ),
        ),
      ],
    ).animate().fadeIn(duration: 500.ms, delay: 150.ms);
  }
}

// ─── Recent Winners section ───────────────────────────────────────────────────

/// Tries `/games/winners` (admin-moderated feed); falls back to `_kWinners`
/// if the endpoint doesn't exist yet. Same endpoint web uses.
final recentWinnersProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/games/winners',
        queryParameters: {'pageSize': 10});
    final data = res.data;
    List<Map<String, dynamic>> items;
    if (data is List) {
      items = List<Map<String, dynamic>>.from(data);
    } else if (data is Map) {
      items = List<Map<String, dynamic>>.from(
          data['items'] ?? data['winners'] ?? []);
    } else {
      return _kWinners.map((e) => Map<String, dynamic>.from(e)).toList();
    }
    if (items.isEmpty) {
      return _kWinners.map((e) => Map<String, dynamic>.from(e)).toList();
    }
    return items;
  } catch (_) {
    return _kWinners.map((e) => Map<String, dynamic>.from(e)).toList();
  }
});

class _RecentWinnersSection extends ConsumerWidget {
  const _RecentWinnersSection();

  static const _avatarColors = [
    Color(0xFF8B5CF6),
    Color(0xFFEF4781),
    Color(0xFF34D399),
    Color(0xFFFCBF17),
    Color(0xFF3B82F6),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kCard   = _c.bg1;
    final _kCard2  = _c.bg2;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;
    final winners = ref.watch(recentWinnersProvider).maybeWhen(
      data: (list) => list,
      orElse: () => _kWinners.map((e) => Map<String, dynamic>.from(e)).toList(),
    );
    return _buildList(winners);
  }

  Widget _buildList(List<Map<String, dynamic>> winners) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(
          title: 'Recent Winners',
          subtitle: 'REAL PEOPLE, REAL PRIZES',
        ),
        const Gap(14),
        Container(
          decoration: BoxDecoration(
            color: _kCard,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: _kBorder),
          ),
          child: Column(
            children: List.generate(winners.length, (i) {
              final w = winners[i];
              // Tolerant field reads — backend may use different names.
              final name  = (w['name'] ?? w['userName']
                  ?? w['user']?['name'] ?? 'Anonymous').toString();
              final prize = (w['prize'] ?? w['prizeName']
                  ?? w['reward'] ?? 'a surprise gift').toString();
              // `ago` can be int minutes OR an ISO timestamp string.
              final agoRaw = w['ago'] ?? w['createdAt'] ?? w['timestamp'];
              int ago = 0;
              if (agoRaw is num) {
                ago = agoRaw.toInt();
              } else if (agoRaw is String) {
                final n = int.tryParse(agoRaw);
                if (n != null) {
                  ago = n;
                } else {
                  final t = DateTime.tryParse(agoRaw);
                  if (t != null) {
                    ago = DateTime.now().difference(t).inMinutes;
                  }
                }
              }
              final parts = name.split(' ');
              final initials = parts.isEmpty
                  ? '?'
                  : parts.map((p) => p.isEmpty ? '' : p[0]).take(2).join();
              final color = _avatarColors[i % _avatarColors.length];

              return Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                    child: Row(
                      children: [
                        // Avatar circle
                        Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: color.withValues(alpha: 0.18),
                            border: Border.all(
                                color: color.withValues(alpha: 0.4),
                                width: 1.5),
                          ),
                          child: Center(
                            child: Text(
                              initials,
                              style: GoogleFonts.inter(
                                fontSize: 12,
                                fontWeight: FontWeight.w800,
                                color: color,
                              ),
                            ),
                          ),
                        ),
                        const Gap(12),

                        // Name + prize
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              RichText(
                                text: TextSpan(
                                  style: GoogleFonts.inter(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                    color: _kText1,
                                  ),
                                  children: [
                                    TextSpan(
                                      text: name,
                                      style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                        color: _kText0,
                                      ),
                                    ),
                                    const TextSpan(text: ' won '),
                                    TextSpan(
                                      text: prize,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        color: _kGold,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),

                        // Time ago
                        Text(
                          '$ago min ago',
                          style: GoogleFonts.inter(
                            fontSize: 10,
                            fontWeight: FontWeight.w500,
                            color: _kText2,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (i < winners.length - 1)
                    Container(height: 1, color: _kBorder),
                ],
              );
            }),
          ),
        ),
      ],
    ).animate().fadeIn(duration: 500.ms, delay: 200.ms);
  }
}

// ─── Game Play Dialog ─────────────────────────────────────────────────────────

class _GamePlayDialog extends StatefulWidget {
  final Map<String, dynamic> game;
  const _GamePlayDialog({required this.game});
  @override
  State<_GamePlayDialog> createState() => _GamePlayDialogState();
}

class _GamePlayDialogState extends State<_GamePlayDialog> {
  bool _playing = false;
  bool _done    = false;
  bool _won     = false;
  bool _revealed = false; // Only meaningful for type == 'scratch'
  Map<String, dynamic>? _result;
  late ConfettiController _confetti;

  String get _type  => widget.game['type']  as String? ?? 'scratch';
  String get _id    => widget.game['id']    as String? ?? '';
  int    get _cost  => (widget.game['coinCost'] as num?)?.toInt() ?? 100;
  String get _title => widget.game['title'] as String? ?? 'Play';
  String get _emoji => widget.game['emoji'] as String? ?? '🎮';

  String get _lottie => switch (_type) {
    'scratch'  => 'assets/animations/scratch_reveal.json',
    'wheel'    => 'assets/animations/slot_spin.json',
    'mystery'  => 'assets/animations/mystery_box.json',
    'jackpot'  => 'assets/animations/slot_spin.json',
    'flash'    => 'assets/animations/slot_spin.json',
    'quest'    => 'assets/animations/gift_open.json',
    'streak'   => 'assets/animations/trophy.json',
    'treasure' => 'assets/animations/gift_open.json',
    'wager'    => 'assets/animations/slot_spin.json',
    'bid'      => 'assets/animations/mystery_box.json',
    _          => 'assets/animations/gift_open.json',
  };

  String get _hint => switch (_type) {
    'scratch'  => 'Scratch to reveal your prize',
    'wheel'    => 'Spin the wheel of fortune',
    'mystery'  => 'Open the mystery box',
    'jackpot'  => 'Pull the jackpot lever',
    'flash'    => 'Flash deal — limited time!',
    'quest'    => 'Complete your daily quest',
    'streak'   => 'Claim your streak reward',
    'treasure' => 'Find the hidden treasure',
    'wager'    => 'Place your Goins wager',
    'bid'      => 'Make your secret bid',
    _          => 'Reveal your gift',
  };

  @override
  void initState() {
    super.initState();
    _confetti = ConfettiController(duration: const Duration(seconds: 3));
  }

  @override
  void dispose() {
    _confetti.dispose();
    super.dispose();
  }

  /// Maps the game's `type` (e.g. "scratch", "mystery") to the actual backend
  /// endpoint and any required body. The API has named endpoints per game
  /// (POST /games/scratch, /games/mystery-box, …) NOT a generic /games/:id/play.
  ({String path, Map<String, dynamic>? body}) _endpointForType() {
    switch (_type) {
      case 'scratch':  return (path: '/games/scratch',     body: null);
      case 'jackpot':  return (path: '/games/jackpot',     body: null);
      case 'mystery':  return (path: '/games/mystery-box', body: null);
      case 'streak':   return (path: '/games/streak',      body: null);
      case 'treasure': return (path: '/games/treasure-hunt', body: {'pickIndex': 0});
      case 'wager':    return (path: '/games/goin-wager',    body: {'stake': 100});
      case 'flash':    return (path: '/games/jackpot',       body: null); // flash uses jackpot path
      case 'wheel':    return (path: '/games/scratch',       body: null); // wheel rendered as scratch
      case 'bid':      return (path: '/games/scratch',       body: null); // placeholder
      case 'quest':    return (path: '/games/daily-quest/claim', body: {'step': 1});
      default:         return (path: '/games/scratch', body: null);
    }
  }

  Future<void> _play(WidgetRef ref) async {
    if (_playing) return;
    setState(() => _playing = true);
    HapticFeedback.heavyImpact();
    AudioService.instance.tap();

    try {
      final dio = ref.read(dioProvider);
      final ep = _endpointForType();
      final res = await dio.post(ep.path, data: ep.body);
      final data = Map<String, dynamic>.from(res.data as Map);
      final won  = data['won'] as bool? ?? false;
      if (!mounted) return;
      setState(() {
        _done    = true;
        _won     = won;
        _result  = data;
        _playing = false;
      });
      if (won) {
        HapticFeedback.heavyImpact();
        // Interactive games reveal their own outcome; confetti waits.
        if (!_isInteractive) {
          _confetti.play();
          AudioService.instance.winJingle();
        }
      } else {
        HapticFeedback.mediumImpact();
      }
      // Refresh ALL coin-balance surfaces (chip on home, play hub, profile card).
      ref.invalidate(gamesHubProvider);
      ref.invalidate(coinBalanceProvider);
      ref.invalidate(profileProvider);

      // ── Coin-fly: physical coins fly from game center to balance chip.
      // For non-interactive games, fire immediately. Interactive games
      // (scratch, wheel, etc) call _burstCoinsOnReveal() from their reveal
      // handlers since coin-fly should coincide with the reveal animation.
      if (won && !_isInteractive && mounted) {
        final prize = (data['coinsAwarded'] ?? data['coins'] ?? data['reward'])
            as num?;
        _burstCoinsOnReveal(prize: prize?.toInt() ?? 20);
      }
    } on DioException catch (e) {
      // Daily-limit responses come back as HTTP 400 with a human message in
      // `response.data.message`. Treat them as a friendly UI state instead of
      // silently falling into demo-mode (which makes the wallet not credit).
      final status = e.response?.statusCode ?? 0;
      final msg = (e.response?.data is Map)
          ? (e.response!.data['message']?.toString() ?? '')
          : '';
      final isLimit = status == 400 &&
          (msg.toLowerCase().contains('limit') ||
           msg.toLowerCase().contains('come back'));
      if (!mounted) return;
      if (isLimit) {
        setState(() => _playing = false);
        ScaffoldMessenger.of(context)
          ..clearSnackBars()
          ..showSnackBar(SnackBar(
            content: Text(msg.isEmpty
                ? 'You\'ve already played today. Come back tomorrow!'
                : msg),
            duration: const Duration(seconds: 3),
            behavior: SnackBarBehavior.floating,
          ));
        return;
      }
      // Genuine network/auth failure → keep the existing demo fallback so
      // offline users still see the animation, but flag _demo so we don't
      // expect the wallet to update.
      await Future.delayed(const Duration(milliseconds: 1600));
      if (!mounted) return;
      final won = math.Random().nextBool();
      setState(() { _done = true; _won = won; _playing = false; });
      if (won && !_isInteractive) {
        _confetti.play();
        AudioService.instance.winJingle();
      }
    } catch (_) {
      // Non-Dio failure (e.g. JSON shape) — fall through to the demo path
      // so the user always gets a visible response.
      await Future.delayed(const Duration(milliseconds: 1600));
      if (!mounted) return;
      final won = math.Random().nextBool();
      setState(() { _done = true; _won = won; _playing = false; });
      if (won && !_isInteractive) {
        _confetti.play();
        AudioService.instance.winJingle();
      }
    }
  }

  /// True for game types where the user reveals the prize interactively
  /// (scratch, wheel, mystery box, jackpot reels, treasure hunt, etc.).
  bool get _isInteractive {
    final t = _type.toLowerCase();
    return t.contains('scratch') ||
        t.contains('wheel')    || t.contains('spin') ||
        t.contains('mystery')  || t.contains('box') ||
        t.contains('jackpot')  || t.contains('flash') || t.contains('slot') ||
        t.contains('treasure') ||
        t.contains('wager')    || t.contains('dice') ||
        t.contains('streak')   ||
        t.contains('quest')    ||
        t.contains('bid');
  }

  /// Burst gold coins from the current game body's center toward the coin
  /// balance chip. Coin count scales roughly with prize magnitude.
  /// Call this from interactive game reveal callbacks or from _play on win.
  void _burstCoinsOnReveal({required int prize}) {
    if (!mounted) return;
    // Slight delay so the reveal/scratch/wheel animations can "peak" first.
    Future.delayed(const Duration(milliseconds: 220), () {
      if (!mounted) return;
      final size = MediaQuery.of(context).size;
      // Fire from roughly 40% down the screen (where most game bodies live)
      final source = Offset(size.width / 2, size.height * 0.42);
      final amount = prize <= 20
          ? 5
          : prize <= 50
              ? 8
              : prize <= 150
                  ? 12
                  : prize <= 500
                      ? 16
                      : 20;
      CoinFly.burst(
        context,
        from: source,
        amount: amount,
        onArrive: () {
          // Coin balance refreshes during flight; the pulse arrives when
          // the number has already updated — visually perfect.
        },
      );
    });
  }

  /// Called by per-type game bodies when their reveal animation completes.
  void _onReveal() {
    if (_revealed) return;
    setState(() => _revealed = true);
    if (_won) {
      HapticFeedback.heavyImpact();
      _confetti.play();
      AudioService.instance.winJingle();

      // ── Physical coins fly from game center to balance chip.
      final r = _result;
      final prize = r == null
          ? null
          : (r['coinsAwarded'] ?? r['coins'] ?? r['reward']) as num?;
      _burstCoinsOnReveal(prize: prize?.toInt() ?? 50);
    } else {
      HapticFeedback.mediumImpact();
    }
  }

  /// Routes to the right unique game widget based on `_type`.
  Widget _buildGameBody() {
    final t = _type.toLowerCase();
    if (t.contains('scratch')) {
      return _ScratchBody(
          won: _won, result: _result, onReveal: _onReveal);
    }
    if (t.contains('wheel') || t.contains('spin')) {
      return WheelGameBody(won: _won, onReveal: _onReveal);
    }
    if (t.contains('mystery') || t.contains('box')) {
      return MysteryBoxBody(won: _won, onReveal: _onReveal);
    }
    if (t.contains('flash')) {
      return JackpotBody(
        won: _won,
        onReveal: _onReveal,
        endsInSec: (widget.game['endsIn'] as num?)?.toInt(),
      );
    }
    if (t.contains('jackpot') || t.contains('slot')) {
      return JackpotBody(won: _won, onReveal: _onReveal);
    }
    if (t.contains('treasure')) {
      return TreasureHuntBody(won: _won, onReveal: _onReveal);
    }
    if (t.contains('wager') || t.contains('dice')) {
      return DiceBody(won: _won, onReveal: _onReveal);
    }
    if (t.contains('streak')) {
      return StreakLadderBody(won: _won, onReveal: _onReveal);
    }
    if (t.contains('quest')) {
      return QuestBody(won: _won, onReveal: _onReveal);
    }
    if (t.contains('bid')) {
      return SecretBidBody(won: _won, onReveal: _onReveal);
    }
    return _ResultContent(won: _won, result: _result);
  }

  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kCard   = _c.bg1;
    final _kCard2  = _c.bg2;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;
    final sw = MediaQuery.of(context).size.width;
    final dialogWidth = math.min(sw * 0.9, 380.0);

    return Consumer(
      builder: (ctx, ref, _) {
        return Material(
          color: Colors.transparent,
          child: Stack(
            alignment: Alignment.topCenter,
            children: [
              // Dialog card
              Container(
                width: dialogWidth,
                decoration: BoxDecoration(
                  color: _kCard,
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(color: _kBorder, width: 1.5),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.6),
                      blurRadius: 40,
                      offset: const Offset(0, 12),
                    ),
                  ],
                ),
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Close button row
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        // Cost chip
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 5),
                          decoration: BoxDecoration(
                            color: _kGold.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(
                                color: _kGold.withValues(alpha: 0.3)),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Text('🪙',
                                  style: TextStyle(fontSize: 12)),
                              const Gap(5),
                              Text(
                                'Uses $_cost Goins',
                                style: GoogleFonts.inter(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: _kGold,
                                ),
                              ),
                            ],
                          ),
                        ),
                        // X close
                        GestureDetector(
                          onTap: () => Navigator.of(ctx).pop(),
                          child: Container(
                            width: 34,
                            height: 34,
                            decoration: BoxDecoration(
                              color: _kCard2,
                              shape: BoxShape.circle,
                              border: Border.all(color: _kBorder),
                            ),
                            child: Icon(Icons.close_rounded,
                                size: 16, color: _kText1),
                          ),
                        ),
                      ],
                    ),
                    const Gap(18),

                    // Game title
                    Text(
                      '$_emoji  $_title',
                      style: GoogleFonts.inter(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: _kText0,
                      ),
                    ),
                    const Gap(4),

                    if (!_done)
                      Text(
                        _hint,
                        style: GoogleFonts.inter(
                          fontSize: 13,
                          color: _kText1,
                          fontWeight: FontWeight.w500,
                        ),
                      ),

                    const Gap(24),

                    // Game content — centered
                    if (!_done) ...[
                      // Lottie animation
                      SizedBox(
                        width: 180,
                        height: 180,
                        child: Lottie.asset(
                          _lottie,
                          repeat: _playing,
                          animate: _playing,
                        ),
                      ),
                      const Gap(24),

                      // Play / loading
                      if (_playing)
                        const SizedBox(
                          width: 32,
                          height: 32,
                          child: CircularProgressIndicator(
                            color: _kGold,
                            strokeWidth: 2.5,
                          ),
                        )
                      else
                        GestureDetector(
                          onTap: () => _play(ref),
                          child: Container(
                            width: double.infinity,
                            height: 52,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(12),
                              color: GColors.brand,
                            ),
                            child: Center(
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.play_arrow_rounded,
                                      color: Colors.white, size: 20),
                                  const Gap(6),
                                  Text(
                                    'TAP TO PLAY',
                                    style: GoogleFonts.inter(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w900,
                                      color: Colors.white,
                                      letterSpacing: 0.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                    ] else if (_isInteractive && !_revealed) ...[
                      // Unique per-type gameplay body
                      _buildGameBody(),
                    ] else
                      _ResultContent(won: _won, result: _result),

                    const Gap(8),
                  ],
                ),
              ),

              // Confetti at top
              Positioned(
                top: 0,
                child: ConfettiWidget(
                  confettiController: _confetti,
                  blastDirectionality: BlastDirectionality.explosive,
                  numberOfParticles: 40,
                  colors: const [
                    _kGold,
                    _kRose,
                    _kEmerald,
                    Colors.white,
                    _kViolet,
                  ],
                  createParticlePath: _starPath,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

// ─── Scratch body ─────────────────────────────────────────────────────────────

class _ScratchBody extends StatelessWidget {
  final bool won;
  final Map<String, dynamic>? result;
  final VoidCallback onReveal;
  const _ScratchBody({required this.won, required this.result, required this.onReveal});

  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kCard   = _c.bg1;
    final _kCard2  = _c.bg2;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('Scratch to reveal your prize 👆',
          textAlign: TextAlign.center,
          style: GoogleFonts.inter(
            fontSize: 13, color: _kGold, fontWeight: FontWeight.w700)),
        const Gap(14),
        SizedBox(
          width: 260, height: 180,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Scratcher(
              brushSize: 42,
              threshold: 45,
              color: const Color(0xFF94A3B8),
              image: Image(
                image: const AssetImage('assets/icon/logo.png'),
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  decoration: const BoxDecoration(
                    color: Color(0xFF64748B),
                  ),
                  child: const Center(
                    child: Text('✨  SCRATCH ME  ✨',
                      style: TextStyle(
                        fontSize: 18, fontWeight: FontWeight.w900,
                        color: Colors.white, letterSpacing: 2,
                      )),
                  ),
                ),
              ),
              onThreshold: onReveal,
              child: Container(
                decoration: const BoxDecoration(
                  color: GColors.bg1,
                ),
                child: Center(
                  child: _ResultContent(won: won, result: result, compact: true),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

// ─── Result content (inside dialog) ──────────────────────────────────────────

class _ResultContent extends StatelessWidget {
  final bool won;
  final Map<String, dynamic>? result;
  final bool compact; // when true, smaller sizes for use inside scratch card
  const _ResultContent({required this.won, required this.result, this.compact = false});

  // Fallback demo prizes (when backend doesn't return `prize` / `coinsEarned`).
  static const _demoPrizes = [
    {'emoji': '🎁', 'name': 'Amazon ₹500 Gift Card', 'type': 'Gift Card',   'value': 500},
    {'emoji': '🎟️', 'name': 'Flipkart ₹250 Voucher',  'type': 'Voucher',     'value': 250},
    {'emoji': '🪙', 'name': '500 Bonus Goins',        'type': 'Goins',       'value': 500},
    {'emoji': '🛍️', 'name': 'Mystery Gift Box',       'type': 'Free Gift',   'value': 0},
    {'emoji': '🎉', 'name': 'Bonus Spin',              'type': 'Free Play',   'value': 0},
    {'emoji': '💎', 'name': 'Premium Discount 20%',   'type': 'Discount',    'value': 20},
    {'emoji': '☕', 'name': 'Starbucks ₹300 Gift',    'type': 'Gift Card',   'value': 300},
    {'emoji': '🎂', 'name': 'Free Cake Topper',        'type': 'Free Gift',   'value': 0},
  ];

  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kCard   = _c.bg1;
    final _kCard2  = _c.bg2;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;
    final prize  = (result?['prize'] as Map?) ?? {};
    final coinsFromApi = (result?['coinsEarned'] as num?)?.toInt() ?? 0;

    // Either the API's prize, or a random demo prize (so user always sees
    // SOMETHING they won).
    final resolved = prize.isNotEmpty
        ? prize
        : _demoPrizes[math.Random().nextInt(_demoPrizes.length)];

    final pEmoji = (resolved['emoji'] ?? resolved['icon'] ?? '🎁') as String;
    final pName  = (resolved['name']  ?? resolved['title']
        ?? 'Mystery Gift') as String;
    final pType  = (resolved['type']
        ?? resolved['category'] ?? '') as String;
    final pValue = resolved['value'] ?? resolved['amount'];
    final pImage = resolved['image'] as String?;

    // If won but no coins from API, give a demo amount so UI feels complete.
    final coins = coinsFromApi > 0
        ? coinsFromApi
        : (won ? 50 + math.Random().nextInt(450) : 0);

    final lottieSize = compact ? 60.0 : 120.0;
    final titleSize  = compact ? 15.0 : 22.0;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: lottieSize,
          height: lottieSize,
          child: won
              ? Lottie.asset('assets/animations/trophy.json', repeat: false)
              : Lottie.asset('assets/animations/thumbs_up.json', repeat: false),
        ),
        Gap(compact ? 2 : 10),
        Text(
          won ? '🎉 You Won!' : 'So close!',
          textAlign: TextAlign.center,
          style: GoogleFonts.inter(
            fontSize: titleSize,
            fontWeight: FontWeight.w900,
            color: won ? _kGold : _kText1,
          ),
        ),
        if (!won && !compact) ...[
          const Gap(4),
          Text('Come back tomorrow for another chance',
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(
              fontSize: 12, color: _kText2, fontWeight: FontWeight.w500)),
        ],

        // ── Prize card — the hero of the reveal ──────────────────────────
        if (won && !compact) ...[
          const Gap(14),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: GColors.bg1,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: _kGold.withValues(alpha: 0.4), width: 1.5),
            ),
            child: Row(children: [
              // Prize art
              Container(
                width: 54, height: 54,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: _kGold.withValues(alpha: 0.3)),
                ),
                clipBehavior: Clip.antiAlias,
                child: pImage != null && pImage.isNotEmpty
                    ? Image.network(pImage, fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Center(
                          child: Text(pEmoji, style: const TextStyle(fontSize: 28))))
                    : Center(child: Text(pEmoji, style: const TextStyle(fontSize: 30))),
              ),
              const Gap(12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (pType.isNotEmpty)
                    Text(pType.toUpperCase(), style: GoogleFonts.inter(
                      fontSize: 9, fontWeight: FontWeight.w800,
                      color: _kRose, letterSpacing: 1)),
                  const Gap(2),
                  Text(pName, style: GoogleFonts.inter(
                    fontSize: 15, fontWeight: FontWeight.w800,
                    color: _kText0, height: 1.25)),
                  if (pValue != null && pValue.toString() != '0') ...[
                    const Gap(3),
                    Text(
                      pType.toLowerCase().contains('discount')
                        ? '$pValue% off'
                        : pType.toLowerCase().contains('goin') || pType.toLowerCase().contains('coin')
                          ? '$pValue Goins'
                          : '₹$pValue value',
                      style: GoogleFonts.inter(
                        fontSize: 12, fontWeight: FontWeight.w700, color: _kGold)),
                  ],
                ],
              )),
            ]),
          ).animate()
              .fadeIn(duration: 300.ms, delay: 200.ms)
              .slideY(begin: 0.15, end: 0,
                  duration: 500.ms, curve: Curves.easeOutCubic),
        ] else if (won && compact) ...[
          const Gap(2),
          Text(pName, textAlign: TextAlign.center, maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.inter(
              fontSize: 11, fontWeight: FontWeight.w700, color: _kText0)),
        ],

        // ── Coins earned chip ────────────────────────────────────────────
        if (won && coins > 0 && !compact) ...[
          const Gap(14),
          // Coin-fall burst + earned chip with count-up animation
          Stack(
            alignment: Alignment.center,
            clipBehavior: Clip.none,
            children: [
              Positioned(
                top: -24,
                child: SizedBox(
                  width: 140, height: 80,
                  child: Lottie.asset(
                    'assets/animations/coin_fall.json',
                    repeat: false,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
                decoration: BoxDecoration(
                  color: _kGold.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: _kGold.withValues(alpha: 0.3)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('🪙', style: TextStyle(fontSize: 16)),
                    const Gap(7),
                    Text('+',
                      style: GoogleFonts.inter(
                        fontSize: 15, fontWeight: FontWeight.w800, color: _kGold,
                      )),
                    AnimatedDigitWidget(
                      value: coins,
                      duration: const Duration(milliseconds: 1100),
                      curve: Curves.easeOutCubic,
                      textStyle: GoogleFonts.inter(
                        fontSize: 15, fontWeight: FontWeight.w800, color: _kGold,
                      ),
                    ),
                    Text(' Goins earned!',
                      style: GoogleFonts.inter(
                        fontSize: 15, fontWeight: FontWeight.w800, color: _kGold,
                      )),
                  ],
                ),
              ).animate()
                  .fadeIn(duration: 400.ms, delay: 400.ms)
                  .scaleXY(begin: 0.8, end: 1.0,
                      duration: 500.ms, curve: Curves.elasticOut),
            ],
          ),
        ],
        if (!compact) ...[
          const Gap(24),
          GestureDetector(
            onTap: () {
              AudioService.instance.tap();
              Navigator.of(context).pop();
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 13),
              decoration: BoxDecoration(
                color: _kCard2,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: _kBorder),
              ),
              child: Text(
                'Close',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: _kText0,
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

// ─── Streak Stats section ─────────────────────────────────────────────────────

class _StreakStatsSection extends StatelessWidget {
  final Map<String, dynamic>? hub;
  const _StreakStatsSection({required this.hub});

  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kCard   = _c.bg1;
    final _kCard2  = _c.bg2;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;
    final streak   = (hub?['streakDays']   as num?)?.toInt() ?? 0;
    final totalWon = (hub?['totalWon']     as num?)?.toInt() ?? 0;
    final gamesP   = (hub?['gamesPlayed']  as num?)?.toInt() ?? 0;
    final nextMilestone = streak < 7 ? 7 : streak < 30 ? 30 : 100;
    final progress = (streak / nextMilestone).clamp(0.0, 1.0);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(title: 'Your Streak', subtitle: 'KEEP PLAYING DAILY'),
        const Gap(14),
        Container(
          decoration: BoxDecoration(
            color: _kCard,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: _kBorder),
          ),
          padding: const EdgeInsets.all(18),
          child: Column(
            children: [
              // Streak flame + count
              Row(
                children: [
                  Container(
                    width: 56, height: 56,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xFFFB923C).withValues(alpha: 0.12),
                      border: Border.all(
                          color: const Color(0xFFFB923C).withValues(alpha: 0.4)),
                    ),
                    child: const Center(
                      child: Text('🔥', style: TextStyle(fontSize: 26)),
                    ),
                  ),
                  const Gap(14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        RichText(
                          text: TextSpan(
                            style: GoogleFonts.inter(
                              fontSize: 28, fontWeight: FontWeight.w900, color: _kText0),
                            children: [
                              TextSpan(text: '$streak'),
                              TextSpan(
                                text: ' day${streak != 1 ? 's' : ''}',
                                style: TextStyle(
                                  fontSize: 14, fontWeight: FontWeight.w500, color: _kText2),
                              ),
                            ],
                          ),
                        ),
                        Text('Current streak', style: GoogleFonts.inter(
                          fontSize: 12, color: _kText2, fontWeight: FontWeight.w500)),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text('Next: $nextMilestone days',
                        style: GoogleFonts.inter(
                          fontSize: 11, color: _kGold, fontWeight: FontWeight.w700)),
                      const Gap(4),
                      Text('🎁 Bonus reward', style: GoogleFonts.inter(
                        fontSize: 10, color: _kText2)),
                    ],
                  ),
                ],
              ),
              const Gap(14),
              // Progress bar
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 6,
                  backgroundColor: _kBorder,
                  valueColor: const AlwaysStoppedAnimation<Color>(_kGold),
                ),
              ),
              const Gap(4),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('$streak days', style: GoogleFonts.inter(
                    fontSize: 10, color: _kText2)),
                  Text('$nextMilestone days', style: GoogleFonts.inter(
                    fontSize: 10, color: _kText2)),
                ],
              ),
              const Gap(16),
              Container(height: 1, color: _kBorder),
              const Gap(14),
              // Stats row
              Row(
                children: [
                  _StatChip('🎮', '$gamesP', 'Played'),
                  _StatChip('🏆', '$totalWon', 'Won'),
                  _StatChip('🔥', '$streak', 'Streak'),
                ],
              ),
            ],
          ),
        ),
      ],
    ).animate().fadeIn(duration: 500.ms, delay: 100.ms);
  }
}

class _StatChip extends StatelessWidget {
  final String emoji, value, label;
  const _StatChip(this.emoji, this.value, this.label);

  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kCard   = _c.bg1;
    final _kCard2  = _c.bg2;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;
    return Expanded(
      child: Column(children: [
        Text(emoji, style: const TextStyle(fontSize: 18)),
        const Gap(4),
        Text(value, style: GoogleFonts.inter(
          fontSize: 18, fontWeight: FontWeight.w900, color: _kText0)),
        Text(label, style: GoogleFonts.inter(
          fontSize: 10, color: _kText2, fontWeight: FontWeight.w500)),
      ]),
    );
  }
}

// ─── Sticker Album card ───────────────────────────────────────────────────────

class _StickerAlbumCard extends ConsumerWidget {
  const _StickerAlbumCard();

  static const _stickerEmojis = ['⭐', '🎁', '🏆', '🎰', '✨', '🔥', '🎯', '💎'];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final _c       = GColors.of(context);
    final _kBg     = _c.bg0;
    final _kCard   = _c.bg1;
    final _kCard2  = _c.bg2;
    final _kBorder = _c.border;
    final _kText0  = _c.text0;
    final _kText1  = _c.text1;
    final _kText2  = _c.text2;
    final album = ref.watch(albumProvider);
    final collected = album.uniqueCollected;
    final total = album.totalAvailable;
    return Container(
      decoration: BoxDecoration(
        color: GColors.bg1,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _kViolet.withValues(alpha: 0.35), width: 1.5),
      ),
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('📖', style: TextStyle(fontSize: 22)),
              const Gap(10),
              Text('Sticker Album', style: GoogleFonts.inter(
                fontSize: 18, fontWeight: FontWeight.w800, color: _kText0,
              )),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: _kViolet.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: _kViolet.withValues(alpha: 0.4)),
                ),
                child: Text('$collected/$total collected', style: GoogleFonts.inter(
                  fontSize: 10, fontWeight: FontWeight.w700, color: const Color(0xFFA78BFA),
                )),
              ),
            ],
          ),
          const Gap(6),
          Text('Collect all stickers to unlock a mystery prize!',
            style: GoogleFonts.inter(
              fontSize: 12, color: _kText1, fontWeight: FontWeight.w500, height: 1.4)),
          const Gap(16),
          // Sticker grid (2 rows × 4 cols)
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 8,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 1,
            ),
            itemCount: _stickerEmojis.length,
            itemBuilder: (ctx, i) {
              final collected = i < album.uniqueCollected.clamp(0, _stickerEmojis.length);
              return AnimatedContainer(
                duration: 300.ms,
                decoration: BoxDecoration(
                  color: collected
                      ? _kViolet.withValues(alpha: 0.18)
                      : _kCard2,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: collected
                        ? _kViolet.withValues(alpha: 0.4)
                        : _kBorder,
                  ),
                ),
                child: Center(
                  child: collected
                      ? Text(_stickerEmojis[i],
                          style: const TextStyle(fontSize: 20))
                      : Icon(Icons.lock_outline_rounded,
                          size: 14, color: _kText2),
                ),
              );
            },
          ),
          const Gap(14),
          GestureDetector(
            onTap: () {
              HapticFeedback.selectionClick();
              context.push('/stickers');
            },
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                color: _kViolet.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: _kViolet.withValues(alpha: 0.35)),
              ),
              child: Center(
                child: Text('View Full Album →', style: GoogleFonts.inter(
                  fontSize: 13, fontWeight: FontWeight.w700,
                  color: const Color(0xFFA78BFA),
                )),
              ),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 500.ms, delay: 150.ms);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

String _fmt(int n) {
  if (n >= 100000) return '${(n / 100000).toStringAsFixed(1)}L';
  if (n >= 1000)   return '${(n / 1000).toStringAsFixed(1)}K';
  return n.toString();
}

Path _starPath(Size size) {
  final path  = Path();
  const n     = 5;
  final a     = size.width / 2;
  final b     = size.height / 2;
  double angle = -math.pi / 2;
  const step   = math.pi / n;
  path.moveTo(a + a * math.cos(angle), b + b * math.sin(angle));
  for (var i = 1; i <= n * 2; i++) {
    angle += step;
    final r = i.isOdd ? a * 0.45 : a;
    path.lineTo(a + r * math.cos(angle), b + r * math.sin(angle));
  }
  path.close();
  return path;
}
