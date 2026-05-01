
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:gap/gap.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/theme/theme_mode_notifier.dart';
import '../../../../core/widgets/gs_widgets.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/api/biometric_service.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

final profileProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final dio = ref.watch(dioProvider);
  final res = await dio.get('/auth/b2c/me');
  return Map<String, dynamic>.from(res.data as Map);
});

// Fetches live coin balance including pending coins — matches the web display
// which shows totalBalance (redeemable + pending) not just coinBalance.
final _coinBalanceProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final dio = ref.watch(dioProvider);
  try {
    final res = await dio.get('/coins/balance');
    return Map<String, dynamic>.from(res.data as Map);
  } catch (_) {
    return {};
  }
});

final _bioAvailableProvider = FutureProvider.autoDispose<bool>((ref) async {
  final svc = ref.read(biometricServiceProvider);
  return svc.isAvailable;
});

final _bioLabelProvider = FutureProvider.autoDispose<String>((ref) async {
  final svc = ref.read(biometricServiceProvider);
  return svc.biometricLabel;
});

// ─── Screen ────────────────────────────────────────────────────────────────────

class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(profileProvider);

    return Scaffold(
      backgroundColor: GColors.of(context).bg0,
      body: CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          // ── Animated SliverAppBar ─────────────────────────────────────────
          SliverAppBar(
            expandedHeight: 0,
            floating: true,
            pinned: true,
            backgroundColor: GColors.of(context).bg0,
            surfaceTintColor: Colors.transparent,
            title: Text(
              'Profile',
              style: GoogleFonts.inter(
                fontSize: 22,
                fontWeight: FontWeight.w900,
                color: GColors.of(context).text0,
              ),
            ),
            actions: [
              IconButton(
                icon: Icon(Icons.notifications_outlined, color: GColors.of(context).text1),
                onPressed: () {},
              ),
            ],
          ),

          // ── Body ─────────────────────────────────────────────────────────
          SliverToBoxAdapter(
            child: profileAsync.when(
              loading: () => const _SkeletonLoader(),
              error: (_, __) => const _AccountBody(profile: null),
              data: (p) => _AccountBody(profile: p),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Skeleton loader ─────────────────────────────────────────────────────────

class _SkeletonLoader extends StatelessWidget {
  const _SkeletonLoader();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          Container(
            height: 160,
            decoration: BoxDecoration(
              color: GColors.of(context).bg2,
              borderRadius: BorderRadius.circular(16),
            ),
          )
              .animate(onPlay: (c) => c.repeat())
              .shimmer(duration: 1500.ms, color: GColors.of(context).border),
          const Gap(16),
          Container(
            height: 120,
            decoration: BoxDecoration(
              color: GColors.of(context).bg2,
              borderRadius: BorderRadius.circular(20),
            ),
          )
              .animate(onPlay: (c) => c.repeat())
              .shimmer(duration: 1500.ms, delay: 200.ms, color: GColors.of(context).border),
          const Gap(16),
          Container(
            height: 80,
            decoration: BoxDecoration(
              color: GColors.of(context).bg2,
              borderRadius: BorderRadius.circular(20),
            ),
          )
              .animate(onPlay: (c) => c.repeat())
              .shimmer(duration: 1500.ms, delay: 400.ms, color: GColors.of(context).border),
        ],
      ),
    );
  }
}

// ─── Account body ────────────────────────────────────────────────────────────

class _AccountBody extends ConsumerWidget {
  final Map<String, dynamic>? profile;
  const _AccountBody({required this.profile});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name        = profile?['fullName'] as String? ?? 'Gifteeng User';
    final phone       = profile?['phone']   as String? ?? '';
    final email       = profile?['email']   as String? ?? '';
    // Safe numeric parsing — API may return numbers as strings
    int    _pi(dynamic v) { if (v is num) return v.toInt(); return int.tryParse(v?.toString() ?? '') ?? 0; }
    double _pd(dynamic v) { if (v is num) return v.toDouble(); return double.tryParse(v?.toString() ?? '') ?? 0.0; }
    // Use totalBalance from /coins/balance so web & mobile show the same number
    // (redeemable + pending). Fall back to profile coinBalance if that fetch fails.
    final coinData    = ref.watch(_coinBalanceProvider).valueOrNull;
    final coins       = coinData != null
        ? _pi(coinData['totalBalance'] ?? coinData['balance'] ?? profile?['coinBalance'])
        : _pi(profile?['coinBalance']);
    final streak      = _pi(profile?['streakDays']);
    final level       = _pi(profile?['level']).clamp(1, 999);
    final gamesPlayed = _pi(profile?['gamesPlayed']);
    final totalEarned = profile?['totalCoinsEarned'] != null ? _pi(profile?['totalCoinsEarned']) : coins;

    // XP progress to next level: mock 60% if no field
    final xpProgress  = profile?['xpProgress'] != null ? _pd(profile?['xpProgress']) : 0.6;

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 4, 16, MediaQuery.of(context).padding.bottom + 78),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [

          // ── Profile hero ─────────────────────────────────────────────────
          _ProfileHeroCard(
            name: name,
            phone: phone,
            email: email,
            level: level,
          )
              .animate()
              .fadeIn(duration: 500.ms)
              .slideY(begin: -0.08, end: 0, duration: 500.ms, curve: Curves.easeOut),

          const Gap(16),

          // ── Goins wallet card ─────────────────────────────────────────────
          _GoinsWalletCard(
            coins: coins,
            xpProgress: xpProgress,
            level: level,
          )
              .animate()
              .fadeIn(duration: 500.ms, delay: 100.ms)
              .slideY(begin: 0.06, end: 0, duration: 500.ms, delay: 100.ms, curve: Curves.easeOut),

          const Gap(16),

          // ── Stats row ──────────────────────────────────────────────────────
          _StatsRow(
            streak: streak,
            gamesPlayed: gamesPlayed,
            totalEarned: totalEarned,
            level: level,
          )
              .animate()
              .fadeIn(duration: 500.ms, delay: 180.ms)
              .slideY(begin: 0.06, end: 0, duration: 500.ms, delay: 180.ms, curve: Curves.easeOut),

          const Gap(20),

          // ── Biometric toggle ───────────────────────────────────────────────
          const _BiometricToggleSection(),

          const Gap(20),

          // ── Menu ──────────────────────────────────────────────────────────
          const _MenuSection(),

          const Gap(16),

          // ── Sign out ───────────────────────────────────────────────────────
          const _SignOutButton(),
        ],
      ),
    );
  }
}

// ─── Profile hero card ────────────────────────────────────────────────────────

class _ProfileHeroCard extends ConsumerStatefulWidget {
  final String name, phone, email;
  final int level;
  const _ProfileHeroCard({
    required this.name,
    required this.phone,
    required this.email,
    required this.level,
  });

  @override
  ConsumerState<_ProfileHeroCard> createState() => _ProfileHeroCardState();
}

class _ProfileHeroCardState extends ConsumerState<_ProfileHeroCard> {
  Uint8List? _avatarBytes; // locally-picked photo before upload

  String get _initial => widget.name.isNotEmpty ? widget.name[0].toUpperCase() : 'G';

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: GColors.of(context).bg1,
        boxShadow: const [BoxShadow(
          color: Color(0x14000000), blurRadius: 12, offset: Offset(0, 4))],
      ),
      child: Row(
        children: [
          // ── Avatar ─────────────────────────────────────────────────────
          SizedBox(
            width: 72, height: 72,
            child: Stack(
              alignment: Alignment.center,
              children: [
                // Static ring
                Container(
                  width: 72, height: 72,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: GColors.of(context).border, width: 2),
                  ),
                ),
                // Inner avatar — tap to pick photo
                GestureDetector(
                  onTap: () async {
                    HapticFeedback.selectionClick();
                    final xf = await ImagePicker().pickImage(
                      source: ImageSource.gallery, imageQuality: 80);
                    if (xf == null) return;
                    final bytes = await xf.readAsBytes();
                    if (mounted) setState(() => _avatarBytes = bytes);
                  },
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Container(
                        width: 64, height: 64,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: GColors.of(context).bg2,
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: _avatarBytes != null
                            ? Image.memory(_avatarBytes!, fit: BoxFit.cover)
                            : Center(
                                child: Text(
                                  _initial,
                                  style: GoogleFonts.inter(
                                    fontSize: 26,
                                    fontWeight: FontWeight.w900,
                                    color: GColors.of(context).text0,
                                  ),
                                ),
                              ),
                      ),
                      Positioned(
                        bottom: -2, right: -2,
                        child: Container(
                          width: 22, height: 22,
                          decoration: BoxDecoration(
                            color: GColors.brand,
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: GColors.of(context).bg1, width: 1.5),
                          ),
                          child: const Icon(Icons.camera_alt_rounded,
                              size: 11, color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const Gap(16),

          // ── Name + level + edit ────────────────────────────────────────
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        widget.name,
                        style: GoogleFonts.inter(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: GColors.of(context).text0,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const Gap(8),
                    // Level badge
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: GColors.of(context).bg2,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: GColors.of(context).border),
                      ),
                      child: Text(
                        'LVL ${widget.level}',
                        style: GoogleFonts.inter(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: GColors.of(context).text0,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ],
                ),
                const Gap(4),
                Text(
                  widget.phone.isNotEmpty ? widget.phone : widget.email,
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    color: GColors.of(context).text1,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const Gap(10),
                // Edit profile chip
                GestureDetector(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    _showEditProfileSheet(context);
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                    decoration: BoxDecoration(
                      color: GColors.of(context).bg2,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: GColors.of(context).border),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.edit_outlined, size: 12, color: GColors.of(context).text1),
                        const Gap(5),
                        Text(
                          'Edit Profile',
                          style: GoogleFonts.inter(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: GColors.of(context).text1,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Edit-profile bottom sheet ──────────────────────────────────────────────

  void _showEditProfileSheet(BuildContext context) {
    final nameCtrl  = TextEditingController(text: widget.name);
    final emailCtrl = TextEditingController(text: widget.email);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: GColors.of(context).bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        bool saving = false;
        return StatefulBuilder(
          builder: (ctx, setSheet) {
            final c = GColors.of(ctx);
            return Padding(
              padding: EdgeInsets.only(
                left: 20, right: 20, top: 20,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Handle bar
                    Center(child: Container(
                      width: 42, height: 4,
                      decoration: BoxDecoration(
                        color: c.border,
                        borderRadius: BorderRadius.circular(2)),
                    )),
                    const Gap(16),
                    Text('Edit Profile', style: GoogleFonts.inter(
                      fontSize: 20, fontWeight: FontWeight.w800,
                      color: c.text0)),
                    const Gap(20),

                    // ── Avatar picker ──────────────────────────────────────
                    Center(
                      child: GestureDetector(
                        onTap: () async {
                          final xf = await ImagePicker().pickImage(
                            source: ImageSource.gallery, imageQuality: 80);
                          if (xf == null) return;
                          final bytes = await xf.readAsBytes();
                          if (mounted) setState(() => _avatarBytes = bytes);
                          setSheet(() {});
                        },
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            Container(
                              width: 84, height: 84,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: c.bg2,
                                border: Border.all(color: c.border, width: 2),
                              ),
                              clipBehavior: Clip.antiAlias,
                              child: _avatarBytes != null
                                  ? Image.memory(_avatarBytes!, fit: BoxFit.cover)
                                  : Center(child: Text(_initial,
                                      style: GoogleFonts.inter(
                                        fontSize: 30, fontWeight: FontWeight.w900,
                                        color: c.text0))),
                            ),
                            Positioned(
                              bottom: -2, right: -2,
                              child: Container(
                                width: 28, height: 28,
                                decoration: BoxDecoration(
                                  color: GColors.brand,
                                  shape: BoxShape.circle,
                                  border: Border.all(color: c.bg1, width: 2),
                                ),
                                child: const Icon(Icons.camera_alt_rounded,
                                    size: 14, color: Colors.white),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const Gap(6),
                    Center(child: Text('Tap photo to change',
                      style: GoogleFonts.inter(fontSize: 11, color: c.text2))),
                    const Gap(20),

                    // ── Name field ─────────────────────────────────────────
                    _AccountEditField(label: 'Full Name', ctrl: nameCtrl,
                        type: TextInputType.name),
                    const Gap(12),

                    // ── Email field ────────────────────────────────────────
                    _AccountEditField(label: 'Email', ctrl: emailCtrl,
                        type: TextInputType.emailAddress),
                    const Gap(24),

                    // ── Save button ────────────────────────────────────────
                    SizedBox(
                      width: double.infinity, height: 52,
                      child: ElevatedButton(
                        onPressed: saving ? null : () async {
                          setSheet(() => saving = true);
                          try {
                            final dio = ref.read(dioProvider);
                            final body = <String, dynamic>{};
                            final n = nameCtrl.text.trim();
                            final e = emailCtrl.text.trim();
                            if (n.isNotEmpty) body['fullName'] = n;
                            if (e.isNotEmpty) body['email']    = e;
                            // Upload new photo if picked
                            if (_avatarBytes != null) {
                              try {
                                final form = FormData.fromMap({
                                  'file': MultipartFile.fromBytes(
                                    _avatarBytes!,
                                    filename: 'avatar_'
                                        '${DateTime.now().millisecondsSinceEpoch}.jpg',
                                  ),
                                  'ownerType': 'user',
                                });
                                final res = await dio.post('/files/upload',
                                    data: form);
                                final url =
                                    (res.data as Map?)?['url']?.toString();
                                if (url != null && url.isNotEmpty) {
                                  body['avatar'] = url;
                                }
                              } catch (_) {}
                            }
                            if (body.isNotEmpty) {
                              await dio.patch('/auth/b2c/me', data: body);
                            }
                            ref.invalidate(profileProvider);
                            if (ctx.mounted) Navigator.pop(ctx);
                          } catch (_) {
                            // silently handle — profile refreshes regardless
                          } finally {
                            setSheet(() => saving = false);
                          }
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: GColors.brand,
                          foregroundColor: Colors.white,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14)),
                        ),
                        child: saving
                            ? const SizedBox(width: 22, height: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.5, color: Colors.white))
                            : Text('Save Changes', style: GoogleFonts.inter(
                                fontSize: 15, fontWeight: FontWeight.w800,
                                color: Colors.white)),
                      ),
                    ),
                    const Gap(8),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}

// ─── Goins wallet card ────────────────────────────────────────────────────────

class _GoinsWalletCard extends StatefulWidget {
  final int coins, level;
  final double xpProgress;
  const _GoinsWalletCard({
    required this.coins,
    required this.level,
    required this.xpProgress,
  });

  @override
  State<_GoinsWalletCard> createState() => _GoinsWalletCardState();
}

class _GoinsWalletCardState extends State<_GoinsWalletCard> {

  @override
  Widget build(BuildContext context) {
    final nextMilestone = ((widget.coins ~/ 500) + 1) * 500;
    final progressToNext = (widget.coins % 500) / 500.0;

    return GestureDetector(
      onTap: () {
        HapticFeedback.mediumImpact();
        GoRouter.of(context).go('/goins');
      },
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: GColors.of(context).bg1,
          border: Border(
            top: BorderSide(color: GColors.gold.withValues(alpha: 0.30), width: 2),
            left: BorderSide(color: GColors.of(context).border),
            right: BorderSide(color: GColors.of(context).border),
            bottom: BorderSide(color: GColors.of(context).border),
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0x14000000),
              blurRadius: 12,
              offset: Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                // Coin icon
                Container(
                  width: 44, height: 44,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: GColors.gold.withValues(alpha: 0.12),
                  ),
                  child: const Center(
                    child: Text('🪙', style: TextStyle(fontSize: 22)),
                  ),
                ),
                const Gap(14),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Goins Balance',
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: GColors.gold.withValues(alpha: 0.7),
                        letterSpacing: 0.8,
                      ),
                    ),
                    const Gap(2),
                    Text(
                      _formatCoins(widget.coins),
                      style: GoogleFonts.inter(
                        fontSize: 32,
                        fontWeight: FontWeight.w900,
                        color: GColors.gold,
                        height: 1,
                        letterSpacing: -1,
                      ),
                    ),
                  ],
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: GColors.brand,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Text(
                        'Earn',
                        style: GoogleFonts.inter(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                        ),
                      ),
                      const Gap(4),
                      const Icon(Icons.arrow_forward_rounded, size: 12, color: Colors.white),
                    ],
                  ),
                ),
              ],
            ),

            const Gap(18),

            // ── XP Progress bar ──────────────────────────────────────────
            Row(
              children: [
                Text(
                  'Progress to ${_formatCoins(nextMilestone)} G',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: GColors.of(context).text1,
                  ),
                ),
                const Spacer(),
                Text(
                  '${(progressToNext * 100).toStringAsFixed(0)}%',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: GColors.gold,
                  ),
                ),
              ],
            ),
            const Gap(8),
            Stack(
              children: [
                // Track
                Container(
                  height: 6,
                  decoration: BoxDecoration(
                    color: GColors.gold.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
                // Fill
                FractionallySizedBox(
                  widthFactor: progressToNext.clamp(0.0, 1.0),
                  child: Container(
                    height: 6,
                    decoration: BoxDecoration(
                      color: GColors.gold,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatCoins(int c) {
    if (c >= 1000) return '${(c / 1000).toStringAsFixed(c % 1000 == 0 ? 0 : 1)}K';
    return c.toString();
  }
}

// ─── Stats row ────────────────────────────────────────────────────────────────

class _StatsRow extends StatelessWidget {
  final int streak, gamesPlayed, totalEarned, level;
  const _StatsRow({
    required this.streak,
    required this.gamesPlayed,
    required this.totalEarned,
    required this.level,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _StatChip(
          emoji: '🔥',
          value: '$streak',
          label: 'Day Streak',
          color: GColors.rose,
          onTap: () => GoRouter.of(context).go('/play'),
        ),
        const Gap(10),
        _StatChip(
          emoji: '🎮',
          value: '$gamesPlayed',
          label: 'Games',
          color: GColors.violet,
          onTap: () => GoRouter.of(context).go('/play'),
        ),
        const Gap(10),
        _StatChip(
          emoji: '⭐',
          value: _fmt(totalEarned),
          label: 'Earned',
          color: GColors.gold,
          onTap: () => GoRouter.of(context).go('/goins'),
        ),
        const Gap(10),
        _StatChip(
          emoji: '🏆',
          value: 'Lv.$level',
          label: 'Rank',
          color: GColors.emerald,
          onTap: () => GoRouter.of(context).go('/goins'),
        ),
      ],
    );
  }

  String _fmt(int n) {
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
    return n.toString();
  }
}

class _StatChip extends StatelessWidget {
  final String emoji, value, label;
  final Color color;
  final VoidCallback? onTap;
  const _StatChip({
    required this.emoji,
    required this.value,
    required this.label,
    required this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(16);
    return Expanded(
      child: Material(
        color: Colors.transparent,
        borderRadius: radius,
        child: InkWell(
          onTap: onTap,
          borderRadius: radius,
          splashColor: color.withValues(alpha: 0.10),
          highlightColor: color.withValues(alpha: 0.06),
          child: Ink(
            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
            decoration: BoxDecoration(
              color: GColors.of(context).bg1,
              borderRadius: radius,
              border: Border.all(color: color.withValues(alpha: 0.18)),
            ),
            child: Column(
              children: [
                Text(emoji, style: const TextStyle(fontSize: 18)),
                const Gap(4),
                Text(
                  value,
                  style: GoogleFonts.inter(
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                    color: color,
                    height: 1,
                  ),
                ),
                const Gap(2),
                Text(
                  label,
                  style: GoogleFonts.inter(
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                    color: GColors.of(context).text2,
                    letterSpacing: 0.3,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Biometric toggle section ─────────────────────────────────────────────────

class _BiometricToggleSection extends ConsumerWidget {
  const _BiometricToggleSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bioAvailAsync = ref.watch(_bioAvailableProvider);
    final bioLabelAsync = ref.watch(_bioLabelProvider);
    final bioEnabled    = ref.watch(biometricPrefNotifierProvider).valueOrNull ?? false;

    return bioAvailAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (available) {
        if (!available) return const SizedBox.shrink();
        final label = bioLabelAsync.valueOrNull ?? 'Biometrics';
        final isFace = label.toLowerCase().contains('face');

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SectionLabel('Security'),
            const Gap(10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              decoration: BoxDecoration(
                color: GColors.of(context).bg1,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                  color: bioEnabled
                      ? GColors.emerald.withValues(alpha: 0.3)
                      : GColors.of(context).border,
                ),
              ),
              child: Row(
                children: [
                  // Icon badge
                  Container(
                    width: 44, height: 44,
                    decoration: BoxDecoration(
                      color: (bioEnabled ? GColors.emerald : GColors.of(context).text2)
                          .withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      isFace
                          ? Icons.face_unlock_outlined
                          : Icons.fingerprint_rounded,
                      color: bioEnabled ? GColors.emerald : GColors.of(context).text2,
                      size: 24,
                    ),
                  ),
                  const Gap(14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '$label Sign-In',
                          style: GoogleFonts.inter(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: GColors.of(context).text0,
                          ),
                        ),
                        const Gap(2),
                        Text(
                          bioEnabled
                              ? 'Enabled — tap to disable'
                              : 'Unlock app with $label',
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            color: GColors.of(context).text2,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Gap(12),
                  // Custom animated switch
                  GestureDetector(
                    onTap: () async {
                      HapticFeedback.mediumImpact();
                      await ref
                          .read(biometricPrefNotifierProvider.notifier)
                          .setEnabled(!bioEnabled);
                    },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 280),
                      curve: Curves.easeInOut,
                      width: 52, height: 30,
                      padding: const EdgeInsets.all(3),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(999),
                        color: bioEnabled ? GColors.emerald : GColors.of(context).bg2,
                        border: Border.all(
                          color: bioEnabled
                              ? Colors.transparent
                              : GColors.of(context).border,
                        ),
                      ),
                      child: AnimatedAlign(
                        duration: const Duration(milliseconds: 280),
                        curve: Curves.easeInOut,
                        alignment: bioEnabled
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: Container(
                          width: 24, height: 24,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: bioEnabled ? Colors.black : GColors.of(context).text2,
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.2),
                                blurRadius: 4,
                              ),
                            ],
                          ),
                          child: bioEnabled
                              ? const Icon(Icons.check_rounded,
                                  size: 14, color: GColors.emerald)
                              : null,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

// ─── Menu section ─────────────────────────────────────────────────────────────

class _MenuSection extends ConsumerWidget {
  const _MenuSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = _items(context, ref);
    final themeMode = ref.watch(themeModeNotifierProvider);

    String themeModeLabel(ThemeMode m) {
      switch (m) {
        case ThemeMode.light:  return 'Light mode';
        case ThemeMode.dark:   return 'Dark mode';
        case ThemeMode.system: return 'System default';
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionLabel('Account'),
        const Gap(10),
        GsListGroup(
          children: items.asMap().entries.map((e) {
            final i    = e.key;
            final item = e.value;
            // Appearance row: show inline theme chips so user can toggle
            // Light / Dark / System without navigating away.
            if (item.label == 'Appearance') {
              return GsListTile(
                icon:        item.icon,
                title:       item.label,
                subtitle:    themeModeLabel(themeMode),
                onTap:       item.onTap,
                trailing:    const _ThemeChips(),
                showChevron: false,
                animIndex:   i,
              );
            }
            return GsListTile(
              icon:      item.icon,
              title:     item.label,
              subtitle:  item.subtitle,
              onTap:     item.onTap,
              animIndex: i,
            );
          }).toList(),
        ),
      ],
    );
  }

  List<_MenuItemData> _items(BuildContext context, WidgetRef ref) => [
        _MenuItemData(
          icon: Icons.shopping_bag_rounded,
          label: 'My Orders',
          subtitle: 'Track & manage orders',
          color: GColors.brand,
          onTap: () => GoRouter.of(context).push('/orders'),
        ),
        _MenuItemData(
          icon: Icons.toll_rounded,
          label: 'Goins & Rewards',
          subtitle: 'History, rules & more',
          color: GColors.emerald,
          onTap: () => GoRouter.of(context).go('/goins'),
        ),
        _MenuItemData(
          icon: Icons.favorite_border_rounded,
          label: 'Wishlist',
          subtitle: 'Saved gift ideas',
          color: GColors.pink,
          onTap: () => GoRouter.of(context).push('/wishlist'),
        ),
        _MenuItemData(
          icon: Icons.location_on_outlined,
          label: 'Saved Addresses',
          subtitle: 'Manage delivery locations',
          color: GColors.sky,
          onTap: () => GoRouter.of(context).push('/addresses'),
        ),
        _MenuItemData(
          icon: Icons.card_giftcard_rounded,
          label: 'Referrals',
          subtitle: 'Invite friends, earn Goins',
          color: GColors.gold,
          onTap: () => GoRouter.of(context).push('/referrals'),
        ),
        _MenuItemData(
          icon: Icons.brightness_4_rounded,
          label: 'Appearance',
          subtitle: 'Light, Dark or System theme',
          color: GColors.violet,
          onTap: () => GoRouter.of(context).push('/settings/theme'),
        ),
        _MenuItemData(
          icon: Icons.translate_rounded,
          label: 'Language',
          subtitle: 'English, हिंदी, मराठी',
          color: GColors.sky,
          onTap: () => GoRouter.of(context).push('/settings/language'),
        ),
        _MenuItemData(
          icon: Icons.headset_mic_outlined,
          label: 'Help & Support',
          subtitle: 'FAQs & contact us',
          color: const Color(0xFF6B7280),
          onTap: () => GoRouter.of(context).push('/help'),
        ),
      ];
}

class _MenuItemData {
  final IconData icon;
  final String label, subtitle;
  final Color color;
  final VoidCallback onTap;
  const _MenuItemData({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });
}

class _MenuTile extends StatefulWidget {
  final _MenuItemData item;
  final int index;
  const _MenuTile({required this.item, required this.index});

  @override
  State<_MenuTile> createState() => _MenuTileState();
}

class _MenuTileState extends State<_MenuTile> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) {
        setState(() => _pressed = false);
        HapticFeedback.selectionClick();
        widget.item.onTap();
      },
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 120),
        color: _pressed ? GColors.of(context).bg2 : Colors.transparent,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            // Icon badge
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: widget.item.color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(widget.item.icon, color: widget.item.color, size: 20),
            ),
            const Gap(14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.item.label,
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: GColors.of(context).text0,
                    ),
                  ),
                  const Gap(1),
                  Text(
                    widget.item.subtitle,
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      color: GColors.of(context).text2,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              Icons.chevron_right_rounded,
              color: GColors.of(context).text2,
              size: 18,
            ),
          ],
        ),
      ),
    )
        .animate(delay: (widget.index * 40).ms)
        .fadeIn(duration: 300.ms)
        .slideX(begin: 0.04, end: 0, duration: 300.ms);
  }
}

// ─── Inline theme-mode chips (Light / Dark / System) ─────────────────────────
//
// Shown as a trailing widget inside the Appearance GsListTile so the user
// can switch themes without leaving the account screen.

class _ThemeChips extends ConsumerWidget {
  const _ThemeChips();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current  = ref.watch(themeModeNotifierProvider);
    final notifier = ref.read(themeModeNotifierProvider.notifier);

    const chips = [
      (ThemeMode.light,  Icons.light_mode_rounded),
      (ThemeMode.dark,   Icons.dark_mode_rounded),
      (ThemeMode.system, Icons.brightness_auto_rounded),
    ];

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: chips.map((c) {
        final (mode, icon) = c;
        final sel = current == mode;
        return Padding(
          padding: const EdgeInsets.only(left: 6),
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () {
              HapticFeedback.selectionClick();
              notifier.setMode(mode);
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              width: 30, height: 30,
              decoration: BoxDecoration(
                color: sel
                    ? GColors.brand.withValues(alpha: 0.15)
                    : GColors.of(context).bg2,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: sel ? GColors.brand : GColors.of(context).border,
                  width: sel ? 1.5 : 1,
                ),
              ),
              child: Icon(
                icon,
                size: 14,
                color: sel ? GColors.brand : GColors.of(context).text2,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ─── Sign out button ──────────────────────────────────────────────────────────

class _SignOutButton extends ConsumerWidget {
  const _SignOutButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      onTap: () async {
        HapticFeedback.mediumImpact();
        final confirm = await showDialog<bool>(
          context: context,
          builder: (_) => AlertDialog(
            backgroundColor: GColors.of(context).bg1,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: Text(
              'Sign Out?',
              style: GoogleFonts.inter(
                fontWeight: FontWeight.w800,
                color: GColors.of(context).text0,
              ),
            ),
            content: Text(
              'You\'ll need to sign in again to access your account.',
              style: GoogleFonts.inter(color: GColors.of(context).text1, fontSize: 14),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: Text(
                  'Cancel',
                  style: GoogleFonts.inter(
                    color: GColors.of(context).text1,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              TextButton(
                onPressed: () => Navigator.pop(context, true),
                child: Text(
                  'Sign Out',
                  style: GoogleFonts.inter(
                    color: GColors.rose,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        );
        if (confirm == true && context.mounted) {
          // clearToken() sets auth state → null which fires the router's
          // refreshListenable → redirect to /auth automatically.
          // Do NOT call go('/auth') here — it causes a double-navigation
          // race that leaves a black screen.
          await ref.read(authTokenNotifierProvider.notifier).clearToken();
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 15),
        decoration: BoxDecoration(
          color: GColors.rose.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: GColors.rose.withValues(alpha: 0.2)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.logout_rounded, color: GColors.rose, size: 18),
            const Gap(10),
            Text(
              'Sign Out',
              style: GoogleFonts.inter(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: GColors.rose,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Section label ────────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: GoogleFonts.inter(
        fontSize: 11,
        fontWeight: FontWeight.w800,
        color: GColors.of(context).text2,
        letterSpacing: 1.2,
      ),
    );
  }
}

// ─── Edit-profile text field ──────────────────────────────────────────────────

class _AccountEditField extends StatelessWidget {
  final String label;
  final TextEditingController ctrl;
  final TextInputType type;
  const _AccountEditField({
    required this.label,
    required this.ctrl,
    this.type = TextInputType.text,
  });

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: GoogleFonts.inter(
          fontSize: 12, fontWeight: FontWeight.w700, color: c.text1)),
        const Gap(6),
        TextField(
          controller: ctrl,
          keyboardType: type,
          style: GoogleFonts.inter(fontSize: 14, color: c.text0),
          decoration: InputDecoration(
            hintText: label,
            hintStyle: GoogleFonts.inter(fontSize: 14, color: c.text2),
            filled: true,
            fillColor: c.bg2,
            contentPadding: const EdgeInsets.symmetric(
                horizontal: 14, vertical: 14),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: c.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: c.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: GColors.brand, width: 1.5),
            ),
          ),
        ),
      ],
    );
  }
}
