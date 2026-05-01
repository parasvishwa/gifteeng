import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/services/audio_service.dart';
import '../../../../l10n/generated/app_localizations.dart';

// Cart item count provider — drives the red badge on the CART tab
final cartItemCountProvider = FutureProvider.autoDispose<int>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/cart');
    final items = (res.data as Map?)?['items'] as List? ?? [];
    return items.fold<int>(0, (sum, i) {
      final q = (i is Map)
          ? ((i['qty'] as num?)?.toInt() ?? (i['quantity'] as num?)?.toInt() ?? 1)
          : 1;
      return sum + q;
    });
  } catch (_) {
    return 0;
  }
});

// ─── Tab definitions ──────────────────────────────────────────────────────────

class _TabDef {
  final IconData idleIcon, activeIcon;
  final String label;
  final bool isHero;
  const _TabDef(this.idleIcon, this.activeIcon, this.label, {this.isHero = false});
}

const _tabs = [
  _TabDef(Icons.home_outlined, Icons.home_rounded, 'HOME'),
  _TabDef(Icons.storefront_outlined, Icons.storefront_rounded, 'SHOP'),
  _TabDef(Icons.casino_outlined, Icons.casino_rounded, 'GIFT CASINO', isHero: true),
  _TabDef(Icons.shopping_bag_outlined, Icons.shopping_bag_rounded, 'CART'),
  _TabDef(Icons.person_outline_rounded, Icons.person_rounded, 'ME'),
];

// ─── Colors ───────────────────────────────────────────────────────────────────

const _kActiveColor   = Color(0xFFEF3752);
const _kInactiveColor = Color(0xFF8E8E93);

// ─── ShellScreen ─────────────────────────────────────────────────────────────

class ShellScreen extends StatelessWidget {
  final StatefulNavigationShell shell;
  const ShellScreen({super.key, required this.shell});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: shell,
      bottomNavigationBar: _GNavBar(
        currentIndex: shell.currentIndex,
        onTap: (i) {
          HapticFeedback.selectionClick();
          AudioService.instance.tap();
          shell.goBranch(i, initialLocation: i == shell.currentIndex);
        },
      ),
    );
  }
}

// ─── Nav bar ─────────────────────────────────────────────────────────────────

class _GNavBar extends ConsumerWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  const _GNavBar({required this.currentIndex, required this.onTap});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cartCount = ref.watch(cartItemCountProvider).valueOrNull ?? 0;
    final bg     = Theme.of(context).scaffoldBackgroundColor;
    final border = Theme.of(context).dividerColor.withValues(alpha: 0.25);

    // ── Localized nav labels ─────────────────────────────────────────────────
    final t = AppLocalizations.of(context);
    final labels = [
      t?.navHome.toUpperCase()        ?? 'HOME',
      t?.navShop.toUpperCase()        ?? 'SHOP',
      t?.navGiftCasino.toUpperCase()  ?? 'GIFT CASINO',
      t?.navCart.toUpperCase()        ?? 'CART',
      t?.navAccount.toUpperCase()     ?? 'ME',
    ];

    return Container(
      decoration: BoxDecoration(
        color: bg,
        border: Border(
          top: BorderSide(color: border, width: 0.5),
        ),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 56,
          child: Row(
            children: List.generate(_tabs.length, (i) {
              final tab = _tabs[i];
              if (tab.isHero) {
                return Expanded(
                  child: Stack(
                    clipBehavior: Clip.none,
                    alignment: Alignment.center,
                    children: [
                      Positioned(
                        top: -8,
                        child: _HeroTab(
                          active: currentIndex == 2,
                          label: labels[2],
                          onTap: () => onTap(2),
                        ),
                      ),
                    ],
                  ),
                );
              }
              // Cart tab (index 3) gets a badge
              return Expanded(
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    _RegularTab(
                      tab: tab,
                      label: labels[i],
                      active: currentIndex == i,
                      onTap: () => onTap(i),
                    ),
                    if (i == 3 && cartCount > 0)  // index 3 = cart tab
                      Positioned(
                        top: 6, right: 22,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                          constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                          decoration: BoxDecoration(
                            color: const Color(0xFFEF4444),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: Theme.of(context).scaffoldBackgroundColor, width: 1.5),
                          ),
                          child: Center(
                            child: Text(
                              cartCount > 9 ? '9+' : '$cartCount',
                              style: GoogleFonts.inter(
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}

// ─── Regular tab ─────────────────────────────────────────────────────────────

class _RegularTab extends StatefulWidget {
  final _TabDef tab;
  final bool active;
  final VoidCallback onTap;
  final String? label;  // localized label override; falls back to tab.label
  const _RegularTab({
    required this.tab,
    required this.active,
    required this.onTap,
    this.label,
  });

  @override
  State<_RegularTab> createState() => _RegularTabState();
}

class _RegularTabState extends State<_RegularTab>
    with SingleTickerProviderStateMixin {
  late final AnimationController _press;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _press = AnimationController(vsync: this, duration: 110.ms);
    _scale = Tween<double>(begin: 1.0, end: 0.87)
        .animate(CurvedAnimation(parent: _press, curve: Curves.easeOut));
  }

  @override
  void dispose() {
    _press.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tab    = widget.tab;
    final active = widget.active;
    final color  = active ? _kActiveColor : _kInactiveColor;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown:   (_) => _press.forward(),
      onTapUp:     (_) { _press.reverse(); widget.onTap(); },
      onTapCancel: ()  => _press.reverse(),
      // SizedBox.expand makes the hit area fill the entire tab slot,
      // not just the icon+label column.
      child: SizedBox.expand(
        child: ScaleTransition(
          scale: _scale,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedSwitcher(
                duration: 160.ms,
                transitionBuilder: (child, anim) =>
                    ScaleTransition(scale: anim, child: child),
                child: Icon(
                  active ? tab.activeIcon : tab.idleIcon,
                  key: ValueKey('${tab.label}_$active'),
                  size: 22,
                  color: color,
                ),
              ),
              const SizedBox(height: 2),
              AnimatedDefaultTextStyle(
                duration: 160.ms,
                style: GoogleFonts.inter(
                  fontSize: 9,
                  fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                  color: color,
                  letterSpacing: 0.12,
                ),
                child: Text(widget.label ?? tab.label, maxLines: 1),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Hero tab (Gift Casino) ───────────────────────────────────────────────────

class _HeroTab extends StatefulWidget {
  final bool active;
  final VoidCallback onTap;
  final String label;
  const _HeroTab({required this.active, required this.onTap, this.label = 'GIFT CASINO'});

  @override
  State<_HeroTab> createState() => _HeroTabState();
}

class _HeroTabState extends State<_HeroTab>
    with SingleTickerProviderStateMixin {
  late final AnimationController _press;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _press = AnimationController(vsync: this, duration: 110.ms);
    _scale = Tween<double>(begin: 1.0, end: 0.87)
        .animate(CurvedAnimation(parent: _press, curve: Curves.easeOut));
  }

  @override
  void dispose() {
    _press.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final active     = widget.active;
    final labelColor = active ? _kActiveColor : _kInactiveColor;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown:   (_) => _press.forward(),
      onTapUp:     (_) { _press.reverse(); widget.onTap(); },
      onTapCancel: ()  => _press.reverse(),
      child: ScaleTransition(
        scale: _scale,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // ── Brand logo icon with brand ring when active ─────────────
            AnimatedContainer(
              duration: 200.ms,
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: active
                    ? Border.all(color: _kActiveColor, width: 2)
                    : Border.all(color: Colors.transparent, width: 2),
              ),
              child: ClipOval(
                child: Image.asset(
                  'assets/icon/gift_casino_icon.png',
                  width: 46,
                  height: 46,
                  fit: BoxFit.cover,
                ),
              ),
            ),
            const SizedBox(height: 4),
            // ── Label ─────────────────────────────────────────────────────
            AnimatedDefaultTextStyle(
              duration: 160.ms,
              style: GoogleFonts.inter(
                fontSize: 8,
                fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                color: labelColor,
                letterSpacing: 0.1,
              ),
              child: Text(widget.label, maxLines: 1),
            ),
          ],
        ),
      ),
    );
  }
}
