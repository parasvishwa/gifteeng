// ─── Homepage config repository ──────────────────────────────────────────────
//
// Mirrors the web admin "Homepage Builder" so any section the operator toggles
// at /super-admin/homepage-content is also respected by the Flutter home
// screen. Without this the mobile app rendered its own hard-coded section
// list and admin changes silently no-op'd.
//
// Wire model:
//   1. Admin POSTs `homepage_config` to /api/admin/settings/homepage_config
//   2. Web + Flutter both GET /api/homepage/config which folds that blob
//      into a canonical { sections: [...] } shape.
//   3. Each section row carries:
//        - type            (e.g. "product-row", "testimonials", "hero")
//        - active          (whether to render at all)
//        - visibility      ({ mobile: bool, desktop: bool })
//        - order           (display sort)
//        - title/subtitle
//        - config          (per-type body, passed through opaquely)
//   4. The Flutter home screen uses `HomepageVisibility.isVisible(type)` to
//      gate its existing widgets. We don't yet rewrite the entire screen as
//      a config-driven layout (too invasive); admin can hide/show + reorder
//      conceptually, but mobile still uses its native widget order until
//      we refactor.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';

class HomepageSection {
  HomepageSection({
    required this.id,
    required this.type,
    required this.active,
    required this.mobileVisible,
    required this.desktopVisible,
    required this.order,
    this.title,
    this.subtitle,
    this.config = const {},
  });

  final String id;
  final String type;
  final bool active;
  final bool mobileVisible;
  final bool desktopVisible;
  final int order;
  final String? title;
  final String? subtitle;
  final Map<String, dynamic> config;

  factory HomepageSection.fromJson(Map<String, dynamic> j) {
    final visibility = (j['visibility'] as Map?)?.cast<String, dynamic>() ?? const {};
    return HomepageSection(
      id:             (j['id']       ?? '') as String,
      type:           (j['type']     ?? '') as String,
      active:         (j['active']   as bool?) ?? true,
      // Default both platforms to visible — admin opts OUT, not IN.
      mobileVisible:  (visibility['mobile']  as bool?) ?? true,
      desktopVisible: (visibility['desktop'] as bool?) ?? true,
      order:          ((j['order'] as num?) ?? 0).toInt(),
      title:          j['title']    as String?,
      subtitle:       j['subtitle'] as String?,
      config:         (j['config'] as Map?)?.cast<String, dynamic>() ?? const {},
    );
  }
}

class HomepageConfig {
  HomepageConfig(this.sections);
  final List<HomepageSection> sections;

  /// Is THIS section type meant to render on mobile?
  /// Falls back to true when the admin hasn't set the section — we prefer
  /// "show by default" so a brand-new feature doesn't quietly disappear from
  /// the app while the operator is still building their config.
  bool isMobileVisible(String type) {
    final s = sections.where((s) => s.type == type).toList();
    if (s.isEmpty) return true;
    return s.any((s) => s.active && s.mobileVisible);
  }

  /// Title override for a given section type, if the admin set one.
  String? titleFor(String type) {
    for (final s in sections) {
      if (s.type == type && s.active && s.title != null && s.title!.trim().isNotEmpty) {
        return s.title;
      }
    }
    return null;
  }

  /// Subtitle override for a given section type.
  String? subtitleFor(String type) {
    for (final s in sections) {
      if (s.type == type && s.active && s.subtitle != null && s.subtitle!.trim().isNotEmpty) {
        return s.subtitle;
      }
    }
    return null;
  }

  static const empty = _EmptyHomepageConfig._();
}

class _EmptyHomepageConfig implements HomepageConfig {
  const _EmptyHomepageConfig._();
  @override
  List<HomepageSection> get sections => const [];
  @override
  bool isMobileVisible(String type) => true;
  @override
  String? titleFor(String type) => null;
  @override
  String? subtitleFor(String type) => null;
}

/// Async provider — fetched once per app session and reused.
/// Errors fall back to the "show everything" config so a transient network
/// blip can never blank out the home screen.
final homepageConfigProvider =
    FutureProvider<HomepageConfig>((ref) async {
  final dio = ref.watch(dioProvider);
  try {
    final res = await dio.get('/homepage/config');
    final data = res.data;
    if (data is! Map) return HomepageConfig.empty;
    // The endpoint returns a legacy-friendly envelope:
    //   { heroSlides, sections, config: { sections: [...] } }
    // Prefer the new unified config when present.
    final newCfg = (data['config'] as Map?)?['sections'] as List?;
    if (newCfg != null) {
      return HomepageConfig(
        newCfg
            .whereType<Map>()
            .map((e) => HomepageSection.fromJson(e.cast<String, dynamic>()))
            .toList()
          ..sort((a, b) => a.order.compareTo(b.order)),
      );
    }
    // Legacy shape — derive minimal sections from the old `sections` array.
    final legacy = data['sections'] as List?;
    if (legacy != null) {
      return HomepageConfig(
        legacy
            .whereType<Map>()
            .map((e) => HomepageSection.fromJson({
                  'id': e['id'] ?? '',
                  'type': e['type'] ?? 'product-row',
                  'active': e['active'] ?? true,
                  'visibility': {'mobile': true, 'desktop': true},
                  'order': e['order'] ?? 0,
                  'title': e['title'],
                  'subtitle': e['subtitle'],
                  'config': e,
                }))
            .toList()
          ..sort((a, b) => a.order.compareTo(b.order)),
      );
    }
    return HomepageConfig.empty;
  } catch (_) {
    return HomepageConfig.empty;
  }
});
