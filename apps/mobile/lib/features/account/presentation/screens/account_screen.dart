
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
// Delivery-zone settings entry — lets users switch Mumbai vs Pan-India after
// their first launch by re-surfacing the picker popup.
import '../../../../core/services/location_service.dart';
import '../../../../core/widgets/delivery_zone_popup.dart';
// Pushed directly via the root Navigator as the workaround for the
// GoRouter shell-to-root transition bug — see _SignOutButton._confirm().
import '../../../auth/presentation/screens/auth_screen.dart';

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
    final isLoggedIn =
        ref.watch(authTokenNotifierProvider).valueOrNull != null;

    // Guest users (browsing without an account) get a sign-in prompt
    // instead of the profile. Tapping the CTA takes them to /auth.
    if (!isLoggedIn) return const _GuestAccountPrompt();

    final profileAsync = ref.watch(profileProvider);
    return Scaffold(
      backgroundColor: GColors.of(context).bg0,
      body: profileAsync.when(
        loading: () => const _SkeletonLoader(),
        error: (_, __) => const _AccountBody(profile: null),
        data: (p) => _AccountBody(profile: p),
      ),
    );
  }
}

// ─── Guest account prompt ─────────────────────────────────────────────────────
// Shown on the Account tab when the user is browsing without signing in.
// Encourages sign-in for the personalized features (orders, wallet, etc.)
// without blocking browsing of the rest of the app.

class _GuestAccountPrompt extends ConsumerStatefulWidget {
  const _GuestAccountPrompt();

  @override
  ConsumerState<_GuestAccountPrompt> createState() => _GuestAccountPromptState();
}

class _GuestAccountPromptState extends ConsumerState<_GuestAccountPrompt> {
  bool _pressed = false;

  Future<void> _signIn() async {
    HapticFeedback.selectionClick();
    // Clear guest mode so the auth screen's redirect rule doesn't bounce
    // back to /. After successful sign-in, saveToken sets it back to false
    // anyway — clearing here is what makes /auth show.
    await ref.read(guestModeNotifierProvider.notifier).setEnabled(false);
    if (mounted) GoRouter.of(context).go('/auth');
  }

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final topPad = MediaQuery.of(context).padding.top;
    return Scaffold(
      backgroundColor: c.bg0,
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.fromLTRB(24, topPad + 8, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              // Hero illustration — emoji on a tinted brand circle.
              Center(
                child: Container(
                  width: 96, height: 96,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: GColors.brand.withValues(alpha: 0.10),
                  ),
                  alignment: Alignment.center,
                  child: const Text('👋', style: TextStyle(fontSize: 44)),
                ),
              ),
              const Gap(24),
              Text(
                'Sign in for the full experience',
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                  fontSize: 22, fontWeight: FontWeight.w900,
                  color: c.text0, letterSpacing: -0.4, height: 1.2,
                ),
              ),
              const Gap(10),
              Text(
                'Track orders, earn Goins, save wishlist & addresses, '
                'and play Gift Casino for daily rewards.',
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                  fontSize: 14, color: c.text1, height: 1.5,
                ),
              ),
              const Gap(28),
              // Brand CTA — taps go to /auth.
              GestureDetector(
                onTapDown:   (_) => setState(() => _pressed = true),
                onTapUp:     (_) {
                  setState(() => _pressed = false);
                  _signIn();
                },
                onTapCancel: () => setState(() => _pressed = false),
                child: AnimatedScale(
                  scale: _pressed ? 0.97 : 1.0,
                  duration: const Duration(milliseconds: 120),
                  curve: Curves.easeOut,
                  child: Container(
                    height: 56,
                    decoration: BoxDecoration(
                      color: GColors.brand,
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: [
                        BoxShadow(
                          color: GColors.brand.withValues(alpha: 0.30),
                          blurRadius: 18, spreadRadius: -2,
                          offset: const Offset(0, 6),
                        ),
                      ],
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      'Sign in or create account',
                      style: GoogleFonts.inter(
                        fontSize: 15, fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ),
              const Gap(14),
              // Secondary trust strip.
              Center(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.lock_outline_rounded, size: 12, color: c.text2),
                    const Gap(5),
                    Text(
                      'Encrypted · Never shared',
                      style: GoogleFonts.inter(
                        fontSize: 11, color: c.text2, letterSpacing: 0.3,
                      ),
                    ),
                  ],
                ),
              ),
              const Spacer(flex: 2),
            ],
          ),
        ),
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
    final name  = profile?['fullName'] as String? ?? 'Gifteeng User';
    final email = profile?['email']    as String? ?? '';
    // Safe numeric parsing — API may return numbers as strings.
    int _pi(dynamic v) {
      if (v is num) return v.toInt();
      return int.tryParse(v?.toString() ?? '') ?? 0;
    }
    final coinData = ref.watch(_coinBalanceProvider).valueOrNull;
    final coins = coinData != null
        ? _pi(coinData['totalBalance'] ?? coinData['balance'] ?? profile?['coinBalance'])
        : _pi(profile?['coinBalance']);

    // Loyalty tier label — Gold ≥1000 Goins, Silver ≥250, Bronze otherwise.
    // Matches the existing leaderboard logic; pure UI rule, no API field yet.
    final tierLabel = coins >= 1000
        ? 'Gold Member'
        : coins >= 250
            ? 'Silver Member'
            : 'Bronze Member';

    return CustomScrollView(
      physics: const BouncingScrollPhysics(),
      slivers: [
        // ── Brand-color hero band ───────────────────────────────────────
        SliverToBoxAdapter(
          child: _AccountHeroBand(
            name: name,
            email: email,
            tierLabel: tierLabel,
            coins: coins,
          ),
        ),

        // ── White rounded body sitting on top of the hero ───────────────
        // Less overlap (16 instead of 28) so the curve is visible and the
        // hero pills aren't hidden. More top padding (34 instead of 22) so
        // "My Account" sits comfortably below the curve, not on top of it.
        SliverToBoxAdapter(
          child: Transform.translate(
            offset: const Offset(0, -16),
            child: Container(
              decoration: BoxDecoration(
                color: GColors.of(context).bg0,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
              ),
              padding: EdgeInsets.fromLTRB(
                16, 28, 16, MediaQuery.of(context).padding.bottom + 78,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // "My Account" + 4 quick-action icons row.
                  const _MyAccountQuickRow()
                      .animate()
                      .fadeIn(duration: 400.ms)
                      .slideY(begin: 0.04, end: 0, duration: 400.ms, curve: Curves.easeOut),

                  const Gap(26),

                  // Section-grouped menu (Account + Support). The previous
                  // single "More" list duplicated 4 of the 4 quick-action
                  // tiles above; removed those and split the rest into clear
                  // labelled groups so the list reads as intentional, not
                  // an undifferentiated wall of rows.
                  const _MenuSection(),

                  const Gap(20),

                  // Biometric toggle — its own "Security" group.
                  const _BiometricToggleSection(),

                  const Gap(20),

                  // ── Sign out (unchanged content)
                  const _SignOutButton(),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

// ─── Hero band ──────────────────────────────────────────────────────────────
//
// Brand-color hero (replaces the maroon block). Diagonal gradient from a
// lighter coral (#FF6B7E) to the brand red (#EF3752) gives the band depth
// without going dark. A soft ambient blob in the corner adds dimensionality
// without using a heavy texture — pure color volume.
//
// Layout fixes vs the previous maroon version:
//   • Bottom padding cut from 50 → 26 — there was a dead 24-px gap below
//     the pills that pushed "My Account" into the curve overlap zone.
//   • Avatar is 56 (was 64) — leaves more room for the name without
//     wrapping on Fold 7 narrow outer screen.
//   • Edit chip aligned right with `mainAxisAlignment.spaceBetween` so the
//     entire top row composes as a single unit (status bar pad → avatar
//     row + edit chip → pills) instead of stacking with an Align that
//     creates an empty floating row.
//   • Status bar padding kept tight (topPad + 10) so the band starts
//     immediately under the system bar — no extra white-space gap.
//
class _AccountHeroBand extends StatelessWidget {
  final String name;
  final String email;
  final String tierLabel;
  final int coins;

  const _AccountHeroBand({
    required this.name,
    required this.email,
    required this.tierLabel,
    required this.coins,
  });

  @override
  Widget build(BuildContext context) {
    final topPad = MediaQuery.of(context).padding.top;
    final initial = name.isNotEmpty ? name[0].toUpperCase() : 'G';

    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(20, topPad + 12, 16, 26),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end:   Alignment.bottomRight,
          colors: [
            Color(0xFFFF6B7E),  // coral — top-left highlight
            GColors.brand,      // brand — bottom-right (#EF3752)
          ],
        ),
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(24)),
        boxShadow: [
          BoxShadow(
            color: GColors.brand.withValues(alpha: 0.22),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Stack(
        children: [
          // ── Soft ambient blob (decorative) ──────────────────────────────
          // Lifts the otherwise-flat gradient with a faint white bloom
          // tucked behind the top-right Edit chip. 80px radius, 4% alpha —
          // strong enough to read as depth, subtle enough to never compete
          // with the foreground text.
          Positioned(
            right: -40, top: -40,
            child: IgnorePointer(
              child: Container(
                width: 160, height: 160,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      Colors.white.withValues(alpha: 0.12),
                      Colors.white.withValues(alpha: 0.0),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // ── Content ─────────────────────────────────────────────────────
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Top row: Avatar + name + Edit chip — composed in one Row so
              // there's no floating "Align" creating a dead band above.
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  // Avatar
                  Container(
                    width: 56, height: 56,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.18),
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.45),
                        width: 2,
                      ),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      initial,
                      style: GoogleFonts.inter(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  const Gap(14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(
                            fontSize: 19,
                            fontWeight: FontWeight.w900,
                            color: Colors.white,
                            letterSpacing: -0.4,
                            height: 1.1,
                          ),
                        ),
                        if (email.isNotEmpty) ...[
                          const Gap(2),
                          Text(
                            email,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.inter(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: Colors.white.withValues(alpha: 0.82),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const Gap(8),
                  _EditProfileChip(name: name, email: email),
                ],
              ),

              const Gap(16),

              // Tier + Coins pills — filled gold glyphs, brand-tinted bg.
              Row(
                children: [
                  _HeroPill(
                    icon: Icons.workspace_premium_rounded,
                    label: tierLabel,
                    accent: const Color(0xFFFFC93C),
                  ),
                  const Gap(10),
                  _HeroPill(
                    icon: Icons.toll_rounded,
                    label: '$coins Coins',
                    accent: const Color(0xFFFFC93C),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Edit-profile chip ───────────────────────────────────────────────────────
// Tap → opens a minimal edit-profile sheet (name + email). Was previously a
// Settings icon pointing to a non-existent /account/settings route.

class _EditProfileChip extends ConsumerStatefulWidget {
  final String name;
  final String email;
  const _EditProfileChip({required this.name, required this.email});

  @override
  ConsumerState<_EditProfileChip> createState() => _EditProfileChipState();
}

class _EditProfileChipState extends ConsumerState<_EditProfileChip> {
  bool _pressed = false;

  void _openSheet() {
    HapticFeedback.selectionClick();
    final nameCtrl  = TextEditingController(text: widget.name);
    final emailCtrl = TextEditingController(text: widget.email);

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: GColors.of(context).bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        bool saving = false;
        return StatefulBuilder(builder: (ctx, setSheet) {
          final c = GColors.of(ctx);
          return Padding(
            padding: EdgeInsets.only(
              left: 20, right: 20, top: 16,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(child: Container(
                  width: 40, height: 4,
                  decoration: BoxDecoration(
                    color: c.border, borderRadius: BorderRadius.circular(2)),
                )),
                const Gap(16),
                Text('Edit Profile', style: GoogleFonts.inter(
                  fontSize: 20, fontWeight: FontWeight.w800, color: c.text0)),
                const Gap(18),
                _AccountEditField(label: 'Full Name', ctrl: nameCtrl,
                    type: TextInputType.name),
                const Gap(12),
                _AccountEditField(label: 'Email', ctrl: emailCtrl,
                    type: TextInputType.emailAddress),
                const Gap(20),
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
                        if (body.isNotEmpty) {
                          await dio.patch('/auth/b2c/me', data: body);
                        }
                        ref.invalidate(profileProvider);
                        if (ctx.mounted) Navigator.pop(ctx);
                      } catch (_) {
                        // soft-fail — profile reload will reflect any update
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
                        : Text('Save', style: GoogleFonts.inter(
                            fontSize: 15, fontWeight: FontWeight.w800,
                            color: Colors.white)),
                  ),
                ),
                const Gap(6),
              ],
            ),
          );
        });
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown:   (_) => setState(() => _pressed = true),
      onTapUp:     (_) { setState(() => _pressed = false); _openSheet(); },
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.96 : 1.0,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.edit_outlined, color: Colors.white, size: 13),
              const Gap(5),
              Text(
                'Edit',
                style: GoogleFonts.inter(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                  letterSpacing: 0.3,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroPill extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color accent;
  const _HeroPill({required this.icon, required this.label, required this.accent});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: accent),
          const Gap(6),
          Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── "My Account" 4-icon quick-actions row ──────────────────────────────────
class _MyAccountQuickRow extends StatelessWidget {
  const _MyAccountQuickRow();

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'My Account',
          style: GoogleFonts.inter(
            fontSize: 16,
            fontWeight: FontWeight.w900,
            color: c.text0,
            letterSpacing: -0.3,
          ),
        ),
        const Gap(14),
        Row(
          children: [
            Expanded(
              child: _QuickAction(
                icon: Icons.shopping_bag_outlined,
                label: 'My Orders',
                onTap: () => GoRouter.of(context).push('/orders'),
              ),
            ),
            Expanded(
              child: _QuickAction(
                icon: Icons.favorite_border_rounded,
                label: 'Wishlist',
                onTap: () => GoRouter.of(context).push('/wishlist'),
              ),
            ),
            Expanded(
              child: _QuickAction(
                icon: Icons.location_on_outlined,
                label: 'Addresses',
                // Was '/account/addresses' which doesn't exist in the router →
                // dead tap. Correct route per app_router.dart is '/addresses'.
                onTap: () => GoRouter.of(context).push('/addresses'),
              ),
            ),
            Expanded(
              child: _QuickAction(
                icon: Icons.account_balance_wallet_outlined,
                label: 'Wallet',
                onTap: () => GoRouter.of(context).push('/goins'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _QuickAction extends StatefulWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _QuickAction({required this.icon, required this.label, required this.onTap});

  @override
  State<_QuickAction> createState() => _QuickActionState();
}

class _QuickActionState extends State<_QuickAction> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return GestureDetector(
      onTapDown:   (_) => setState(() => _pressed = true),
      onTapUp:     (_) {
        setState(() => _pressed = false);
        HapticFeedback.selectionClick();
        widget.onTap();
      },
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.94 : 1.0,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: GColors.brand.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(widget.icon, color: GColors.brand, size: 22),
              ),
              const Gap(6),
              Text(
                widget.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.inter(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: c.text0,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MoreSectionHeader extends StatelessWidget {
  const _MoreSectionHeader();

  @override
  Widget build(BuildContext context) {
    return Text(
      'More',
      style: GoogleFonts.inter(
        fontSize: 16,
        fontWeight: FontWeight.w900,
        color: GColors.of(context).text0,
        letterSpacing: -0.3,
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
        GoRouter.of(context).push('/goins');
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
          onTap: () => GoRouter.of(context).push('/goins'),
        ),
        const Gap(10),
        _StatChip(
          emoji: '🏆',
          value: 'Lv.$level',
          label: 'Rank',
          color: GColors.emerald,
          onTap: () => GoRouter.of(context).push('/goins'),
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
                  // Custom animated switch. Tapping to ENABLE prompts a
                  // biometric scan first — if it fails or the user cancels,
                  // we don't flip the preference, so the user can't lock
                  // themselves out. Disabling is allowed without a scan.
                  GestureDetector(
                    onTap: () async {
                      HapticFeedback.mediumImpact();
                      final notifier = ref.read(
                        biometricPrefNotifierProvider.notifier,
                      );
                      if (!bioEnabled) {
                        // Enabling — challenge first.
                        final svc = ref.read(biometricServiceProvider);
                        final ok = await svc.authenticate(
                          reason: 'Verify your $label to enable sign-in',
                        );
                        if (!ok) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  'Biometric verification failed. '
                                  'Sign-in stays off.',
                                  style: GoogleFonts.inter(
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                behavior: SnackBarBehavior.floating,
                                duration: const Duration(seconds: 2),
                              ),
                            );
                          }
                          return;
                        }
                      }
                      await notifier.setEnabled(!bioEnabled);
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                              !bioEnabled
                                  ? '$label sign-in enabled ✓'
                                  : '$label sign-in disabled',
                              style: GoogleFonts.inter(
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            behavior: SnackBarBehavior.floating,
                            duration: const Duration(seconds: 2),
                          ),
                        );
                      }
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
    final themeMode = ref.watch(themeModeNotifierProvider);

    String themeModeLabel(ThemeMode m) {
      switch (m) {
        case ThemeMode.light:  return 'Light mode';
        case ThemeMode.dark:   return 'Dark mode';
        case ThemeMode.system: return 'System default';
      }
    }

    // ── Section groups ───────────────────────────────────────────────────────
    // The previous list duplicated 4 of the 4 quick-action tiles (My Orders /
    // Goins & Rewards / Wishlist / Saved Addresses) which made this whole list
    // feel redundant and twice as long as it needs to be. Now grouped into:
    //   • Account  — preferences (delivery zone, referrals, appearance, language)
    //   • Support  — outward-facing help (help, privacy)
    // Biometric ("Security") lives in its own section component below — kept
    // separate because it has a custom toggle widget, not a chevron row.

    Widget tile(_MenuItemData item, int i, {Widget? trailing, bool chevron = true}) {
      return GsListTile(
        icon:        item.icon,
        title:       item.label,
        subtitle:    item.subtitle,
        onTap:       item.onTap,
        trailing:    trailing,
        showChevron: chevron,
        animIndex:   i,
      );
    }

    final accountItems = <_MenuItemData>[
      _MenuItemData(
        icon: Icons.bolt_outlined,
        label: 'Delivery zone',
        subtitle: 'Switch between Mumbai & Pan-India',
        color: GColors.gold,
        onTap: () async {
          await ref.read(userDeliveryProvider.notifier).clearManualChoice();
          if (context.mounted) {
            await DeliveryZonePopup.show(context);
            final saved = await UserDeliveryNotifier.getSavedChoice();
            if (saved != null && (saved == 'mumbai' || saved == 'other')) {
              await ref.read(userDeliveryProvider.notifier).setManualChoice(saved);
            }
          }
        },
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
        subtitle: themeModeLabel(themeMode),
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
    ];

    final supportItems = <_MenuItemData>[
      _MenuItemData(
        icon: Icons.headset_mic_outlined,
        label: 'Help & Support',
        subtitle: 'FAQs & contact us',
        color: const Color(0xFF6B7280),
        onTap: () => GoRouter.of(context).push('/help'),
      ),
      _MenuItemData(
        icon: Icons.shield_outlined,
        label: 'Privacy & Data',
        subtitle: 'Consents, export, delete account',
        color: GColors.emerald,
        onTap: () => GoRouter.of(context).push('/privacy'),
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionLabel('Account'),
        const Gap(10),
        GsListGroup(
          children: accountItems.asMap().entries.map((e) {
            final i    = e.key;
            final item = e.value;
            // Inline theme chips on the Appearance row so user can switch
            // Light / Dark / System without leaving the page.
            if (item.label == 'Appearance') {
              return tile(item, i, trailing: const _ThemeChips(), chevron: false);
            }
            return tile(item, i);
          }).toList(),
        ),
        const Gap(20),
        const _SectionLabel('Support'),
        const Gap(10),
        GsListGroup(
          children: supportItems.asMap().entries.map((e) {
            return tile(e.value, e.key);
          }).toList(),
        ),
      ],
    );
  }
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
//
// Previously this awaited `clearToken()` then trusted the router's redirect
// listener to navigate. Two bugs reported:
//   1. Black-page flash after confirming sign-out.
//   2. After "signing out" + closing/reopening the app, user was still logged
//      in.
//
// Root cause for (1): clearToken used to await storage.delete BEFORE flipping
// Riverpod state. The redirect fired mid-delete and the route disposed before
// the storage call settled — visible as a black frame between disposals.
//
// Root cause for (2): if the route teardown raced the storage.delete, on some
// Android devices the delete never actually committed to the keystore.
//
// Fix: clearToken now flips state synchronously first (router redirects
// instantly, no flash), then awaits delete with a verify-and-retry fallback
// in api_client.dart. Here we ALSO add an explicit `context.go('/auth')` as
// belt-and-suspenders in case the redirect listener misses an edge case.

class _SignOutButton extends ConsumerStatefulWidget {
  const _SignOutButton();

  @override
  ConsumerState<_SignOutButton> createState() => _SignOutButtonState();
}

class _SignOutButtonState extends ConsumerState<_SignOutButton> {
  bool _signingOut = false;

  Future<void> _confirm() async {
    if (_signingOut) return;
    HapticFeedback.mediumImpact();

    // ── Sign-out (OverlayEntry confirm — no Navigator routes) ────────────
    //
    // CONFIRMED BUG: `showDialog` (and any modal that uses Navigator.push,
    // including bottom sheets) freezes Flutter rendering on Samsung One UI
    // / Fold 7. The dialog dismissal triggers the
    // `transition-leash alpha 0.000 -> 0.000` SurfaceFlinger glitch which
    // reparents the activity off-screen. UI thread stops painting.
    //
    // Workaround: render the confirmation as an OverlayEntry on the root
    // overlay. OverlayEntry is NOT a Navigator route — it's just a widget
    // inserted above the current Navigator. No push, no pop, no route
    // transition, no Samsung freeze.

    final c = GColors.of(context);
    final overlay = Overlay.of(context, rootOverlay: true);

    bool? userChoice;
    late OverlayEntry confirmEntry;
    confirmEntry = OverlayEntry(
      builder: (_) => Material(
        type: MaterialType.transparency,
        child: Stack(
          children: [
            // Scrim — tap outside the card to cancel.
            Positioned.fill(
              child: GestureDetector(
                onTap: () {
                  userChoice = false;
                  confirmEntry.remove();
                },
                child: ColoredBox(color: Colors.black.withValues(alpha: 0.55)),
              ),
            ),
            // Confirm card — centered.
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Container(
                  decoration: BoxDecoration(
                    color: c.bg1,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  padding: const EdgeInsets.fromLTRB(24, 24, 24, 16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Sign Out?',
                        style: GoogleFonts.inter(
                          fontSize: 18, fontWeight: FontWeight.w800,
                          color: c.text0,
                        ),
                      ),
                      const Gap(8),
                      Text(
                        "You'll need to sign in again to access your account.",
                        style: GoogleFonts.inter(
                          fontSize: 14, color: c.text1, height: 1.45,
                        ),
                      ),
                      const Gap(20),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          TextButton(
                            onPressed: () {
                              userChoice = false;
                              confirmEntry.remove();
                            },
                            child: Text(
                              'Cancel',
                              style: GoogleFonts.inter(
                                color: c.text1, fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          const Gap(4),
                          TextButton(
                            onPressed: () {
                              userChoice = true;
                              confirmEntry.remove();
                            },
                            child: Text(
                              'Sign Out',
                              style: GoogleFonts.inter(
                                color: GColors.rose, fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
    overlay.insert(confirmEntry);

    // Poll until user picks one of the buttons (both call entry.remove()
    // after setting userChoice). 30ms tick is responsive enough.
    while (userChoice == null) {
      await Future.delayed(const Duration(milliseconds: 30));
    }

    if (userChoice != true || !mounted) return;

    // ── Actually sign out ────────────────────────────────────────────────
    final storage = ref.read(secureStorageProvider);
    try {
      await storage.delete(key: 'gifteeng.b2c.token');
    } catch (_) {}

    // ShellScreen watches authTokenNotifierProvider — invalidating it
    // triggers a rebuild that renders AuthScreen inline (no Navigator
    // route change, no Samsung freeze).
    ref.invalidate(authTokenNotifierProvider);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _confirm,
      child: AnimatedScale(
        scale: _signingOut ? 0.98 : 1.0,
        duration: const Duration(milliseconds: 120),
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
              if (_signingOut) ...[
                const SizedBox(
                  width: 16, height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2, color: GColors.rose,
                  ),
                ),
                const Gap(10),
                Text(
                  'Signing out…',
                  style: GoogleFonts.inter(
                    fontSize: 15, fontWeight: FontWeight.w700,
                    color: GColors.rose,
                  ),
                ),
              ] else ...[
                const Icon(Icons.logout_rounded, color: GColors.rose, size: 18),
                const Gap(10),
                Text(
                  'Sign Out',
                  style: GoogleFonts.inter(
                    fontSize: 15, fontWeight: FontWeight.w700,
                    color: GColors.rose,
                  ),
                ),
              ],
            ],
          ),
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
