import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Badge data + computation
//
// The backend doesn't expose `trending` / `viewerCount` / `orderCount` fields
// yet, so badges are derived client-side from data we DO have:
//
//   • product.createdAt       → "NEW" if created within the last 30 days
//   • product.metadata.tags   → check for 'trending' / 'bestseller' / etc.
//   • product.metadata.featured → "FEATURED"
//   • product.inventory       → "Only N left" / "SOLD OUT"
//   • product.isCustomizable  → "PERSONALIZABLE"
//
// When the backend exposes real trending/order signals later, `computeBadges`
// picks them up first (via metadata.trending / metadata.bestseller booleans).
// ─────────────────────────────────────────────────────────────────────────────

class ProductBadge {
  final String emoji;
  final String label;
  final Color bg;
  final Color fg;
  final int priority; // lower = shown first
  const ProductBadge({
    required this.emoji,
    required this.label,
    required this.bg,
    required this.fg,
    required this.priority,
  });
}

/// Returns a priority-sorted list of badges for the given product.
/// Callers usually take `.take(2)` or `.take(3)` to avoid clutter.
List<ProductBadge> computeBadges(Map<String, dynamic> product) {
  final badges = <ProductBadge>[];
  final meta = (product['metadata'] as Map?) ?? const {};
  final tags = (meta['tags'] as List?)
      ?.map((t) => t.toString().toLowerCase())
      .toList() ?? const <String>[];

  // Urgency first
  final invRaw = product['inventory'];
  final inv = invRaw is num ? invRaw.toInt() : 9999;
  if (inv == 0) {
    badges.add(const ProductBadge(
      emoji: '🚫', label: 'SOLD OUT',
      bg: Color(0xFF2A2A35), fg: Color(0xFF9CA3AF), priority: 0,
    ));
  } else if (inv > 0 && inv <= 5) {
    badges.add(ProductBadge(
      emoji: '⚠️', label: 'Only $inv left',
      bg: const Color(0xFF2D1A1A),
      fg: const Color(0xFFEF6B6B),
      priority: 1,
    ));
  }

  // Explicit backend flags (future-proofing)
  if (meta['trending'] == true || tags.contains('trending')) {
    badges.add(const ProductBadge(
      emoji: '🔥', label: 'TRENDING',
      bg: Color(0xFF2A1E14), fg: Color(0xFFE8845A), priority: 2,
    ));
  }
  if (meta['bestseller'] == true
      || meta['bestSeller'] == true
      || tags.contains('bestseller')
      || tags.contains('best-seller')) {
    badges.add(const ProductBadge(
      emoji: '🏆', label: 'BEST SELLER',
      bg: Color(0xFF231E0E), fg: Color(0xFFB8935A), priority: 3,
    ));
  }
  if (meta['featured'] == true || tags.contains('featured')) {
    badges.add(const ProductBadge(
      emoji: '⭐', label: 'FEATURED',
      bg: Color(0xFF221E0D), fg: Color(0xFFB8935A), priority: 4,
    ));
  }

  // NEW — based on createdAt
  final createdRaw = product['createdAt'];
  if (createdRaw is String) {
    try {
      final created = DateTime.parse(createdRaw);
      final ageDays = DateTime.now().difference(created).inDays;
      if (ageDays <= 30) {
        badges.add(const ProductBadge(
          emoji: '✨', label: 'NEW',
          bg: Color(0xFF0E1F1A), fg: Color(0xFF4ABA8A), priority: 5,
        ));
      }
    } catch (_) {}
  }

  // Customizable (shown last, lowest priority — it's a feature flag not urgency)
  if (product['isCustomizable'] == true) {
    badges.add(const ProductBadge(
      emoji: '✏️', label: 'CUSTOMIZABLE',
      bg: Color(0xFF1A1428), fg: Color(0xFF9E7FD4), priority: 6,
    ));
  }

  badges.sort((a, b) => a.priority.compareTo(b.priority));
  return badges;
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge chip widgets
// ─────────────────────────────────────────────────────────────────────────────

/// A single small badge chip.
class BadgeChip extends StatelessWidget {
  final ProductBadge badge;
  final bool compact; // tiny version for card corners
  const BadgeChip({super.key, required this.badge, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final padH = compact ? 6.0 : 10.0;
    final padV = compact ? 2.0 : 4.0;
    final fontSize = compact ? 8.5 : 11.0;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: padH, vertical: padV),
      decoration: BoxDecoration(
        color: badge.fg.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: badge.fg.withValues(alpha: 0.25), width: 0.5),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text(badge.emoji, style: TextStyle(fontSize: fontSize + 1)),
        Gap(compact ? 3 : 5),
        Text(badge.label, style: GoogleFonts.inter(
          fontSize: fontSize,
          fontWeight: FontWeight.w800,
          color: badge.fg,
          letterSpacing: compact ? 0.2 : 0.4,
        )),
      ]),
    );
  }
}

/// Horizontal row of badges with a max-count cap. Use for product cards +
/// product detail headers.
class ProductBadgeRow extends StatelessWidget {
  final Map<String, dynamic> product;
  final int maxBadges;
  final bool compact;
  const ProductBadgeRow({
    super.key,
    required this.product,
    this.maxBadges = 2,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final badges = computeBadges(product).take(maxBadges).toList();
    if (badges.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: compact ? 4 : 6,
      runSpacing: compact ? 4 : 6,
      children: badges.map((b) => BadgeChip(badge: b, compact: compact)).toList(),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// "People viewing now" — pseudo-live counter
//
// Deterministic so two users looking at the same product within the same
// minute see the same number (so the ticker doesn't feel fake/random).
// Updates every ~45 seconds with a small ±3 drift so it feels alive.
// ─────────────────────────────────────────────────────────────────────────────

class PeopleViewingNow extends StatefulWidget {
  final String productId;
  /// Lowest possible count (inclusive).
  final int min;
  /// Highest possible count (inclusive).
  final int max;
  final Color color;
  final Color textColor;
  const PeopleViewingNow({
    super.key,
    required this.productId,
    this.min = 7,
    this.max = 42,
    this.color = const Color(0xFF10B981),
    this.textColor = const Color(0xFF059669),
  });

  @override
  State<PeopleViewingNow> createState() => _PeopleViewingNowState();
}

class _PeopleViewingNowState extends State<PeopleViewingNow> {
  late int _count;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _count = _computeCount();
    // Recompute every 45s with a small drift.
    _timer = Timer.periodic(const Duration(seconds: 45), (_) {
      if (!mounted) return;
      setState(() => _count = _computeCount());
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  int _computeCount() {
    // Stable per-product base using productId hash
    final base = widget.productId.hashCode.abs();
    // Per-minute bucket adds variance but stays stable within a minute
    final bucket = DateTime.now().millisecondsSinceEpoch ~/ (45 * 1000);
    final range = widget.max - widget.min + 1;
    final n = widget.min + ((base ^ bucket) % range);
    return n.clamp(widget.min, widget.max);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: widget.color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: widget.color.withValues(alpha: 0.3)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        // Pulsing green dot
        Container(
          width: 7, height: 7,
          decoration: BoxDecoration(color: widget.color, shape: BoxShape.circle),
        ).animate(onPlay: (c) => c.repeat(reverse: true))
            .fadeIn(duration: 600.ms)
            .fadeOut(begin: 1, delay: 400.ms, duration: 800.ms),
        const Gap(6),
        Text('$_count viewing now',
          style: GoogleFonts.inter(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            color: widget.textColor,
          )),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// "Just bought" ticker — rotates through recent fake buyer names for social
// proof. Uses the same deterministic approach as PeopleViewingNow.
// ─────────────────────────────────────────────────────────────────────────────

class RecentBuyerTicker extends StatefulWidget {
  final String productId;
  final Color color;
  const RecentBuyerTicker({
    super.key,
    required this.productId,
    this.color = const Color(0xFFEC4899),
  });

  @override
  State<RecentBuyerTicker> createState() => _RecentBuyerTickerState();
}

class _RecentBuyerTickerState extends State<RecentBuyerTicker> {
  static const _names = [
    'Priya from Mumbai', 'Rahul from Delhi', 'Sneha from Bangalore',
    'Arjun from Pune', 'Meera from Chennai', 'Rohan from Hyderabad',
    'Ananya from Kolkata', 'Vikram from Jaipur', 'Divya from Ahmedabad',
    'Karan from Lucknow', 'Nisha from Kochi',
  ];
  int _nameIdx = 0;
  int _minutesAgo = 2;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _compute();
    _timer = Timer.periodic(const Duration(seconds: 7), (_) {
      if (!mounted) return;
      setState(() {
        _nameIdx = (_nameIdx + 1) % _names.length;
        _minutesAgo = 1 + (_nameIdx * 3) % 30;
      });
    });
  }

  @override
  void dispose() { _timer?.cancel(); super.dispose(); }

  void _compute() {
    final seed = widget.productId.hashCode.abs();
    _nameIdx = seed % _names.length;
    _minutesAgo = 1 + (seed % 25);
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: 300.ms,
      transitionBuilder: (c, anim) => FadeTransition(
        opacity: anim,
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0, 0.3), end: Offset.zero,
          ).animate(anim),
          child: c,
        ),
      ),
      child: Container(
        key: ValueKey(_nameIdx),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: widget.color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: widget.color.withValues(alpha: 0.25)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          const Text('🛍️', style: TextStyle(fontSize: 11)),
          const Gap(6),
          Flexible(
            child: Text(
              '${_names[_nameIdx]} bought this · ${_minutesAgo}m ago',
              maxLines: 1, overflow: TextOverflow.ellipsis,
              style: GoogleFonts.inter(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: widget.color,
              ),
            ),
          ),
        ]),
      ),
    );
  }
}
