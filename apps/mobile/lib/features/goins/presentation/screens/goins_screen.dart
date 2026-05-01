import 'dart:math' as math;
import 'package:confetti/confetti.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/services/audio_service.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

final _goinsDataProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get('/coins/balance');
  return Map<String, dynamic>.from(res.data as Map);
});

final _transactionsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final dio = ref.watch(dioProvider);
  try {
    final res = await dio.get('/coins/history',
        queryParameters: {'limit': 30});
    final data = res.data;
    if (data is Map) {
      return List<Map<String, dynamic>>.from(
          data['items'] ?? data['data'] ?? []);
    }
    if (data is List) return List<Map<String, dynamic>>.from(data);
  } catch (_) {}
  return [];
});

// ─── Screen ───────────────────────────────────────────────────────────────────

class GoinsScreen extends ConsumerStatefulWidget {
  const GoinsScreen({super.key});

  @override
  ConsumerState<GoinsScreen> createState() => _GoinsScreenState();
}

class _GoinsScreenState extends ConsumerState<GoinsScreen>
    with TickerProviderStateMixin {
  late final ConfettiController _confetti;
  late final AnimationController _pulseCtrl;
  late final AnimationController _countCtrl;
  int? _displayBalance;

  @override
  void initState() {
    super.initState();
    _confetti  = ConfettiController(duration: const Duration(seconds: 3));
    _pulseCtrl = AnimationController(vsync: this, duration: 2000.ms)
        ..repeat(reverse: true);
    _countCtrl = AnimationController(vsync: this, duration: 1800.ms);
  }

  @override
  void dispose() {
    _confetti.dispose();
    _pulseCtrl.dispose();
    _countCtrl.dispose();
    super.dispose();
  }

  void _onBalanceLoaded(int balance) {
    if (_displayBalance != null) return; // already animated
    _displayBalance = 0;
    _countCtrl.forward();
    Future.delayed(400.ms, () {
      _confetti.play();
      AudioService.instance.coinCollect();
    });
  }

  @override
  Widget build(BuildContext context) {
    final goinsAsync = ref.watch(_goinsDataProvider);
    final txAsync    = ref.watch(_transactionsProvider);
    final topPad     = MediaQuery.of(context).padding.top;

    final c = GColors.of(context);
    return Scaffold(
      backgroundColor: c.bg0,
      body: Stack(
        children: [
          CustomScrollView(
            physics: const BouncingScrollPhysics(),
            slivers: [
              // ── App bar ───────────────────────────────────────────────
              SliverAppBar(
                pinned: true,
                backgroundColor: c.bg0,
                surfaceTintColor: Colors.transparent,
                leading: IconButton(
                  icon: Icon(Icons.arrow_back_ios_new_rounded,
                      size: 18, color: c.text0),
                  onPressed: () => context.pop(),
                ),
                titleSpacing: 4,
                title: Row(
                  children: [
                    Text('My Goins',
                      style: GoogleFonts.inter(
                        fontSize: 22, fontWeight: FontWeight.w900,
                        color: c.text0,
                      )),
                    const Spacer(),
                    GestureDetector(
                      onTap: () {
                        HapticFeedback.lightImpact();
                        ref.invalidate(_goinsDataProvider);
                        ref.invalidate(_transactionsProvider);
                      },
                      child: Icon(Icons.refresh_rounded,
                          size: 20, color: c.text2),
                    ),
                  ],
                ),
                bottom: PreferredSize(
                  preferredSize: const Size.fromHeight(1),
                  child: Container(height: 1, color: c.border),
                ),
              ),

              // ── Balance card ──────────────────────────────────────────
              SliverToBoxAdapter(
                child: goinsAsync.when(
                  loading: () => _BalanceShimmer(),
                  error:   (_, __) => _ErrorCard(
                    onRetry: () => ref.invalidate(_goinsDataProvider)),
                  data: (d) {
                    final balance = (d['balance'] as num?)?.toInt() ?? 0;
                    final pending =
                        (d['pendingBalance'] as num?)?.toInt() ?? 0;
                    _onBalanceLoaded(balance);
                    return _BalanceCard(
                      balance: balance,
                      pending: pending,
                      countCtrl: _countCtrl,
                      pulseCtrl: _pulseCtrl,
                    );
                  },
                ),
              ),

              // ── How to earn ───────────────────────────────────────────
              const SliverToBoxAdapter(child: _EarnSection()),

              // ── Spend options ─────────────────────────────────────────
              const SliverToBoxAdapter(child: _SpendSection()),

              // ── Transaction header ────────────────────────────────────
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 24, 20, 12),
                  child: Row(
                    children: [
                      Text('Recent Activity', style: GoogleFonts.inter(
                        fontSize: 17, fontWeight: FontWeight.w800,
                        color: c.text0,
                      )),
                      const Spacer(),
                      txAsync.when(
                        data:    (tx) => Text('${tx.length} transactions',
                          style: GoogleFonts.inter(
                            fontSize: 12, color: c.text2)),
                        loading: () => const SizedBox.shrink(),
                        error:   (_, __) => const SizedBox.shrink(),
                      ),
                    ],
                  ),
                ),
              ),

              // ── Transactions ──────────────────────────────────────────
              txAsync.when(
                loading: () => const SliverToBoxAdapter(
                  child: Center(child: Padding(
                    padding: EdgeInsets.all(40),
                    child: CircularProgressIndicator(
                        color: GColors.brand, strokeWidth: 2),
                  )),
                ),
                error: (_, __) => const SliverToBoxAdapter(
                  child: SizedBox.shrink()),
                data: (txns) {
                  if (txns.isEmpty) {
                    return SliverToBoxAdapter(
                      child: Center(
                        child: Padding(
                          padding: const EdgeInsets.all(40),
                          child: Column(
                            children: [
                              const Text('🪙',
                                  style: TextStyle(fontSize: 44)),
                              const Gap(12),
                              Text('No transactions yet',
                                style: GoogleFonts.inter(
                                  fontSize: 15,
                                  color: c.text1,
                                  fontWeight: FontWeight.w500,
                                )),
                            ],
                          ),
                        ),
                      ),
                    );
                  }
                  return SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    sliver: SliverList.separated(
                      separatorBuilder: (_, __) =>
                          Container(height: 1, color: c.border),
                      itemCount: txns.length,
                      itemBuilder: (ctx, i) => _TxRow(tx: txns[i])
                          .animate(delay: (i * 35).ms)
                          .fadeIn(duration: 250.ms)
                          .slideX(begin: 0.04, end: 0),
                    ),
                  );
                },
              ),

              const SliverToBoxAdapter(child: SizedBox(height: 100)),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Balance card ─────────────────────────────────────────────────────────────

class _BalanceCard extends StatelessWidget {
  final int balance;
  final int pending;
  final AnimationController countCtrl;
  final AnimationController pulseCtrl;

  const _BalanceCard({
    required this.balance,
    required this.pending,
    required this.countCtrl,
    required this.pulseCtrl,
  });

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: c.bg1,
          borderRadius: BorderRadius.circular(16),
          // Subtle gold top-border as the ONLY coin identity marker
          border: Border(
            top: BorderSide(
                color: GColors.gold.withValues(alpha: 0.30), width: 2),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header row
            Row(
              children: [
                AnimatedBuilder(
                  animation: pulseCtrl,
                  builder: (_, child) => Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: GColors.gold.withValues(
                          alpha: 0.10 + 0.08 * pulseCtrl.value),
                    ),
                    child: const Text('🪙',
                        style: TextStyle(fontSize: 22)),
                  ),
                ),
                const Gap(12),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Goins Balance', style: GoogleFonts.inter(
                      fontSize: 12, color: c.text2,
                      fontWeight: FontWeight.w600, letterSpacing: 0.5,
                    )),
                    Text('Gift Coins', style: GoogleFonts.inter(
                      fontSize: 10, color: c.text2)),
                  ],
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: GColors.emerald.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                        color: GColors.emerald.withValues(alpha: 0.3)),
                  ),
                  child: Text('Active', style: GoogleFonts.inter(
                    fontSize: 10, fontWeight: FontWeight.w700,
                    color: GColors.emerald,
                  )),
                ),
              ],
            ),

            const Gap(20),

            // Count-up balance number
            AnimatedBuilder(
              animation: countCtrl,
              builder: (_, __) {
                final curved = Curves.easeOut.transform(countCtrl.value);
                final displayed = (curved * balance).round();
                return ShaderMask(
                  shaderCallback: (r) =>
                      GColors.goldGradient.createShader(r),
                  child: Text(
                    NumberFormat('#,##0').format(displayed),
                    style: GoogleFonts.inter(
                      fontSize: 52,
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                      letterSpacing: -2,
                    ),
                  ),
                );
              },
            ),
            const Gap(4),
            Row(
              children: [
                Text('≈ ₹${(balance / 100).toStringAsFixed(0)} value',
                  style: GoogleFonts.inter(
                    fontSize: 13, color: c.text1)),
                const Spacer(),
                const Text('G', style: TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w900,
                  color: Color(0xFFF59E0B),
                )),
              ],
            ),

            if (pending > 0) ...[
              const Gap(14),
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: GColors.emerald.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                      color: GColors.emerald.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.hourglass_top_rounded,
                        size: 14, color: GColors.emerald),
                    const Gap(8),
                    Text(
                      '+${NumberFormat('#,##0').format(pending)} G pending',
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: GColors.emerald,
                      )),
                  ],
                ),
              ),
            ],

            const Gap(18),

            // Quick actions
            Row(
              children: [
                _QuickAction(
                    icon: Icons.casino_rounded,
                    label: 'Play Games',
                    color: const Color(0xFFA78BFA),
                    onTap: () {}),
                const Gap(10),
                _QuickAction(
                    icon: Icons.local_offer_rounded,
                    label: 'Redeem',
                    color: GColors.brand,
                    onTap: () {}),
                const Gap(10),
                _QuickAction(
                    icon: Icons.share_rounded,
                    label: 'Share',
                    color: GColors.emerald,
                    onTap: () {}),
              ],
            ),
          ],
        ),
      )
          .animate()
          .fadeIn(duration: 500.ms)
          .slideY(begin: -0.06, end: 0),
    );
  }
}

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: color.withValues(alpha: 0.25)),
          ),
          child: Column(
            children: [
              Icon(icon, size: 18, color: color),
              const Gap(4),
              Text(label, style: GoogleFonts.inter(
                fontSize: 9, fontWeight: FontWeight.w600, color: color)),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Earn section ─────────────────────────────────────────────────────────────

class _EarnSection extends StatelessWidget {
  const _EarnSection();

  static const _ways = [
    (icon: '🛒', title: 'Shop & Earn',       sub: '5G per ₹100 spent',     route: '/shop'),
    (icon: '🎰', title: 'Play Gift Casino',  sub: 'Win up to 500G daily',  route: '/play'),
    (icon: '👥', title: 'Refer a Friend',    sub: '200G per referral',     route: '/referrals'),
    (icon: '⭐', title: 'Daily Streak',      sub: '10–100G per day',       route: '/play'),
    (icon: '✍️', title: 'Write a Review',    sub: '25G per approved review', route: null),
    (icon: '🎂', title: 'Birthday Bonus',    sub: '150G on your birthday', route: null),
  ];

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('How to Earn Goins', style: GoogleFonts.inter(
            fontSize: 17, fontWeight: FontWeight.w800, color: c.text0,
          )),
          const Gap(12),
          ...List.generate(_ways.length, (i) {
            final w = _ways[i];
            final row = Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(
                  horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: c.bg1,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  Text(w.icon, style: const TextStyle(fontSize: 22)),
                  const Gap(12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(w.title, style: GoogleFonts.inter(
                          fontSize: 13, fontWeight: FontWeight.w700,
                          color: c.text0,
                        )),
                        Text(w.sub, style: GoogleFonts.inter(
                          fontSize: 11, color: c.text2)),
                      ],
                    ),
                  ),
                  if (w.route != null)
                    Icon(Icons.chevron_right_rounded,
                      color: c.text2, size: 20)
                  else
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: GColors.gold.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(w.sub.split(' ').last + ' G',
                        style: GoogleFonts.inter(
                          fontSize: 10, fontWeight: FontWeight.w700,
                          color: GColors.gold,
                        )),
                    ),
                ],
              ),
            );
            final tappable = w.route != null
                ? GestureDetector(
                    onTap: () {
                      HapticFeedback.selectionClick();
                      context.push(w.route!);
                    },
                    child: row,
                  )
                : row;
            return tappable.animate(delay: (i * 50).ms)
                .fadeIn(duration: 250.ms)
                .slideX(begin: 0.04, end: 0);
          }),
        ],
      ),
    );
  }
}

// ─── Spend section ────────────────────────────────────────────────────────────

class _SpendSection extends StatelessWidget {
  const _SpendSection();

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Spend Your Goins', style: GoogleFonts.inter(
            fontSize: 17, fontWeight: FontWeight.w800, color: c.text0,
          )),
          const Gap(12),
          Row(
            children: [
              _SpendCard(
                emoji: '🏷️',
                title: 'Discount\nCoupons',
                desc: 'Save ₹ on orders',
                color: const Color(0xFF10B981),
              ),
              const Gap(10),
              _SpendCard(
                emoji: '🎁',
                title: 'Free Gift\nWrapping',
                desc: 'Redeem for wrapping',
                color: const Color(0xFFF59E0B),
              ),
              const Gap(10),
              _SpendCard(
                emoji: '🚚',
                title: 'Free\nDelivery',
                desc: 'Cover shipping cost',
                color: const Color(0xFF6366F1),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SpendCard extends StatelessWidget {
  final String emoji;
  final String title;
  final String desc;
  final Color  color;
  const _SpendCard({
    required this.emoji,
    required this.title,
    required this.desc,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.25)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(emoji, style: const TextStyle(fontSize: 26)),
            const Gap(8),
            Text(title, style: GoogleFonts.inter(
              fontSize: 11, fontWeight: FontWeight.w800, color: c.text0,
              height: 1.3,
            )),
            const Gap(4),
            Text(desc, style: GoogleFonts.inter(
              fontSize: 9, color: c.text2, height: 1.3,
            )),
          ],
        ),
      ),
    );
  }
}

// ─── Transaction row ─────────────────────────────────────────────────────────

class _TxRow extends StatelessWidget {
  final Map<String, dynamic> tx;
  const _TxRow({required this.tx});

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final amount = (tx['amount'] as num?)?.toInt() ?? 0;
    final desc   = tx['description'] as String? ?? '';
    final type   = tx['type'] as String? ?? '';
    final credit = amount > 0;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Container(
            width: 42, height: 42,
            decoration: BoxDecoration(
              color: (credit ? GColors.emerald : GColors.rose)
                  .withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(
              child: Text(
                _typeEmoji(type),
                style: const TextStyle(fontSize: 18),
              ),
            ),
          ),
          const Gap(12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_typeLabel(type), style: GoogleFonts.inter(
                  fontSize: 13, fontWeight: FontWeight.w600,
                  color: c.text0,
                )),
                if (desc.isNotEmpty)
                  Text(desc,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(
                      fontSize: 11, color: c.text2)),
              ],
            ),
          ),
          Text(
            '${credit ? '+' : ''}$amount G',
            style: GoogleFonts.inter(
              fontSize: 15, fontWeight: FontWeight.w800,
              color: credit ? GColors.emerald : GColors.rose,
            ),
          ),
        ],
      ),
    );
  }

  String _typeEmoji(String t) => switch (t) {
    'order_bonus'  => '🛒',
    'redemption'   => '🏷️',
    'spin_wheel'   => '🎰',
    'scratch_card' => '🃏',
    'mystery_box'  => '📦',
    'referral'     => '👥',
    'daily_quest'  => '⭐',
    'streak_ladder'=> '🔥',
    _              => '🪙',
  };

  String _typeLabel(String t) => switch (t) {
    'order_bonus'   => 'Order Bonus',
    'redemption'    => 'Spent on Order',
    'spin_wheel'    => 'Spin the Wheel',
    'scratch_card'  => 'Scratch Card',
    'mystery_box'   => 'Mystery Box',
    'goin_wager'    => 'Goin Wager',
    'treasure_hunt' => 'Treasure Hunt',
    'daily_quest'   => 'Daily Quest',
    'streak_ladder' => 'Streak Ladder',
    'referral'      => 'Referral Bonus',
    _ => t
        .replaceAll('_', ' ')
        .split(' ')
        .map((w) => w.isEmpty
            ? ''
            : '${w[0].toUpperCase()}${w.substring(1)}')
        .join(' '),
  };
}

// ─── Shimmer / Error ──────────────────────────────────────────────────────────

class _BalanceShimmer extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      height: 200,
      decoration: BoxDecoration(
        color: GColors.of(context).bg1,
        borderRadius: BorderRadius.circular(16),
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  final VoidCallback onRetry;
  const _ErrorCard({required this.onRetry});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(32),
    child: Column(
      children: [
        const Text('😕', style: TextStyle(fontSize: 40)),
        const Gap(12),
        Text('Could not load balance', style: GoogleFonts.inter(
          color: GColors.of(context).text1, fontWeight: FontWeight.w500)),
        const Gap(10),
        TextButton(
            onPressed: onRetry,
            child: Text('Retry',
                style: GoogleFonts.inter(color: GColors.brand))),
      ],
    ),
  );
}
