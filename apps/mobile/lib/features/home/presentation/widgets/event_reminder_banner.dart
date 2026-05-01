import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Event reminder banner
//
// Primary data source: `/announcements` endpoint (admin-configured).
// Fallback: computes the next upcoming occasion from a hard-coded Indian
// festival calendar so users always see something relevant.
// ─────────────────────────────────────────────────────────────────────────────

class _Occasion {
  final String emoji, name, tagline;
  final DateTime date;
  final List<Color> gradient;
  final String link;
  const _Occasion({
    required this.emoji,
    required this.name,
    required this.tagline,
    required this.date,
    required this.gradient,
    this.link = '/shop',
  });

  int get daysUntil => date.difference(DateTime.now()).inDays;
}

/// Try the admin /announcements endpoint; if it 404s, compute the next
/// upcoming occasion from the local calendar.
final eventReminderProvider =
    FutureProvider.autoDispose<_Occasion?>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/announcements',
        queryParameters: {'active': 'true', 'placement': 'home'});
    final data = res.data;
    List list = [];
    if (data is List) list = data;
    if (data is Map) list = (data['items'] as List?) ?? const [];
    if (list.isNotEmpty) {
      final a = list.first as Map;
      final dateRaw = a['date'] ?? a['eventDate'] ?? a['endsAt'];
      final date = dateRaw is String
          ? (DateTime.tryParse(dateRaw) ??
              DateTime.now().add(const Duration(days: 7)))
          : DateTime.now().add(const Duration(days: 7));
      final gradRaw = a['gradient'] as List?;
      final grad = gradRaw != null && gradRaw.length >= 2
          ? gradRaw.map((h) => _hexColor(h.toString())).toList()
          : const [Color(0xFF1A0035), Color(0xFF2E0050)];
      // Prefer an explicit `link` if the admin set one; otherwise build it
      // from the new occasion `slug` field — that's what the admin UI now
      // pushes, and it gives the shop screen the right ?occasion=<slug>
      // filter even if the legacy `link` column was left at the default.
      final explicitLink = (a['link'] as String?)?.trim() ?? '';
      final slug = (a['slug'] as String?)?.trim() ?? '';
      final fallbackLink = slug.isNotEmpty ? '/shop?occasion=$slug' : '/shop';
      final link = (explicitLink.isEmpty || explicitLink == '/shop')
          ? fallbackLink
          : explicitLink;
      return _Occasion(
        emoji: (a['emoji'] ?? '🎉').toString(),
        name: (a['title'] ?? a['name'] ?? 'Upcoming occasion').toString(),
        tagline: (a['subtitle'] ?? a['tagline']
            ?? 'Order now for on-time delivery').toString(),
        date: date,
        gradient: grad,
        link: link,
      );
    }
  } catch (_) {
    // endpoint doesn't exist yet — fall through to local calendar
  }
  return _upcomingLocalOccasion();
});

/// Local Indian festival / event calendar. Returns the next upcoming one.
_Occasion? _upcomingLocalOccasion() {
  final now = DateTime.now();
  final year = now.year;
  // Pre-computed dates for this + next year. Update yearly.
  final calendar = <_Occasion>[
    _Occasion(
      emoji: '💝', name: 'Valentine\'s Day',
      tagline: 'Gifts for your loved one',
      date: DateTime(year, 2, 14),
      gradient: const [Color(0xFF3D0020), Color(0xFF2B0018)],
      link: '/shop?occasion=valentines'),
    _Occasion(
      emoji: '🌸', name: 'Holi',
      tagline: 'Festive gifts + corporate hampers',
      date: DateTime(year, 3, 25),
      gradient: const [Color(0xFF3D1A00), Color(0xFF2B1200)],
      link: '/shop?occasion=holi'),
    _Occasion(
      emoji: '🌼', name: 'Mother\'s Day',
      tagline: 'Personalised gifts for Mom',
      date: _secondSundayOfMay(year),
      gradient: const [Color(0xFF2E0050), Color(0xFF1A0030)],
      link: '/shop?occasion=mothers-day'),
    _Occasion(
      emoji: '👔', name: 'Father\'s Day',
      tagline: 'Something thoughtful for Dad',
      date: _thirdSundayOfJune(year),
      gradient: const [Color(0xFF0F2137), Color(0xFF082032)],
      link: '/shop?occasion=fathers-day'),
    _Occasion(
      emoji: '🇮🇳', name: 'Independence Day',
      tagline: 'Patriotic corporate gifts',
      date: DateTime(year, 8, 15),
      gradient: const [Color(0xFF0F3D00), Color(0xFF082800)],
      link: '/shop?occasion=independence-day'),
    _Occasion(
      emoji: '👫', name: 'Friendship Day',
      tagline: 'Gifts for your BFFs',
      date: _firstSundayOfAugust(year),
      gradient: const [Color(0xFF3D0030), Color(0xFF2B001F)],
      link: '/shop?occasion=friendship-day'),
    _Occasion(
      emoji: '🪔', name: 'Diwali',
      tagline: 'Festival of lights + corporate hampers',
      date: DateTime(year, 11, 1),
      gradient: const [Color(0xFF3D2000), Color(0xFF2B1700)]),
    _Occasion(
      emoji: '🤝', name: 'Bhai Dooj',
      tagline: 'Gifts for your sibling',
      date: DateTime(year, 11, 3),
      gradient: const [Color(0xFF3D0020), Color(0xFF2B0018)]),
    _Occasion(
      emoji: '🎄', name: 'Christmas',
      tagline: 'Festive cheer + gift wrapping',
      date: DateTime(year, 12, 25),
      gradient: const [Color(0xFF0A2E0A), Color(0xFF06200A)]),
    _Occasion(
      emoji: '🎊', name: 'New Year',
      tagline: 'Celebrate a fresh start',
      date: DateTime(year + 1, 1, 1),
      gradient: const [Color(0xFF1A0050), Color(0xFF0F0035)]),
  ];
  // Pick the nearest future one (≥ today).
  calendar.sort((a, b) => a.date.compareTo(b.date));
  for (final o in calendar) {
    if (!o.date.isBefore(DateTime(now.year, now.month, now.day))) {
      final daysOut = o.date.difference(now).inDays;
      // Skip events more than 60 days away — not urgent enough
      if (daysOut <= 60) return o;
    }
  }
  return calendar.first; // fallback
}

DateTime _secondSundayOfMay(int y) {
  var d = DateTime(y, 5, 1);
  while (d.weekday != DateTime.sunday) { d = d.add(const Duration(days: 1)); }
  return d.add(const Duration(days: 7));
}
DateTime _thirdSundayOfJune(int y) {
  var d = DateTime(y, 6, 1);
  while (d.weekday != DateTime.sunday) { d = d.add(const Duration(days: 1)); }
  return d.add(const Duration(days: 14));
}
DateTime _firstSundayOfAugust(int y) {
  var d = DateTime(y, 8, 1);
  while (d.weekday != DateTime.sunday) { d = d.add(const Duration(days: 1)); }
  return d;
}

Color _hexColor(String hex) {
  final s = hex.replaceAll('#', '');
  if (s.length == 6) return Color(int.parse('FF$s', radix: 16));
  if (s.length == 8) return Color(int.parse(s, radix: 16));
  return const Color(0xFF1A0035);
}

// ─── Widget ──────────────────────────────────────────────────────────────────

class EventReminderBanner extends ConsumerWidget {
  const EventReminderBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(eventReminderProvider);
    return async.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (occ) {
        if (occ == null) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
          child: GestureDetector(
            onTap: () {
              HapticFeedback.selectionClick();
              if (occ.link.startsWith('/')) context.push(occ.link);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: GColors.of(context).bg1,
                borderRadius: const BorderRadius.all(Radius.circular(16)),
              ),
              child: Row(children: [
                Text(occ.emoji, style: const TextStyle(fontSize: 26)),
                const Gap(12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Flexible(child: Text('${occ.name} ',
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(
                            fontSize: 13, fontWeight: FontWeight.w800,
                            color: GColors.of(context).text0))),
                        _Countdown(days: occ.daysUntil),
                      ]),
                      const Gap(2),
                      Text(occ.tagline,
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.inter(
                          fontSize: 11, color: GColors.of(context).text2)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 6),
                  decoration: const BoxDecoration(
                    color: GColors.brand,
                    borderRadius: BorderRadius.all(Radius.circular(8)),
                  ),
                  child: Text('Shop Now', style: GoogleFonts.inter(
                    fontSize: 11, fontWeight: FontWeight.w700,
                    color: Colors.white)),
                ),
              ]),
            ),
          ),
        );
      },
    );
  }
}

class _Countdown extends StatelessWidget {
  final int days;
  const _Countdown({required this.days});
  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final label = days <= 0 ? 'Today'
        : days == 1 ? 'Tomorrow'
        : days <= 7 ? '$days days'
        : days <= 30 ? '${(days / 7).round()} weeks'
        : '${(days / 30).round()} months';
    final urgent = days <= 7;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: urgent
            ? GColors.rose.withValues(alpha: 0.15)
            : c.bg2,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label, style: GoogleFonts.inter(
        fontSize: 9, fontWeight: FontWeight.w800,
        color: urgent ? const Color(0xFFFCA5A5) : c.text1)),
    ).animate(onPlay: (c) => urgent ? c.repeat(reverse: true) : null)
        .fadeIn(duration: 600.ms)
        .then(delay: 300.ms)
        .scaleXY(begin: 1, end: 1.08, duration: 500.ms);
  }
}
