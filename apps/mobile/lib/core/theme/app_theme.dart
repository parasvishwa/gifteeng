import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

/// Gifteeng Design System — Dark Premium (Cred / Grow style)
///
/// Palette:
///   bg0   : #08080F  deepest background
///   bg1   : #0F0F1A  card / surface
///   bg2   : #181828  elevated card
///   border: #1E1E32  subtle separator
///   gold  : #F59E0B  primary accent (Goins, CTA)
///   pink  : #EC4899  secondary accent (games, loyalty)
///   emerald:#10B981  success / earned
///   rose  : #F43F5E  danger / loss
///   text0 : #FFFFFF  primary text
///   text1 : #94A3B8  secondary text
///   text2 : #475569  muted / placeholder

// Gifteeng design tokens.
//
// Two axes:
//   1. BRAND vs REWARD — `brand` (coral #EF3752, matches new logo) carries
//      emotional weight (gifting, love, primary CTAs). `gold` (#F59E0B) is
//      reserved for the Goins/rewards visual language so the currency
//      keeps its identity and doesn't fight the brand.
//   2. DARK vs LIGHT — surfaces and text swap on brightness change.
//      Accent colors (brand, gold, emerald, rose, violet, sky) stay
//      constant across themes.
//
// Usage guidance:
//   - In new code, read colors via `GColors.of(context).brand` / .bg1 / .text0.
//   - Legacy code using hardcoded `GColors.bg0` still reads the DARK palette —
//     migrate screens to `.of(context).*` on a per-file basis.

abstract final class GColors {
  // ─── BRAND — coral-red, primary/emotional accent ───────────────────────
  static const brand     = Color(0xFFEF3752);   // matches the logo
  static const brandDark = Color(0xFFC42642);   // pressed / borders / deep pill
  static const brandTint = Color(0xFFFDE8EC);   // soft bg for selected chips

  // ─── REWARDS — gold stays distinct so Goins has its own identity ──────
  static const gold     = Color(0xFFF59E0B);
  static const goldDark = Color(0xFFB45309);

  // ─── SUPPORT (both modes) ─────────────────────────────────────────────
  static const pink     = Color(0xFFEC4899);    // playful accent (not primary)
  static const pinkDark = Color(0xFF9D174D);
  static const emerald  = Color(0xFF10B981);    // success
  static const rose     = Color(0xFFF43F5E);    // danger / error
  static const violet   = Color(0xFF7C3AED);    // games/magic
  static const sky      = Color(0xFF0EA5E9);    // info

  // ─── Surfaces + text — legacy dark defaults (preserved for back-compat) ──
  // Any widget still writing `GColors.bg0` gets these dark values.
  // Screens migrating to light-mode support should read from
  // `GColors.of(context).*` instead.
  //
  // Spec: bg0=#0B0B0F (page), bg1=#12131A (surface/card), bg2=#1A1B24 (elevated)
  static const bg0      = Color(0xFF0B0B0F);
  static const bg1      = Color(0xFF12131A);
  static const bg2      = Color(0xFF1A1B24);
  static const border   = Color(0xFF1E2030);
  static const text0    = Color(0xFFFFFFFF);
  static const text1    = Color(0xFF94A3B8);
  static const text2    = Color(0xFF475569);

  // Light-mode equivalents — kept as public consts for one-off use
  // (e.g. a hero card that's always dark on a light screen).
  static const lightBg0      = Color(0xFFFFFFFF);
  static const lightBg1      = Color(0xFFFAFAFA);
  static const lightBg2      = Color(0xFFF4F4F5);
  static const lightBorder   = Color(0xFFE4E4E7);
  static const lightText0    = Color(0xFF0A0A0F);
  static const lightText1    = Color(0xFF52525B);
  static const lightText2    = Color(0xFF71717A);  // Zinc-500 — better contrast on white

  /// Context-aware palette accessor — use in new code:
  ///
  ///     final c = GColors.of(context);
  ///     Container(color: c.bg1, child: Text(style: TextStyle(color: c.text0)));
  ///
  /// Swaps between dark and light palettes on theme change.
  static GColorsPalette of(BuildContext context) =>
      Theme.of(context).brightness == Brightness.light
          ? const GColorsPalette.light()
          : const GColorsPalette.dark();

  // ─── Gradients ────────────────────────────────────────────────────────
  // `brandGradient` is the hero CTA — coral → pink is romantic and warm.
  // `celebrationGradient` is the wins/confetti/coin-fly — gold → coral.
  // Legacy `goldGradient` alias is preserved so existing widgets keep
  // working; it points at `brandGradient` now so the visual refresh
  // propagates everywhere that uses `GColors.goldGradient`.
  static const brandGradient = LinearGradient(
    colors: [Color(0xFFEF3752), Color(0xFFEC4899)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
  static const celebrationGradient = LinearGradient(
    colors: [Color(0xFFF59E0B), Color(0xFFEF3752)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
  static const emeraldGradient = LinearGradient(
    colors: [Color(0xFF10B981), Color(0xFF0EA5E9)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
  static const darkGradient = LinearGradient(
    colors: [Color(0xFF0F0F1A), Color(0xFF08080F)],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );
  // Legacy alias — existing code using `GColors.goldGradient` now gets
  // the new brand gradient (coral → pink) so the refresh is automatic.
  static const goldGradient = brandGradient;
}

/// Bundled palette snapshot — returned by `GColors.of(context)` so widgets
/// can read brightness-aware colors without needing `Theme.of` throughout.
///
/// Brand / reward / support accents stay CONSTANT across dark and light so
/// the visual identity is stable; only surfaces and text swap.
class GColorsPalette {
  // Surfaces (swap per brightness)
  final Color bg0, bg1, bg2, border;
  // Text (swap per brightness)
  final Color text0, text1, text2;
  // Brand + reward (constant)
  final Color brand, brandDark, brandTint;
  final Color gold, goldDark;
  // Support accents (constant)
  final Color pink, emerald, rose, violet, sky;

  const GColorsPalette._({
    required this.bg0, required this.bg1, required this.bg2, required this.border,
    required this.text0, required this.text1, required this.text2,
    required this.brand, required this.brandDark, required this.brandTint,
    required this.gold, required this.goldDark,
    required this.pink, required this.emerald,
    required this.rose, required this.violet, required this.sky,
  });

  const GColorsPalette.dark() : this._(
    bg0:       const Color(0xFF0B0B0F),
    bg1:       const Color(0xFF12131A),
    bg2:       const Color(0xFF1A1B24),
    border:    const Color(0xFF1E2030),
    text0:     const Color(0xFFFFFFFF),
    text1:     const Color(0xFF94A3B8),
    text2:     const Color(0xFF475569),
    brand:     const Color(0xFFEF3752),
    brandDark: const Color(0xFFC42642),
    // In dark mode, brandTint reads as a subtle glowing coral halo on bg1
    brandTint: const Color(0xFF2D0810),
    gold:      const Color(0xFFF59E0B),
    goldDark:  const Color(0xFFB45309),
    pink:      const Color(0xFFEC4899),
    emerald:   const Color(0xFF10B981),
    rose:      const Color(0xFFF43F5E),
    violet:    const Color(0xFF7C3AED),
    sky:       const Color(0xFF0EA5E9),
  );

  const GColorsPalette.light() : this._(
    // Soft-pink surfaces matching the web b2c shopping pages — the old
    // near-white (bg1: #FAFAFA, bg2: #F4F4F5) made cards disappear into
    // the page background. The pink tint adds warmth and visually
    // separates cards from the page without feeling heavy.
    bg0:       const Color(0xFFFFFFFF),       // page background — stays white
    bg1:       const Color(0xFFFFF5F7),       // cards — soft pink (was #FAFAFA)
    bg2:       const Color(0xFFFFEEF1),       // elevated cards — slightly stronger
    border:    const Color(0xFFFADDE3),       // pink-tinted border (was zinc)
    text0:     const Color(0xFF0A0A0F),
    text1:     const Color(0xFF52525B),
    text2:     const Color(0xFF71717A),  // Zinc-500 — readable on white bg
    brand:     const Color(0xFFEF3752),
    brandDark: const Color(0xFFC42642),
    brandTint: const Color(0xFFFDE8EC),
    gold:      const Color(0xFFF59E0B),
    goldDark:  const Color(0xFFB45309),
    pink:      const Color(0xFFEC4899),
    emerald:   const Color(0xFF10B981),
    rose:      const Color(0xFFF43F5E),
    violet:    const Color(0xFF7C3AED),
    sky:       const Color(0xFF0EA5E9),
  );
}

/// Shorthand extension — use `context.gc` instead of `GColors.of(context)`.
///
///     final c = context.gc;
///     Scaffold(backgroundColor: c.bg0, ...)
///     Text('hi', style: TextStyle(color: c.text0))
extension BuildContextThemeX on BuildContext {
  GColorsPalette get gc => GColors.of(this);
  bool get isDark => Theme.of(this).brightness == Brightness.dark;
}

class AppTheme {
  static ThemeData get dark {
    final base = ThemeData.dark(useMaterial3: true);
    final textTheme = GoogleFonts.interTextTheme(base.textTheme).copyWith(
      displayLarge:  const TextStyle(color: GColors.text0, fontWeight: FontWeight.w900, letterSpacing: -1.5),
      displayMedium: const TextStyle(color: GColors.text0, fontWeight: FontWeight.w800, letterSpacing: -1),
      displaySmall:  const TextStyle(color: GColors.text0, fontWeight: FontWeight.w700, letterSpacing: -0.5),
      headlineLarge: const TextStyle(color: GColors.text0, fontWeight: FontWeight.w800, letterSpacing: -0.5),
      headlineMedium:const TextStyle(color: GColors.text0, fontWeight: FontWeight.w700),
      headlineSmall: const TextStyle(color: GColors.text0, fontWeight: FontWeight.w700),
      titleLarge:    const TextStyle(color: GColors.text0, fontWeight: FontWeight.w700, letterSpacing: -0.3),
      titleMedium:   const TextStyle(color: GColors.text0, fontWeight: FontWeight.w600),
      titleSmall:    const TextStyle(color: GColors.text1, fontWeight: FontWeight.w600),
      bodyLarge:     const TextStyle(color: GColors.text0, fontWeight: FontWeight.w400),
      bodyMedium:    const TextStyle(color: GColors.text1, fontWeight: FontWeight.w400),
      bodySmall:     const TextStyle(color: GColors.text2, fontWeight: FontWeight.w400, fontSize: 12),
      labelLarge:    const TextStyle(color: GColors.text0, fontWeight: FontWeight.w700, letterSpacing: 0.5),
      labelMedium:   const TextStyle(color: GColors.text1, fontWeight: FontWeight.w600, letterSpacing: 0.3),
      labelSmall:    const TextStyle(color: GColors.text2, fontWeight: FontWeight.w500, fontSize: 10),
    );

    return base.copyWith(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: GColors.bg0,
      colorScheme: const ColorScheme.dark(
        // Primary = coral brand (the new #EF3752 from the logo). Gold is
        // still heavily used throughout the app via GColors.gold for
        // Goins/rewards, but primary CTAs + focus rings now read brand.
        primary: GColors.brand,
        onPrimary: Colors.white,
        secondary: GColors.gold,
        onSecondary: Colors.black,
        tertiary: GColors.pink,
        surface: GColors.bg1,
        onSurface: GColors.text0,
        error: GColors.rose,
        outline: GColors.border,
      ),
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: GColors.bg0,
        foregroundColor: GColors.text0,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        titleTextStyle: GoogleFonts.inter(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: GColors.text0,
          letterSpacing: -0.3,
        ),
        systemOverlayStyle: const SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.light,
          systemNavigationBarColor: GColors.bg0,
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: GColors.bg1,
        // Brand coral for the active tab — gold stays reserved for Goins.
        selectedItemColor: GColors.brand,
        unselectedItemColor: GColors.text2,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
        showSelectedLabels: true,
        showUnselectedLabels: true,
      ),
      cardTheme: const CardThemeData(
        color: GColors.bg1,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(16)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: GColors.bg2,
        hintStyle: const TextStyle(color: GColors.text2, fontSize: 14),
        // Tighter input height.
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: GColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: GColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: GColors.brand, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: GColors.rose),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: GColors.brand,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w700),
          minimumSize: const Size(0, 48),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: GColors.text0,
          side: const BorderSide(color: GColors.border),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600),
          minimumSize: const Size(0, 40),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: GColors.brand,
          textStyle: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: GColors.border,
        thickness: 1,
        space: 0,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: GColors.bg2,
        selectedColor: GColors.brand.withValues(alpha: 0.15),
        labelStyle: const TextStyle(color: GColors.text0, fontSize: 12, fontWeight: FontWeight.w600),
        side: const BorderSide(color: GColors.border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: GColors.bg1,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: GColors.bg1,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: GColors.bg2,
        contentTextStyle: GoogleFonts.inter(color: GColors.text0, fontWeight: FontWeight.w500),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        behavior: SnackBarBehavior.floating,
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: GColors.brand,
        linearTrackColor: GColors.bg2,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((s) =>
          s.contains(WidgetState.selected) ? Colors.white : GColors.text2),
        trackColor: WidgetStateProperty.resolveWith((s) =>
          s.contains(WidgetState.selected) ? GColors.brand : GColors.bg2),
      ),
    );
  }

  // ─── Light theme ───────────────────────────────────────────────────────
  // Counterpart to dark. Widgets that use Theme.of(context).colorScheme.*
  // automatically adapt. Widgets using hardcoded GColors.* stay dark for
  // now — migrate them to GColors.of(context).* on a per-screen basis.
  static ThemeData get light {
    final base = ThemeData.light(useMaterial3: true);
    final c = const GColorsPalette.light();
    final textTheme = GoogleFonts.interTextTheme(base.textTheme).copyWith(
      displayLarge:  TextStyle(color: c.text0, fontWeight: FontWeight.w900, letterSpacing: -1.5),
      displayMedium: TextStyle(color: c.text0, fontWeight: FontWeight.w800, letterSpacing: -1),
      displaySmall:  TextStyle(color: c.text0, fontWeight: FontWeight.w700, letterSpacing: -0.5),
      headlineLarge: TextStyle(color: c.text0, fontWeight: FontWeight.w800, letterSpacing: -0.5),
      headlineMedium:TextStyle(color: c.text0, fontWeight: FontWeight.w700),
      headlineSmall: TextStyle(color: c.text0, fontWeight: FontWeight.w700),
      titleLarge:    TextStyle(color: c.text0, fontWeight: FontWeight.w700, letterSpacing: -0.3),
      titleMedium:   TextStyle(color: c.text0, fontWeight: FontWeight.w600),
      titleSmall:    TextStyle(color: c.text1, fontWeight: FontWeight.w600),
      bodyLarge:     TextStyle(color: c.text0, fontWeight: FontWeight.w400),
      bodyMedium:    TextStyle(color: c.text1, fontWeight: FontWeight.w400),
      bodySmall:     TextStyle(color: c.text2, fontWeight: FontWeight.w400, fontSize: 12),
      labelLarge:    TextStyle(color: c.text0, fontWeight: FontWeight.w700, letterSpacing: 0.5),
      labelMedium:   TextStyle(color: c.text1, fontWeight: FontWeight.w600, letterSpacing: 0.3),
      labelSmall:    TextStyle(color: c.text2, fontWeight: FontWeight.w500, fontSize: 10),
    );

    return base.copyWith(
      brightness: Brightness.light,
      scaffoldBackgroundColor: c.bg0,
      colorScheme: ColorScheme.light(
        // Same semantics as dark — brand is primary, gold is reward.
        primary:   c.brand,
        onPrimary: Colors.white,
        secondary: c.gold,
        onSecondary: Colors.black,
        tertiary:  c.pink,
        surface:   c.bg1,
        onSurface: c.text0,
        error:     c.rose,
        outline:   c.border,
      ),
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: c.bg0,
        foregroundColor: c.text0,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
        titleTextStyle: GoogleFonts.inter(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: c.text0,
          letterSpacing: -0.3,
        ),
        systemOverlayStyle: SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.dark,
          systemNavigationBarColor: c.bg0,
          systemNavigationBarIconBrightness: Brightness.dark,
        ),
      ),
      cardTheme: CardThemeData(
        color: c.bg1,
        elevation: 0,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(16)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: c.bg2,
        hintStyle: TextStyle(color: c.text2, fontSize: 14),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
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
          borderSide: BorderSide(color: c.brand, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: c.rose),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: c.brand,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w700),
          minimumSize: const Size(0, 48),
        ),
      ),
      dividerTheme: DividerThemeData(color: c.border, thickness: 1, space: 0),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: GColors.lightBg1,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: c.bg1,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: c.bg2,
        contentTextStyle: GoogleFonts.inter(color: c.text0, fontWeight: FontWeight.w500),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        behavior: SnackBarBehavior.floating,
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: c.brand,
        linearTrackColor: c.bg2,
      ),
    );
  }
}
