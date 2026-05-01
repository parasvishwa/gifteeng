// ─── Gifteeng Design System — Token Sheet ─────────────────────────────────────
//
// Single source of truth for all spacing, radii, typography and elevation
// values. Every widget in the app should reference these instead of using
// magic numbers.
//
// How to use:
//   Container(
//     decoration: BoxDecoration(
//       color:        GColors.bg1,
//       borderRadius: DS.rrCard,     // ← use the pre-built BorderRadius objects
//     ),
//   )
//
//   Text('Hello', style: DS.labelMd)   // ← use the TextStyle shorthands
//
//   Padding(padding: DS.padScreen)     // ← use the EdgeInsets shorthands
//
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

abstract final class DS {
  // ─── Radii — raw doubles ──────────────────────────────────────────────────
  static const double rCard    = 16;   // standard card / surface
  static const double rLarge   = 20;   // hero card, bottom sheet
  static const double rButton  = 12;   // primary / secondary CTA
  static const double rInput   = 12;   // text field
  static const double rChip    = 8;    // category & filter chips
  static const double rThumb   = 10;   // image thumbnails
  static const double rSmall   = 6;    // tiny accents (stripes, dots)
  static const double rPill    = 999;  // pill / badge shape

  // ─── Radii — pre-built BorderRadius objects ───────────────────────────────
  static const rrCard   = BorderRadius.all(Radius.circular(rCard));
  static const rrLarge  = BorderRadius.all(Radius.circular(rLarge));
  static const rrButton = BorderRadius.all(Radius.circular(rButton));
  static const rrInput  = BorderRadius.all(Radius.circular(rInput));
  static const rrChip   = BorderRadius.all(Radius.circular(rChip));
  static const rrThumb  = BorderRadius.all(Radius.circular(rThumb));
  static const rrSmall  = BorderRadius.all(Radius.circular(rSmall));
  static const rrPill   = BorderRadius.all(Radius.circular(rPill));
  static const rrSheet  = BorderRadius.vertical(top: Radius.circular(rLarge));

  // ─── Spacing — strict 4pt grid (4 / 8 / 12 / 16 / 24 / 32) ─────────────
  static const double sp4   =  4;
  static const double sp8   =  8;
  static const double sp12  = 12;
  static const double sp16  = 16;
  static const double sp24  = 24;
  static const double sp32  = 32;

  // Semantic aliases
  static const double spScreen  = sp16;  // horizontal page margin
  static const double spCard    = sp16;  // inner card padding
  static const double spCardSm  = sp12;  // inner card padding (compact)
  static const double spSection = sp32;  // vertical gap between sections (≈28→32)
  static const double spItem    = sp12;  // gap between list items
  static const double spInline  = sp8;   // inline gap (icon + label)
  static const double spMicro   = sp4;   // micro gap

  // ─── EdgeInsets shorthands ────────────────────────────────────────────────
  static const padScreen  = EdgeInsets.symmetric(horizontal: spScreen);
  static const padCard    = EdgeInsets.all(spCard);
  static const padCardSm  = EdgeInsets.all(spCardSm);

  // ─── Typography — font sizes ──────────────────────────────────────────────
  static const double fsDisplay = 28;
  static const double fsH1      = 22;
  static const double fsH2      = 18;
  static const double fsH3      = 16;
  static const double fsBody    = 13;
  static const double fsBodySm  = 12;
  static const double fsCaption = 10.5;
  static const double fsLabel   =  9;

  // ─── Font weights ─────────────────────────────────────────────────────────
  static const wBlack  = FontWeight.w900;
  static const wBold   = FontWeight.w800;
  static const wSemi   = FontWeight.w700;
  static const wMedium = FontWeight.w600;
  static const wNormal = FontWeight.w500;
  static const wLight  = FontWeight.w400;

  // ─── TextStyle shorthands (Google Inter) ─────────────────────────────────
  /// 28px / w900 — hero numbers, large prices
  static final tsDisplay = GoogleFonts.inter(
    fontSize: fsDisplay, fontWeight: wBlack, letterSpacing: -0.5);

  /// 22px / w800 — section hero title
  static final tsH1 = GoogleFonts.inter(
    fontSize: fsH1, fontWeight: wBold, letterSpacing: -0.3);

  /// 18px / w800 — section header
  static final tsH2 = GoogleFonts.inter(
    fontSize: fsH2, fontWeight: wBold, letterSpacing: -0.2);

  /// 16px / w700 — card title
  static final tsH3 = GoogleFonts.inter(
    fontSize: fsH3, fontWeight: wSemi, letterSpacing: -0.1);

  /// 13px / w700 — body strong
  static final tsBodyBold = GoogleFonts.inter(
    fontSize: fsBody, fontWeight: wSemi, letterSpacing: -0.1);

  /// 13px / w500 — body regular
  static final tsBody = GoogleFonts.inter(
    fontSize: fsBody, fontWeight: wNormal);

  /// 12px / w600 — small label
  static final tsBodySm = GoogleFonts.inter(
    fontSize: fsBodySm, fontWeight: wMedium);

  /// 10.5px / w500 — caption
  static final tsCaption = GoogleFonts.inter(
    fontSize: fsCaption, fontWeight: wNormal);

  /// 9px / w700 — eyebrow / tab label
  static final tsLabel = GoogleFonts.inter(
    fontSize: fsLabel, fontWeight: wBold, letterSpacing: 0.5);

  // ─── Elevation / Shadow ───────────────────────────────────────────────────
  /// Subtle card lift — use on elevated cards in dark bg0 context.
  static const List<BoxShadow> shadowCard = [
    BoxShadow(
      color: Color(0x14000000),
      blurRadius: 12,
      offset: Offset(0, 4),
    ),
  ];

  /// Stronger shadow — hero / floating cards.
  static const List<BoxShadow> shadowFloat = [
    BoxShadow(
      color: Color(0x28000000),
      blurRadius: 24,
      offset: Offset(0, 8),
    ),
  ];
}
