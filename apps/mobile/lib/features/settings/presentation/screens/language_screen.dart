// ─── Language picker ─────────────────────────────────────────────────────────
//
// Lets the user switch between English / हिन्दी / मराठी. Writes to
// SharedPreferences via LocaleNotifier; the MaterialApp at the root
// re-renders with the new locale immediately.
//
// Mobile-only for now. The web super admin will grow its own per-user
// language preference in a later sprint.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/analytics/analytics_service.dart';
import '../../../../core/i18n/locale_notifier.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../l10n/generated/app_localizations.dart';

class LanguageScreen extends ConsumerWidget {
  const LanguageScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(localeNotifierProvider);
    final c = GColors.of(context);
    final t = AppLocalizations.of(context)!;

    final langs = <_LangEntry>[
      _LangEntry(null,              "System",        t.langEnglish),
      _LangEntry(const Locale('en'), 'English',      t.langEnglish),
      _LangEntry(const Locale('hi'), 'हिन्दी',        t.langHindi),
      _LangEntry(const Locale('mr'), 'मराठी',         t.langMarathi),
    ];

    return Scaffold(
      backgroundColor: c.bg0,
      appBar: AppBar(
        backgroundColor: c.bg0,
        elevation: 0,
        title: Text(t.settingsLanguageTitle, style: GoogleFonts.inter(
          fontSize: 17, fontWeight: FontWeight.w800, color: c.text0,
        )),
        iconTheme: IconThemeData(color: c.text0),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 4, 4, 14),
            child: Text(t.settingsLanguageSubtitle,
              style: GoogleFonts.inter(
                fontSize: 12, color: c.text2, height: 1.4,
              )),
          ),
          for (final l in langs)
            _LangRow(
              entry:    l,
              selected: _matches(current, l.locale),
              onTap: () async {
                HapticFeedback.selectionClick();
                Analytics.track('language_changed', {
                  'to': l.locale?.languageCode ?? 'system',
                });
                await ref.read(localeNotifierProvider.notifier).setLocale(l.locale);
              },
            ),
        ],
      ),
    );
  }

  bool _matches(Locale? current, Locale? option) {
    if (option == null) return current == null;
    if (current == null) return false;
    return current.languageCode == option.languageCode;
  }
}

class _LangEntry {
  final Locale? locale;   // null → "System default"
  final String label;     // shown as main line
  final String nativeLabel; // shown smaller (the word for this language in itself)
  const _LangEntry(this.locale, this.label, this.nativeLabel);
}

class _LangRow extends StatelessWidget {
  final _LangEntry entry;
  final bool selected;
  final VoidCallback onTap;
  const _LangRow({
    required this.entry,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: selected ? c.bg2 : c.bg1,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: c.border, width: 1),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(entry.label, style: GoogleFonts.inter(
                    fontSize: 14, fontWeight: FontWeight.w700, color: c.text0,
                  )),
                  if (entry.locale != null && entry.label != entry.nativeLabel) ...[
                    const Gap(2),
                    Text(entry.nativeLabel, style: GoogleFonts.inter(
                      fontSize: 12, color: c.text2,
                    )),
                  ],
                ],
              ),
            ),
            if (selected)
              Icon(Icons.check_circle_rounded,
                  size: 20, color: GColors.brand)
            else
              Icon(Icons.circle_outlined,
                  size: 20, color: c.text2),
          ],
        ),
      ),
    );
  }
}
