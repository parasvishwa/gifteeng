// ────────────────────────────────────────────────────────────────────────────
// CartWinnings — Flutter mirror of the web `CartWinnings` widget.
//
// Lists every reward the customer has earned via the games (scratch
// cards, spin wheel, mystery boxes, milestone unlocks) and lets them
// apply / unapply each one with a single tap. Stack rules are enforced
// server-side; we only reflect the server state.
//
// API contract (must match apps/api/src/modules/rewards):
//   GET  /rewards/active            → Reward[]
//   POST /rewards/apply  {rewardId} → { ok: true }   (toggle)
//   POST /rewards/compute {subtotal,shipping,giftWrap}
//                                     → CartSummary  (called from screen)
//
// Renders nothing for guests (no token) — mirrors the web behaviour.
// ────────────────────────────────────────────────────────────────────────────
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:gap/gap.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/services/audio_service.dart';

class Reward {
  final String id;
  final String code;
  final String type;          // discount_pct / discount_flat / free_shipping / free_gift_wrap / free_product / goins / miss
  final String value;
  final String label;
  final String status;        // pending | applied
  final String source;
  final num minCartInr;
  final DateTime? expiresAt;

  const Reward({
    required this.id,
    required this.code,
    required this.type,
    required this.value,
    required this.label,
    required this.status,
    required this.source,
    required this.minCartInr,
    required this.expiresAt,
  });

  static Reward fromJson(Map<String, dynamic> j) => Reward(
    id:      (j['id'] ?? '').toString(),
    code:    (j['code'] ?? '').toString(),
    type:    (j['type'] ?? 'miss').toString(),
    value:   (j['value'] ?? '').toString(),
    label:   (j['label'] ?? 'Reward').toString(),
    status:  (j['status'] ?? 'pending').toString(),
    source:  (j['source'] ?? '').toString(),
    minCartInr: (j['minCartInr'] is num)
        ? j['minCartInr'] as num
        : num.tryParse('${j['minCartInr']}') ?? 0,
    expiresAt: j['expiresAt'] is String
        ? DateTime.tryParse(j['expiresAt'] as String)
        : null,
  );
}

const Map<String, String> _rewardIcon = {
  'goins':          '🪙',
  'discount_pct':   '🎯',
  'discount_flat':  '💸',
  'free_shipping':  '🚚',
  'free_gift_wrap': '🎀',
  'free_product':   '🎁',
  'miss':           '💨',
};

/// Provider — re-fetched whenever the screen `ref.invalidate`s it
/// (e.g. after a reward is toggled, or after the realtime cart-scope
/// SSE event fires). autoDispose so it doesn't hold state when the
/// user leaves the cart.
final rewardsProvider = FutureProvider.autoDispose<List<Reward>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/rewards/active');
    final data = res.data;
    if (data is List) {
      return data
          .whereType<Map>()
          .map((m) => Reward.fromJson(Map<String, dynamic>.from(m)))
          .toList();
    }
  } catch (_) { /* not logged in or no rewards */ }
  return const <Reward>[];
});

class CartWinnings extends ConsumerStatefulWidget {
  /// Current cart subtotal — used for eligibility hints. We don't gate
  /// the apply call here; server enforces minCartInr.
  final num subtotalInr;

  /// Called whenever a reward is applied or removed so the screen can
  /// recompute totals via `/rewards/compute`.
  final VoidCallback? onChange;

  const CartWinnings({super.key, required this.subtotalInr, this.onChange});

  @override
  ConsumerState<CartWinnings> createState() => _CartWinningsState();
}

class _CartWinningsState extends ConsumerState<CartWinnings> {
  String? _busy;          // reward id currently toggling
  bool    _showAll = false;

  Future<void> _toggle(Reward r) async {
    if (_busy != null) return;
    setState(() => _busy = r.id);
    AudioService.instance.tap();
    try {
      final dio = ref.read(dioProvider);
      await dio.post('/rewards/apply', data: {'rewardId': r.id});
      ref.invalidate(rewardsProvider);
      widget.onChange?.call();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(_humanError(e),
              style: GoogleFonts.inter(fontWeight: FontWeight.w500)),
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 80),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12)),
        ));
      }
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  String _humanError(Object e) {
    final s = e.toString();
    if (s.contains('minCartInr') || s.contains('subtotal')) {
      return 'Cart total too low to apply this reward';
    }
    return 'Could not apply reward';
  }

  @override
  Widget build(BuildContext context) {
    final _c    = GColors.of(context);
    final async = ref.watch(rewardsProvider);

    return async.when(
      loading:  () => const SizedBox.shrink(),
      error:    (_, __) => const SizedBox.shrink(),
      data: (rewards) {
        if (rewards.isEmpty) return const SizedBox.shrink();

        final preview = _showAll ? rewards : rewards.take(3).toList();
        final hasMore = rewards.length > preview.length;

        return Container(
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: _c.gold.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _c.gold.withValues(alpha: 0.3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                const Text('🎁', style: TextStyle(fontSize: 18)),
                const Gap(8),
                Text('Your Winnings (${rewards.length})',
                    style: GoogleFonts.inter(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: _c.text0)),
              ]),
              const Gap(10),
              ...preview.asMap().entries.map((e) => Padding(
                padding: EdgeInsets.only(bottom: e.key == preview.length - 1 ? 0 : 8),
                child: _RewardRow(
                  reward: e.value,
                  busy:   _busy == e.value.id,
                  onTap:  () => _toggle(e.value),
                ),
              ).animate(delay: (e.key * 60).ms).fadeIn(duration: 240.ms).slideY(begin: 0.05, end: 0)),
              if (hasMore) ...[
                const Gap(8),
                Center(
                  child: TextButton(
                    onPressed: () => setState(() => _showAll = !_showAll),
                    child: Text(_showAll ? 'Show less' : 'Show ${rewards.length - preview.length} more',
                      style: GoogleFonts.inter(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: _c.brand)),
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _RewardRow extends StatelessWidget {
  final Reward       reward;
  final bool         busy;
  final VoidCallback onTap;
  const _RewardRow({required this.reward, required this.busy, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final _c       = GColors.of(context);
    final applied  = reward.status == 'applied';
    final icon     = _rewardIcon[reward.type] ?? '🎁';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: applied
            ? const Color(0xFF22C55E).withValues(alpha: 0.10)
            : _c.bg1,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: applied
              ? const Color(0xFF22C55E).withValues(alpha: 0.35)
              : _c.border,
        ),
      ),
      child: Row(children: [
        Text(icon, style: const TextStyle(fontSize: 18)),
        const Gap(10),
        Expanded(child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(reward.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.inter(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: _c.text0)),
            const Gap(2),
            Text(_subtitle(reward),
              style: GoogleFonts.inter(
                fontSize: 10.5,
                color: _c.text2)),
          ],
        )),
        const Gap(8),
        SizedBox(
          height: 30,
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              backgroundColor: applied ? const Color(0xFF22C55E) : _c.brand,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8)),
              elevation: 0,
              textStyle: GoogleFonts.inter(
                  fontSize: 11, fontWeight: FontWeight.w800),
            ),
            onPressed: busy ? null : onTap,
            child: busy
                ? const SizedBox(
                    width: 14, height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white),
                  )
                : Text(applied ? 'Remove' : 'Apply'),
          ),
        ),
      ]),
    );
  }

  String _subtitle(Reward r) {
    final parts = <String>[];
    if (r.code.isNotEmpty) parts.add(r.code);
    if (r.minCartInr > 0)  parts.add('min ₹${r.minCartInr.toInt()}');
    if (r.source.isNotEmpty) parts.add('From ${_sourceLabel(r.source)}');
    return parts.join(' · ');
  }

  String _sourceLabel(String src) {
    switch (src) {
      case 'scratch_card':   return 'Scratch Card';
      case 'spin_wheel':     return 'Spin Wheel';
      case 'mystery_box':    return 'Mystery Box';
      case 'milestone':      return 'Milestone';
      default:               return src.replaceAll('_', ' ');
    }
  }
}
