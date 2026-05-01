// ─── Theme picker ───────────────────────────────────────────────────────────
//
// Switch between System / Light / Dark. Persists to SharedPreferences.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/analytics/analytics_service.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/theme/theme_mode_notifier.dart';

class ThemeScreen extends ConsumerWidget {
  const ThemeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(themeModeNotifierProvider);
    final c = GColors.of(context);

    final options = <_ThemeOption>[
      _ThemeOption(ThemeMode.system, 'System default',
          'Follows your phone', Icons.brightness_auto_rounded),
      _ThemeOption(ThemeMode.light,  'Light',
          'Bright interface', Icons.light_mode_rounded),
      _ThemeOption(ThemeMode.dark,   'Dark',
          'Easy on the eyes', Icons.dark_mode_rounded),
    ];

    return Scaffold(
      backgroundColor: c.bg0,
      appBar: AppBar(
        backgroundColor: c.bg0,
        elevation: 0,
        title: Text('Appearance', style: GoogleFonts.inter(
          fontSize: 17, fontWeight: FontWeight.w800, color: c.text0,
        )),
        iconTheme: IconThemeData(color: c.text0),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 4, 4, 14),
            child: Text(
              'Choose how the app looks.',
              style: GoogleFonts.inter(
                fontSize: 12, color: c.text2, height: 1.4,
              ),
            ),
          ),
          for (final o in options)
            _ThemeRow(
              option:   o,
              selected: o.mode == current,
              onTap: () async {
                HapticFeedback.selectionClick();
                Analytics.track('theme_changed', {
                  'to': o.mode == ThemeMode.system
                      ? 'system'
                      : (o.mode == ThemeMode.light ? 'light' : 'dark'),
                });
                await ref.read(themeModeNotifierProvider.notifier).setMode(o.mode);
              },
            ),
        ],
      ),
    );
  }
}

class _ThemeOption {
  final ThemeMode mode;
  final String label;
  final String sub;
  final IconData icon;
  const _ThemeOption(this.mode, this.label, this.sub, this.icon);
}

class _ThemeRow extends StatelessWidget {
  final _ThemeOption option;
  final bool selected;
  final VoidCallback onTap;
  const _ThemeRow({
    required this.option,
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
            Container(
              width: 38, height: 38,
              decoration: BoxDecoration(
                color: selected
                    ? GColors.brand.withValues(alpha: 0.12)
                    : c.bg2,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(option.icon,
                  size: 18,
                  color: selected ? GColors.brand : c.text1),
            ),
            const Gap(12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(option.label, style: GoogleFonts.inter(
                    fontSize: 14, fontWeight: FontWeight.w700, color: c.text0,
                  )),
                  const Gap(2),
                  Text(option.sub, style: GoogleFonts.inter(
                    fontSize: 12, color: c.text2,
                  )),
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
