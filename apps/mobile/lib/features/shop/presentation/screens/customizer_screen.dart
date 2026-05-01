import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:gap/gap.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/g_button.dart';
import '../../../../core/widgets/gift_image.dart' show resolveImageUrl;
import '../widgets/full_canvas_editor.dart';
import '../../../cart/presentation/screens/cart_screen.dart' show cartProvider;
import '../../../home/presentation/screens/shell_screen.dart' show cartItemCountProvider;

// ─────────────────────────────────────────────────────────────────────────────
// Models — mirror SimpleZone / CustomizerConfig from web
// ─────────────────────────────────────────────────────────────────────────────

class SimpleZone {
  final String id;
  final double x, y, w, h; // percent 0-100
  final String label;
  final String shape; // "free" | "square" | "circle" | "oval" | "custom-image"
  /// Corner radius for "free" / "square" shapes — percentage of the zone's
  /// smaller dimension (0 = sharp, 50 = pill). Mirrors the web admin slider.
  /// Ignored for "circle" (always 50%) and "custom-image" (uses silhouette).
  final double cornerRadius;
  final String? maskImageUrl;
  final List<Map<String, dynamic>> allowedIcons;
  final List<String> allowedFonts;
  final List<String> allowedColors;
  final double defaultFontSizePct;
  final int fontWeight;
  // Customiser v2 — runtime per-zone toggles (text zones only).
  final bool customerCanDrag;   // drag text within the zone bounding box
  final bool customerCanResize; // show the size slider in the editor

  const SimpleZone({
    required this.id,
    required this.x,
    required this.y,
    required this.w,
    required this.h,
    required this.label,
    this.shape = 'free',
    this.cornerRadius = 8,
    this.maskImageUrl,
    this.allowedIcons = const [],
    this.allowedFonts = const [],
    this.allowedColors = const [],
    this.defaultFontSizePct = 70,
    this.fontWeight = 600,
    this.customerCanDrag = false,
    this.customerCanResize = false,
  });

  factory SimpleZone.fromJson(Map<String, dynamic> j) => SimpleZone(
        id: j['id']?.toString() ?? '',
        x: _toDouble(j['x']),
        y: _toDouble(j['y']),
        w: _toDouble(j['w']),
        h: _toDouble(j['h']),
        label: j['label']?.toString() ?? '',
        shape: j['shape']?.toString() ?? 'free',
        cornerRadius: j['cornerRadius'] == null ? 8 : _toDouble(j['cornerRadius']),
        maskImageUrl: () {
          final raw = j['maskImageUrl']?.toString();
          if (raw == null || raw.isEmpty) return null;
          return resolveImageUrl(raw);
        }(),
        allowedIcons: (j['allowedIcons'] as List? ?? [])
            .map((e) {
              if (e is Map) return Map<String, dynamic>.from(e);
              if (e is String) return {'id': e, 'label': e, 'url': e};
              return <String, dynamic>{};
            })
            .where((m) => m.isNotEmpty)
            .toList(),
        allowedFonts: (j['allowedFonts'] as List? ?? [])
            .map((e) => e?.toString() ?? '')
            .where((s) => s.isNotEmpty)
            .toList(),
        allowedColors: (j['allowedColors'] as List? ?? [])
            .map((e) => e?.toString() ?? '')
            .where((s) => s.isNotEmpty)
            .toList(),
        defaultFontSizePct: _toDouble(j['defaultFontSize'] ?? 70),
        fontWeight: _toInt(j['fontWeight']) ?? 600,
        customerCanDrag: j['customerCanDrag'] == true,
        customerCanResize: j['customerCanResize'] == true,
      );

  static int? _toInt(dynamic v) {
    if (v == null) return null;
    if (v is num) return v.toInt();
    return int.tryParse(v.toString());
  }

  static double _toDouble(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MaskSlot — mirrors admin's MaskSlot in
// apps/web/app/b2b/super-admin/customizer/page.tsx and the
// SimpleMaskSlot in packages/ui/src/components/simple-zone-customizer.tsx.
// Geometry helper `pathForShape` below is a direct translation of the
// web `shapePath(shape, 0, 0, w, h)` function — DO NOT change one without
// changing both, otherwise mobile and web visuals will diverge.
// ─────────────────────────────────────────────────────────────────────────────

/// Allowed mask shapes (kept as a constant string set to mirror the JSON).
/// "none" / unknown values render as a no-op (skipped at the call site).
const Set<String> kMaskShapes = {
  'none',
  'rect',
  'rounded-rect',
  'circle',
  'oval',
  'heart',
  'hexagon',
  'arch',
  'star',
  'diamond',
  'pentagon',
  'custom-image',
};

class MaskSlot {
  final String id;
  final String label;
  final String shape; // one of kMaskShapes
  final String? maskImageUrl; // resolved absolute URL, only for shape "custom-image"
  /// Position rect, percent (0-100) of the canvas.
  final double x, y, w, h;
  final bool required;

  const MaskSlot({
    required this.id,
    required this.label,
    required this.shape,
    this.maskImageUrl,
    required this.x,
    required this.y,
    required this.w,
    required this.h,
    this.required = false,
  });

  factory MaskSlot.fromJson(Map<String, dynamic> j) {
    final pos = (j['pos'] is Map)
        ? Map<String, dynamic>.from(j['pos'] as Map)
        : <String, dynamic>{};
    double dnum(dynamic v, double dflt) {
      if (v == null) return dflt;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? dflt;
    }
    final raw = j['maskImageUrl']?.toString();
    final resolved = (raw == null || raw.isEmpty) ? null : resolveImageUrl(raw);
    return MaskSlot(
      id: j['id']?.toString() ?? '',
      label: j['label']?.toString() ?? 'Upload your photo',
      shape: j['shape']?.toString() ?? 'rect',
      maskImageUrl: resolved,
      x: dnum(pos['x'], 20),
      y: dnum(pos['y'], 20),
      w: dnum(pos['w'], 60),
      h: dnum(pos['h'], 60),
      required: j['required'] == true,
    );
  }

  /// Round-trip the mask back into the cart payload so the schema is preserved.
  /// Mirrors the keys the web admin emits in MaskSlot.
  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        'shape': shape,
        if (maskImageUrl != null && maskImageUrl!.isNotEmpty)
          'maskImageUrl': maskImageUrl,
        'pos': {'x': x, 'y': y, 'w': w, 'h': h},
        'required': required,
      };
}

/// Build a Flutter [Path] for the given mask shape, sized to [size].
///
/// **This must stay byte-identical to the web `shapePath(shape, 0, 0, w, h)`**
/// in `apps/web/app/b2b/super-admin/customizer/page.tsx` and
/// `packages/ui/src/components/simple-zone-customizer.tsx`. Any geometry
/// tweak there requires the same tweak here.
Path pathForShape(String shape, Size size) {
  final w = size.width;
  final h = size.height;
  final cx = w / 2;
  final cy = h / 2;
  final path = Path();
  switch (shape) {
    case 'rect':
      path.addRect(Rect.fromLTWH(0, 0, w, h));
      return path;
    case 'rounded-rect': {
      // Web: r = min(w, h) * 0.12
      final r = (w < h ? w : h) * 0.12;
      path.addRRect(RRect.fromRectAndRadius(
        Rect.fromLTWH(0, 0, w, h),
        Radius.circular(r),
      ));
      return path;
    }
    case 'circle': {
      // Web: r = min(w, h) / 2 → circle inscribed in the rect.
      final r = (w < h ? w : h) / 2;
      path.addOval(Rect.fromCircle(center: Offset(cx, cy), radius: r));
      return path;
    }
    case 'oval': {
      // Web: rx = w/2, ry = h/2 → ellipse fills the full rect.
      path.addOval(Rect.fromLTWH(0, 0, w, h));
      return path;
    }
    case 'heart': {
      // Web:
      //   sx = w/2, sy = h*0.25
      //   M sx,h
      //   C 0,h*0.6  0,h*0.1  sx,sy
      //   C w,h*0.1  w,h*0.6  sx,h
      final sx = w / 2;
      final sy = h * 0.25;
      path.moveTo(sx, h);
      path.cubicTo(0, h * 0.6, 0, h * 0.1, sx, sy);
      path.cubicTo(w, h * 0.1, w, h * 0.6, sx, h);
      path.close();
      return path;
    }
    case 'hexagon': {
      // Web: r = min(w,h)/2; angle = π/3 * i - π/6 for i in [0..5]
      final r = (w < h ? w : h) / 2;
      for (var i = 0; i < 6; i++) {
        final a = (3.141592653589793 / 3) * i - 3.141592653589793 / 6;
        final px = cx + r * math.cos(a);
        final py = cy + r * math.sin(a);
        if (i == 0) {
          path.moveTo(px, py);
        } else {
          path.lineTo(px, py);
        }
      }
      path.close();
      return path;
    }
    case 'arch': {
      // Web: M0,h V cy Q0,0 cx,0 Q w,0 w,cy V h Z
      path.moveTo(0, h);
      path.lineTo(0, cy);
      path.quadraticBezierTo(0, 0, cx, 0);
      path.quadraticBezierTo(w, 0, w, cy);
      path.lineTo(w, h);
      path.close();
      return path;
    }
    case 'star': {
      // Web: 10-point alternating outer/inner; rOut = min(w,h)/2, rIn = rOut*0.4
      // angle = (π/5)*i - π/2
      final rOut = (w < h ? w : h) / 2;
      final rIn = rOut * 0.4;
      for (var i = 0; i < 10; i++) {
        final a = (3.141592653589793 / 5) * i - 3.141592653589793 / 2;
        final r = i.isEven ? rOut : rIn;
        final px = cx + r * math.cos(a);
        final py = cy + r * math.sin(a);
        if (i == 0) {
          path.moveTo(px, py);
        } else {
          path.lineTo(px, py);
        }
      }
      path.close();
      return path;
    }
    case 'diamond':
      // Web: M cx,0 L w,cy L cx,h L 0,cy Z
      path.moveTo(cx, 0);
      path.lineTo(w, cy);
      path.lineTo(cx, h);
      path.lineTo(0, cy);
      path.close();
      return path;
    case 'pentagon': {
      // Web: r = min(w,h)/2; angle = (2π/5)*i - π/2 for i in [0..4]
      final r = (w < h ? w : h) / 2;
      for (var i = 0; i < 5; i++) {
        final a = (2 * 3.141592653589793 / 5) * i - 3.141592653589793 / 2;
        final px = cx + r * math.cos(a);
        final py = cy + r * math.sin(a);
        if (i == 0) {
          path.moveTo(px, py);
        } else {
          path.lineTo(px, py);
        }
      }
      path.close();
      return path;
    }
    default:
      // "none", "custom-image", unknown — empty path; renderer special-cases.
      return path;
  }
}

class CustomizerConfig {
  final String editor;
  final String baseImage;
  final String? overlayImage;
  final List<SimpleZone> imageZones;
  final List<SimpleZone> textZones;
  final List<MaskSlot> masks;

  const CustomizerConfig({
    required this.editor,
    required this.baseImage,
    this.overlayImage,
    required this.imageZones,
    required this.textZones,
    this.masks = const [],
  });

  bool get hasZones =>
      imageZones.isNotEmpty || textZones.isNotEmpty || masks.isNotEmpty;

  /// True when the admin has explicitly chosen the simple/zone editor.
  /// We honour this even if zones are empty (admin may still be configuring),
  /// to match the web's behaviour: editor === "simple" forces simple mode.
  bool get prefersSimple => editor.toLowerCase() == 'simple';

  factory CustomizerConfig.fromProduct(Map<String, dynamic> product) {
    // ── Resolve metadata (may be Map or JSON-encoded String from Prisma) ──
    Map meta = {};
    final rawMeta = product['metadata'];
    if (rawMeta is Map) {
      meta = rawMeta;
    } else if (rawMeta is String && rawMeta.isNotEmpty) {
      try {
        final decoded = json.decode(rawMeta);
        if (decoded is Map) meta = decoded;
      } catch (_) {}
    }

    // ── Resolve metadata.customizer (may be Map or JSON string) ──
    Map customizer = {};
    final rawCustomizer = meta['customizer'];
    if (rawCustomizer is Map) {
      customizer = rawCustomizer;
    } else if (rawCustomizer is String && rawCustomizer.isNotEmpty) {
      try {
        final decoded = json.decode(rawCustomizer);
        if (decoded is Map) customizer = decoded;
      } catch (_) {}
    }

    // ── Resolve canvas: supports BOTH storage formats ──
    //   Production format: metadata.customizer.canvas = { editor, imageZones, ... }
    //   Flat format:       metadata.customizer       = { editor, imageZones, ... }
    Map canvas = {};
    final rawCanvas = customizer['canvas'];
    if (rawCanvas is Map && rawCanvas.isNotEmpty) {
      canvas = rawCanvas;
    } else if (rawCanvas is String && rawCanvas.isNotEmpty) {
      try {
        final decoded = json.decode(rawCanvas);
        if (decoded is Map) canvas = decoded;
      } catch (_) {}
    } else if (customizer.containsKey('imageZones') ||
               customizer.containsKey('textZones') ||
               customizer.containsKey('editor')) {
      // Flat format — customizer IS the canvas
      canvas = customizer;
    }
    final images = product['images'] as List? ?? [];
    // First image: String or {alt, url} — resolve to absolute URL
    final defaultBase =
        images.isNotEmpty ? (resolveImageUrl(images.first) ?? '') : '';

    // Resolve relative paths (e.g. "/api/files/...") → absolute URLs
    final rawBase = canvas['baseImage']?.toString() ??
        canvas['base_image']?.toString();
    final baseResolved = rawBase == null || rawBase.isEmpty
        ? defaultBase
        : (resolveImageUrl(rawBase) ?? defaultBase);

    final rawOverlay = canvas['overlayImage']?.toString() ??
        canvas['overlay_image']?.toString();
    final overlayResolved = rawOverlay == null || rawOverlay.isEmpty
        ? null
        : resolveImageUrl(rawOverlay);

    return CustomizerConfig(
      editor: canvas['editor']?.toString() ?? 'simple',
      baseImage: baseResolved,
      overlayImage: overlayResolved,
      imageZones: List<Map<String, dynamic>>.from(
              canvas['imageZones'] ?? canvas['image_zones'] ?? [])
          .map(SimpleZone.fromJson)
          .toList(),
      textZones: List<Map<String, dynamic>>.from(
              canvas['textZones'] ?? canvas['text_zones'] ?? [])
          .map(SimpleZone.fromJson)
          .toList(),
      // Phase 2: masks[] from the unified Customiser. Mirrors web's
      // SimpleMaskSlot[] / MaskSlot[]. Empty/missing → no masks (existing
      // behaviour preserved for products that haven't enabled masks).
      masks: List<Map<String, dynamic>>.from(canvas['masks'] ?? const [])
          .map(MaskSlot.fromJson)
          .where((m) => m.shape != 'none')
          .toList(),
    );
  }
}

class TextStyleChoice {
  final String? fontFamily;
  final String? fontColor;
  final double fontSizePct;

  const TextStyleChoice({
    this.fontFamily,
    this.fontColor,
    this.fontSizePct = 70,
  });

  Map<String, dynamic> toJson() => {
        if (fontFamily != null) 'fontFamily': fontFamily,
        if (fontColor != null) 'fontColor': fontColor,
        'fontSizePct': fontSizePct,
      };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

Color _hexColor(String hex) {
  final s = hex.replaceAll('#', '');
  if (s.length == 6) return Color(int.parse('FF$s', radix: 16));
  if (s.length == 8) return Color(int.parse(s, radix: 16));
  return Colors.black;
}

FontWeight _fw(int w) {
  switch (w) {
    case 300: return FontWeight.w300;
    case 400: return FontWeight.w400;
    case 500: return FontWeight.w500;
    case 700: return FontWeight.w700;
    case 800: return FontWeight.w800;
    case 900: return FontWeight.w900;
    default:  return FontWeight.w600;
  }
}

Future<ui.Image> _loadUiImage(String url) {
  final completer = Completer<ui.Image>();
  final provider = CachedNetworkImageProvider(url);
  final stream = provider.resolve(const ImageConfiguration());
  late ImageStreamListener listener;
  listener = ImageStreamListener(
    (info, _) {
      if (!completer.isCompleted) completer.complete(info.image);
      stream.removeListener(listener);
    },
    onError: (e, _) {
      if (!completer.isCompleted) completer.completeError(e);
      stream.removeListener(listener);
    },
  );
  stream.addListener(listener);
  return completer.future;
}

// Design templates from admin (used by template picker)
final _designTemplatesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/design-templates',
        queryParameters: {'isActive': 'true', 'pageSize': '50'});
    final data = res.data;
    if (data is List) return List<Map<String, dynamic>>.from(data);
    if (data is Map) {
      return List<Map<String, dynamic>>.from(
          data['items'] ?? data['data'] ?? []);
    }
    return [];
  } catch (_) {
    return [];
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

class CustomizerScreen extends ConsumerStatefulWidget {
  final Map<String, dynamic> product;
  const CustomizerScreen({super.key, required this.product});

  @override
  ConsumerState<CustomizerScreen> createState() => _CustomizerScreenState();
}

/// Per-design fill state (multiple designs supported for Pack-of-N orders).
class _SimpleDesign {
  final Map<String, Uint8List> imgBytes = {};
  final Map<String, String> imgUrls = {};
  final Map<String, String> texts = {};
  final Map<String, TextStyleChoice> textStyles = {};
  final Map<String, double> imgScales = {};       // zoom per image zone
  final Map<String, double> imgRotations = {};    // rotation (degrees) per image zone
  // Customiser v2 — per-text-zone customer drag offset, % of zone w/h.
  // Only populated for zones whose SimpleZone.customerCanDrag === true.
  final Map<String, Offset> textPositions = {};
  // Phase 2 — per-mask customer-uploaded photos (keyed by MaskSlot.id).
  // Mirrors web's SimpleCustomizerFills.maskImages map.
  final Map<String, Uint8List> maskBytes = {};
  final Map<String, String> maskUrls = {};
  // Per-mask zoom + rotation. Mirror of web's maskScales / maskRotations.
  // Customer taps a filled mask → bottom sheet → zoom slider + rotate knob.
  final Map<String, double> maskScales = {};
  final Map<String, double> maskRotations = {};

  bool get hasAnyFill =>
      imgBytes.isNotEmpty ||
      imgUrls.isNotEmpty ||
      maskBytes.isNotEmpty ||
      maskUrls.isNotEmpty ||
      texts.values.any((t) => t.isNotEmpty);
}

class _CustomizerScreenState extends ConsumerState<CustomizerScreen> {
  late final CustomizerConfig _cfg;

  // ── Fill state (list of designs for Add-another-design flow) ────────────
  final List<_SimpleDesign> _designs = [_SimpleDesign()];
  int _activeDesign = 0;

  // Short-hand getters for the currently active design — keeps the rest of
  // the code working as-is without sprinkling `_designs[_activeDesign]` calls.
  Map<String, Uint8List> get _imgBytes      => _designs[_activeDesign].imgBytes;
  Map<String, String>    get _imgUrls       => _designs[_activeDesign].imgUrls;
  Map<String, String>    get _texts         => _designs[_activeDesign].texts;
  Map<String, TextStyleChoice> get _textStyles => _designs[_activeDesign].textStyles;
  Map<String, double>    get _imgScales     => _designs[_activeDesign].imgScales;
  Map<String, double>    get _imgRotations  => _designs[_activeDesign].imgRotations;
  Map<String, Offset>    get _textPositions => _designs[_activeDesign].textPositions;
  // Phase 2 — mask fill maps for the active design.
  Map<String, Uint8List> get _maskBytes      => _designs[_activeDesign].maskBytes;
  Map<String, String>    get _maskUrls       => _designs[_activeDesign].maskUrls;
  Map<String, double>    get _maskScales     => _designs[_activeDesign].maskScales;
  Map<String, double>    get _maskRotations  => _designs[_activeDesign].maskRotations;

  // ── Template state (full canvas mode) ─────────────────────────────────────
  String? _selectedTemplateJson; // set when user picks a template in full canvas mode
  int _templateKey = 0;          // incremented to force FullCanvasEditor rebuild

  // ── Canvas aspect ratio (loaded from image) ────────────────────────────────
  double _canvasAR  = 1.0;
  bool   _baseImgOk = true; // false when base image URL fails to load

  // ── Designs list ───────────────────────────────────────────────────────────
  int _qty = 1;
  bool _saving = false;

  // ── Fallback text fields (when no zones configured) ────────────────────────
  final _nameCtrl    = TextEditingController();
  final _messageCtrl = TextEditingController();
  String? _occasion;
  String  _font = 'Inter';

  @override
  void initState() {
    super.initState();
    _cfg = CustomizerConfig.fromProduct(widget.product);
    if (_cfg.baseImage.isNotEmpty) _prefetchAspectRatio();
    _hydrateExistingCustomization();
  }

  /// If the user is editing an existing cart item, `widget.product` contains
  /// `__existingCustomization`. Pre-populate the UI fields so they can tweak
  /// rather than re-creating from scratch.
  ///
  /// Handles both single-design (`fills`) and multi-design (`designs:[...]`)
  /// payloads so "Add another design → cart → Edit" restores all designs.
  void _hydrateExistingCustomization() {
    final existing = widget.product['__existingCustomization'];
    if (existing is! Map) return;

    if (existing['__simpleZones'] == true) {
      if (existing['__multiDesign'] == true) {
        // ── Multi-design case: restore every design in the list ────────────
        final designsList = (existing['designs'] as List?) ?? [];
        _designs.clear();
        for (final raw in designsList) {
          if (raw is! Map) continue;
          final d        = _SimpleDesign();
          final images   = (raw['images']        as Map?) ?? {};
          final texts    = (raw['texts']          as Map?) ?? {};
          final styles   = (raw['textStyles']     as Map?) ?? {};
          final scales   = (raw['imageScales']    as Map?) ?? {};
          final rotations = (raw['imageRotations'] as Map?) ?? {};
          final textPos  = (raw['textPositions']   as Map?) ?? {};
          final maskImgs = (raw['maskImages']      as Map?) ?? {};
          final maskSc   = (raw['maskScales']      as Map?) ?? {};
          final maskRot  = (raw['maskRotations']   as Map?) ?? {};
          _hydrateDesign(d, images, texts, styles, scales, rotations, textPos, maskImgs, maskSc, maskRot);
          _designs.add(d);
        }
        if (_designs.isEmpty) _designs.add(_SimpleDesign());
        _activeDesign = 0;
      } else {
        // ── Single-design case (original behaviour) ────────────────────────
        final fills    = (existing['fills']     as Map?) ?? {};
        final images   = (fills['images']       as Map?) ?? {};
        final texts    = (fills['texts']         as Map?) ?? {};
        final styles   = (fills['textStyles']    as Map?) ?? {};
        final scales   = (fills['imageScales']   as Map?) ?? {};
        final rotations = (fills['imageRotations'] as Map?) ?? {};
        final textPos  = (fills['textPositions'] as Map?) ?? {};
        final maskImgs = (fills['maskImages']    as Map?) ?? {};
        final maskSc   = (existing['maskScales']    as Map?) ?? (fills['maskScales']    as Map?) ?? {};
        final maskRot  = (existing['maskRotations'] as Map?) ?? (fills['maskRotations'] as Map?) ?? {};
        _hydrateDesign(_designs[0], images, texts, styles, scales, rotations, textPos, maskImgs, maskSc, maskRot);
      }
    }

    // Legacy text-only form
    if (existing['recipientName'] != null) {
      _nameCtrl.text = existing['recipientName'].toString();
    }
    if (existing['message'] != null) {
      _messageCtrl.text = existing['message'].toString();
    }
    if (existing['occasion'] != null) {
      _occasion = existing['occasion'].toString();
    }
    if (existing['font'] != null) {
      _font = existing['font'].toString();
    }
  }

  /// Populate a single `_SimpleDesign` from raw fill maps.
  void _hydrateDesign(
    _SimpleDesign d,
    Map images,
    Map texts,
    Map styles,
    Map scales,
    Map rotations, [
    Map textPositions = const {},
    Map maskImages = const {},
    Map maskScales = const {},
    Map maskRotations = const {},
  ]) {
    images.forEach((k, v) {
      final s = v?.toString() ?? '';
      if (s.startsWith('data:')) {
        try {
          final comma = s.indexOf(',');
          if (comma > 0) d.imgBytes[k.toString()] = base64Decode(s.substring(comma + 1));
        } catch (_) {}
      } else if (s.isNotEmpty) {
        // Resolve relative paths (e.g. "/api/files/...") to absolute URLs so
        // CachedNetworkImage can fetch them. This matters when restoring
        // designs uploaded from the web — the web saves relative paths.
        d.imgUrls[k.toString()] = resolveImageUrl(s) ?? s;
      }
    });
    texts.forEach((k, v) => d.texts[k.toString()] = v?.toString() ?? '');
    styles.forEach((k, v) {
      if (v is Map) {
        d.textStyles[k.toString()] = TextStyleChoice(
          fontFamily:  v['fontFamily']?.toString(),
          fontColor:   v['fontColor']?.toString(),
          fontSizePct: (v['fontSizePct'] as num?)?.toDouble() ?? 70,
        );
      }
    });
    scales.forEach((k, v) {
      if (v is num) d.imgScales[k.toString()] = v.toDouble();
    });
    rotations.forEach((k, v) {
      if (v is num) d.imgRotations[k.toString()] = v.toDouble();
    });
    textPositions.forEach((k, v) {
      if (v is Map) {
        final dx = (v['dxPct'] as num?)?.toDouble() ?? 0;
        final dy = (v['dyPct'] as num?)?.toDouble() ?? 0;
        d.textPositions[k.toString()] = Offset(dx, dy);
      }
    });
    // Phase 2 — restore customer-uploaded mask photos. Same dataURL/URL split
    // as image zones (see above). Web saves these in fills.maskImages.
    maskImages.forEach((k, v) {
      final s = v?.toString() ?? '';
      if (s.startsWith('data:')) {
        try {
          final comma = s.indexOf(',');
          if (comma > 0) {
            d.maskBytes[k.toString()] = base64Decode(s.substring(comma + 1));
          }
        } catch (_) {}
      } else if (s.isNotEmpty) {
        d.maskUrls[k.toString()] = resolveImageUrl(s) ?? s;
      }
    });
    // Phase 3 — restore per-mask zoom + rotation. Web stores these as
    // top-level maskScales / maskRotations alongside imageScales / imageRotations.
    maskScales.forEach((k, v) {
      if (v is num) d.maskScales[k.toString()] = v.toDouble();
    });
    maskRotations.forEach((k, v) {
      if (v is num) d.maskRotations[k.toString()] = v.toDouble();
    });
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _messageCtrl.dispose();
    super.dispose();
  }

  Future<void> _prefetchAspectRatio() async {
    try {
      final img = await _loadUiImage(_cfg.baseImage);
      if (mounted && img.height > 0) {
        setState(() { _canvasAR = img.width / img.height; _baseImgOk = true; });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _baseImgOk = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Could not load product template image. '
              'Try refreshing or contact support.',
            style: GoogleFonts.inter(fontWeight: FontWeight.w500)),
          behavior: SnackBarBehavior.floating,
          backgroundColor: const Color(0xFFDC2626),
          duration: const Duration(seconds: 5),
          action: SnackBarAction(
            label: 'Dismiss',
            textColor: Colors.white,
            onPressed: () =>
                ScaffoldMessenger.of(context).hideCurrentSnackBar(),
          ),
        ));
      }
    }
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  String get _productId {
    final p = widget.product;
    return (p['id'] ?? p['_id'] ?? p['productId'] ?? '').toString();
  }

  int get _basePrice {
    final p = widget.product;
    final v = p['basePrice'] ?? p['price'] ?? p['salePrice'] ?? 0;
    if (v is num) return v.toInt();
    return int.tryParse(v.toString()) ?? double.tryParse(v.toString())?.toInt() ?? 0;
  }

  bool get _hasAnyFill => _designs.any((d) => d.hasAnyFill);
  bool get _activeHasFill => _designs[_activeDesign].hasAnyFill;

  // ── Design management ─────────────────────────────────────────────────────

  void _addAnotherDesign() {
    HapticFeedback.mediumImpact();
    setState(() {
      _designs.add(_SimpleDesign());
      _activeDesign = _designs.length - 1;
    });
  }

  void _switchDesign(int i) {
    if (i < 0 || i >= _designs.length) return;
    HapticFeedback.selectionClick();
    setState(() => _activeDesign = i);
  }

  void _removeDesign(int i) {
    if (_designs.length == 1) return;
    HapticFeedback.mediumImpact();
    setState(() {
      _designs.removeAt(i);
      if (_activeDesign >= _designs.length) _activeDesign = _designs.length - 1;
    });
  }

  // ── Image zone handlers ────────────────────────────────────────────────────

  Future<void> _onImgZoneTap(SimpleZone z) async {
    if (z.allowedIcons.isNotEmpty) {
      await _showIconPicker(z);
    } else if (_imgBytes[z.id] != null || _imgUrls[z.id] != null) {
      // Already has an image → show zoom/rotate edit sheet
      _showImgEditSheet(z);
    } else {
      await _pickImage(z.id);
    }
  }

  Future<void> _pickImage(String zoneId) async {
    try {
      final xf = await ImagePicker()
          .pickImage(source: ImageSource.gallery, imageQuality: 85);
      if (xf == null) return;
      final bytes = await xf.readAsBytes();
      if (mounted) {
        setState(() {
          _imgBytes[zoneId] = bytes;
          _imgUrls.remove(zoneId);
        });
      }
    } catch (e) {
      if (mounted) _snack('Could not open gallery: $e', GColors.rose);
    }
  }

  void _clearImg(String id) =>
      setState(() { _imgBytes.remove(id); _imgUrls.remove(id); });

  // ── Mask handlers (Phase 2) ────────────────────────────────────────────────
  // Customer can only fill masks (admin owns positioning + shape). Tap → photo
  // picker → photo gets clipped to the mask shape inside the renderer.

  Future<void> _onMaskTap(MaskSlot m) async {
    if (_maskBytes[m.id] != null || _maskUrls[m.id] != null) {
      // Already filled — replace or clear.
      await _showMaskActions(m);
    } else {
      await _pickMaskImage(m.id);
    }
  }

  Future<void> _pickMaskImage(String maskId) async {
    try {
      final xf = await ImagePicker()
          .pickImage(source: ImageSource.gallery, imageQuality: 85);
      if (xf == null) return;
      final bytes = await xf.readAsBytes();
      if (mounted) {
        setState(() {
          _maskBytes[maskId] = bytes;
          _maskUrls.remove(maskId);
        });
      }
    } catch (e) {
      if (mounted) _snack('Could not open gallery: $e', GColors.rose);
    }
  }

  void _clearMask(String id) => setState(() {
        _maskBytes.remove(id);
        _maskUrls.remove(id);
        // Phase 3 — reset zoom + rotation when the photo's removed so the
        // next upload starts at 1×/0° (matches web).
        _maskScales.remove(id);
        _maskRotations.remove(id);
      });

  Future<void> _showMaskActions(MaskSlot m) async {
    // Filled masks open the same Zoom + Rotate sheet that image zones use.
    // The sheet is generic on (scale, rotation, replace, remove) so we pass
    // the mask-specific callbacks. Keeps web/Flutter UX consistent.
    final initScale  = _maskScales[m.id]    ?? 1.0;
    final initRotate = _maskRotations[m.id] ?? 0.0;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: GColors.of(context).bg1,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _ImgEditSheet(
        zone: SimpleZone(
          id: m.id, x: m.x, y: m.y, w: m.w, h: m.h,
          label: m.label, shape: m.shape,
        ),
        bytes: _maskBytes[m.id],
        url:   _maskUrls[m.id],
        initialScale:    initScale,
        initialRotation: initRotate,
        onApply: (scale, rotation) {
          setState(() {
            _maskScales[m.id]    = scale;
            _maskRotations[m.id] = rotation;
          });
        },
        onRemove: () => setState(() {
          _maskBytes.remove(m.id);
          _maskUrls.remove(m.id);
          _maskScales.remove(m.id);
          _maskRotations.remove(m.id);
        }),
        onReplace: () async {
          await _pickMaskImage(m.id);
          setState(() {
            _maskScales.remove(m.id);
            _maskRotations.remove(m.id);
          });
        },
      ),
    );
  }

  // ── Text zone handlers ─────────────────────────────────────────────────────

  void _clearText(String id) =>
      setState(() {
        _texts.remove(id);
        _textStyles.remove(id);
        _textPositions.remove(id);
      });

  // ── Save ───────────────────────────────────────────────────────────────────

  Future<void> _save() async {
    if (_cfg.hasZones && !_hasAnyFill) {
      _snack('Fill at least one slot before proceeding.', GColors.of(context).bg2);
      return;
    }
    setState(() => _saving = true);
    try {
      final Map<String, dynamic> customization;

      if (_cfg.hasZones) {
        // Build SimpleCustomizerPayload — same format as web.
        // If there's only one design, emit the original single-design shape.
        // If multiple, wrap in `designs: [...]` to preserve Pack-of-N intent.

        Map<String, dynamic> _designFills(_SimpleDesign d) {
          final images = <String, String>{};
          for (final e in d.imgBytes.entries) {
            images[e.key] = 'data:image/jpeg;base64,${base64Encode(e.value)}';
          }
          for (final e in d.imgUrls.entries) {
            images[e.key] = e.value;
          }
          // Phase 2 — mask fills, mirrors web's SimpleCustomizerFills.maskImages
          final maskImages = <String, String>{};
          for (final e in d.maskBytes.entries) {
            maskImages[e.key] =
                'data:image/jpeg;base64,${base64Encode(e.value)}';
          }
          for (final e in d.maskUrls.entries) {
            maskImages[e.key] = e.value;
          }
          return {
            'images': images,
            'texts': Map<String, String>.from(d.texts),
            'textStyles':
                d.textStyles.map((k, v) => MapEntry(k, v.toJson())),
            if (d.imgScales.isNotEmpty)
              'imageScales': Map<String, double>.from(d.imgScales),
            if (d.imgRotations.isNotEmpty)
              'imageRotations': Map<String, double>.from(d.imgRotations),
            if (d.textPositions.isNotEmpty)
              'textPositions': d.textPositions.map(
                (k, v) => MapEntry(k, {'dxPct': v.dx, 'dyPct': v.dy}),
              ),
            if (maskImages.isNotEmpty) 'maskImages': maskImages,
            // Phase 3 — per-mask zoom + rotation. Web reads these from the
            // top-level payload, but we also nest them in the design so
            // multi-design saves preserve per-design transforms.
            if (d.maskScales.isNotEmpty)
              'maskScales': Map<String, double>.from(d.maskScales),
            if (d.maskRotations.isNotEmpty)
              'maskRotations': Map<String, double>.from(d.maskRotations),
          };
        }

        final zoneDefs = {
          'imageZones': _cfg.imageZones.map((z) => {
                'id': z.id,
                'x': z.x, 'y': z.y, 'w': z.w, 'h': z.h,
                'label': z.label,
                'shape': z.shape,
                if (z.maskImageUrl != null) 'maskImageUrl': z.maskImageUrl,
              }).toList(),
          'textZones': _cfg.textZones.map((z) => {
                'id': z.id,
                'x': z.x, 'y': z.y, 'w': z.w, 'h': z.h,
                'label': z.label,
                if (z.allowedFonts.isNotEmpty) 'allowedFonts': z.allowedFonts,
                if (z.allowedColors.isNotEmpty) 'allowedColors': z.allowedColors,
                if (z.customerCanDrag)   'customerCanDrag':   true,
                if (z.customerCanResize) 'customerCanResize': true,
              }).toList(),
          // Phase 2 — round-trip mask schema so the cart payload matches the
          // web's SimpleCustomizerPayload (admin-defined shape + position).
          if (_cfg.masks.isNotEmpty)
            'masks': _cfg.masks.map((m) => m.toJson()).toList(),
        };

        if (_designs.length == 1) {
          customization = {
            '__simpleZones': true,
            'baseImage': _cfg.baseImage,
            if (_cfg.overlayImage != null) 'overlayImage': _cfg.overlayImage,
            ...zoneDefs,
            'fills': _designFills(_designs.first),
          };
        } else {
          customization = {
            '__simpleZones': true,
            '__multiDesign': true,
            'baseImage': _cfg.baseImage,
            if (_cfg.overlayImage != null) 'overlayImage': _cfg.overlayImage,
            ...zoneDefs,
            'designs': _designs.map(_designFills).toList(),
          };
        }
      } else {
        // Fallback — old text-only format
        customization = {
          if (_nameCtrl.text.trim().isNotEmpty)
            'recipientName': _nameCtrl.text.trim(),
          if (_messageCtrl.text.trim().isNotEmpty)
            'message': _messageCtrl.text.trim(),
          if (_occasion != null) 'occasion': _occasion,
          'font': _font,
        };
      }

      // Edit mode: delete old cart item + re-add with new customization.
      // Regular mode: just add a new item.
      final dio = ref.read(dioProvider);
      final existingItemId = widget.product['__cartItemId']?.toString();
      if (existingItemId != null && existingItemId.isNotEmpty) {
        try { await dio.delete('/cart/items/$existingItemId'); } catch (_) {}
      }
      await dio.post('/cart/items', data: {
        'productId': _productId,
        'qty': _qty,
        'customization': customization,
      });

      if (mounted) {
        _snack(
          existingItemId != null && existingItemId.isNotEmpty
            ? 'Design updated in cart! ✨'
            : 'Personalized gift added to cart! 🎁',
          GColors.emerald,
        );
        // Critical: refresh cart state so the new item appears + badge updates
        ref.invalidate(cartProvider);
        ref.invalidate(cartItemCountProvider);
        // Navigate to cart so user sees what they added
        context.go('/cart');
      }
    } on DioException catch (e) {
      final data = e.response?.data;
      String msg = 'Could not save. Try again.';
      if (data is Map) {
        final m = data['message'];
        if (m is String && m.isNotEmpty) msg = m;
        if (m is List && m.isNotEmpty) msg = m.first.toString();
      }
      if (mounted) _snack(msg, const Color(0xFF2A0A14));
    } catch (e) {
      if (mounted) _snack('Error: $e', const Color(0xFF2A0A14));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _snack(String msg, Color bg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg,
          style: GoogleFonts.inter(fontWeight: FontWeight.w600)),
      backgroundColor: bg,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build
  // ─────────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    // Prefer SIMPLE zone editor when:
    //   • The product has zones configured (imageZones / textZones), OR
    //   • The admin explicitly set editor="simple" (web matches this behaviour).
    // Only fall back to the free-form FULL canvas editor when neither holds.
    final useSimple = _cfg.hasZones || _cfg.prefersSimple;
    if (!useSimple) return _buildFullCanvasScaffold();

    final _c = GColors.of(context);
    return Scaffold(
      backgroundColor: _c.bg0,
      body: Column(
        children: [
          _Header(
            title: widget.product['title']?.toString() ??
                'Personalise your product',
            price: _basePrice,
            onBack: () => context.pop(),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.only(bottom: 24),
              child: _buildZoneCanvas(),
            ),
          ),
          _BottomBar(
            qty: _qty,
            price: _basePrice,
            saving: _saving,
            onQtyDec: _qty > 1 ? () => setState(() => _qty--) : null,
            onQtyInc: () => setState(() => _qty++),
            onSave: _saving ? null : _save,
          ),
        ],
      ),
    );
  }

  // Free-form canvas editor (for products without zone config)
  Widget _buildFullCanvasScaffold() {
    final _c = GColors.of(context);
    return Scaffold(
      backgroundColor: _c.bg0,
      body: Column(
        children: [
          _Header(
            title: widget.product['title']?.toString() ??
                'Personalise your product',
            price: _basePrice,
            onBack: () => context.pop(),
          ),
          Consumer(builder: (context, ref, _) {
            final tAsync = ref.watch(_designTemplatesProvider);
            return tAsync.maybeWhen(
              data: (templates) {
                if (templates.isEmpty) return const SizedBox.shrink();
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    border: Border(bottom: BorderSide(color: GColors.of(context).border)),
                  ),
                  child: GestureDetector(
                    onTap: () => _showTemplatePicker(templates),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                          decoration: BoxDecoration(
                            color: GColors.brand.withValues(alpha: 0.10),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: GColors.brand.withValues(alpha: 0.35)),
                          ),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            const Text('🎨', style: TextStyle(fontSize: 14)),
                            const Gap(6),
                            Text(
                              _selectedTemplateJson != null
                                  ? 'Change template'
                                  : 'Start from a template',
                              style: GoogleFonts.inter(
                                  fontSize: 12, fontWeight: FontWeight.w700,
                                  color: GColors.brand),
                            ),
                            const Gap(6),
                            Icon(Icons.chevron_right_rounded, size: 16, color: GColors.brand),
                          ]),
                        ),
                        if (_selectedTemplateJson != null) ...[
                          const Gap(8),
                          GestureDetector(
                            onTap: () => setState(() {
                              _selectedTemplateJson = null;
                              _templateKey++;
                            }),
                            child: Text('Clear', style: GoogleFonts.inter(
                                fontSize: 11, color: GColors.of(context).text2)),
                          ),
                        ],
                      ],
                    ),
                  ),
                );
              },
              orElse: () => const SizedBox.shrink(),
            );
          }),
          Expanded(
            child: _cfg.baseImage.isEmpty
                ? Center(
                    child: Text(
                      'No design image for this product yet.',
                      style: TextStyle(color: _c.text2),
                    ),
                  )
                : !_baseImgOk
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(32),
                          child: Column(mainAxisSize: MainAxisSize.min, children: [
                            const Text('😕', style: TextStyle(fontSize: 48)),
                            const SizedBox(height: 16),
                            Text('Could not load template image',
                              textAlign: TextAlign.center,
                              style: GoogleFonts.inter(
                                fontSize: 15, fontWeight: FontWeight.w700,
                                color: _c.text0)),
                            const SizedBox(height: 8),
                            Text('Check your internet connection and try again.',
                              textAlign: TextAlign.center,
                              style: GoogleFonts.inter(
                                fontSize: 13, color: _c.text2)),
                            const SizedBox(height: 20),
                            TextButton(
                              onPressed: () {
                                setState(() => _baseImgOk = true);
                                _prefetchAspectRatio();
                              },
                              child: Text('Retry',
                                style: GoogleFonts.inter(color: GColors.brand,
                                    fontWeight: FontWeight.w700)),
                            ),
                          ]),
                        ),
                      )
                    : FullCanvasEditor(
                    key: ValueKey(_templateKey),
                    baseImageUrl: _cfg.baseImage,
                    aspectRatio: _canvasAR,
                    onSave: (payload) => _saveFullCanvas(payload),
                    initialCanvasJson: _selectedTemplateJson,
                  ),
          ),
        ],
      ),
    );
  }

  Future<void> _saveFullCanvas(Map<String, dynamic> payload) async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      final dio = ref.read(dioProvider);
      final existingItemId = widget.product['__cartItemId']?.toString();
      if (existingItemId != null && existingItemId.isNotEmpty) {
        try { await dio.delete('/cart/items/$existingItemId'); } catch (_) {}
      }
      await dio.post('/cart/items', data: {
        'productId': _productId,
        'qty': _qty,
        'customization': payload,
      });
      if (mounted) {
        _snack(
          existingItemId != null && existingItemId.isNotEmpty
            ? 'Design updated! ✨'
            : 'Personalized gift added to cart! 🎁',
          GColors.emerald,
        );
        ref.invalidate(cartProvider);
        ref.invalidate(cartItemCountProvider);
        context.go('/cart');
      }
    } on DioException catch (e) {
      final data = e.response?.data;
      String msg = 'Could not save. Try again.';
      if (data is Map) {
        final m = data['message'];
        if (m is String && m.isNotEmpty) msg = m;
      }
      if (mounted) _snack(msg, const Color(0xFF2A0A14));
    } catch (e) {
      if (mounted) _snack('Error: $e', const Color(0xFF2A0A14));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // ─── Zone-based canvas ────────────────────────────────────────────────────

  Widget _buildZoneCanvas() {
    final _c = GColors.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Base image error banner
        if (!_baseImgOk)
          Container(
            margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF450A0A),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFF87171).withValues(alpha: 0.4)),
            ),
            child: Row(children: [
              const Icon(Icons.broken_image_outlined,
                  color: Color(0xFFF87171), size: 18),
              const SizedBox(width: 10),
              Expanded(child: Text(
                'Product template image could not be loaded. Preview may be incomplete.',
                style: GoogleFonts.inter(
                    fontSize: 12, color: const Color(0xFFF87171)),
              )),
              GestureDetector(
                onTap: () {
                  setState(() => _baseImgOk = true);
                  _prefetchAspectRatio();
                },
                child: Text('Retry',
                    style: GoogleFonts.inter(
                        fontSize: 12, fontWeight: FontWeight.w700,
                        color: const Color(0xFFF87171))),
              ),
            ]),
          ),

        // Mode badge — confirms simple zone editor is active + zone count.
        Padding(
          padding: const EdgeInsets.fromLTRB(0, 12, 0, 4),
          child: Center(
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: GColors.emerald.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: GColors.emerald.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.grid_view_rounded, size: 11, color: GColors.emerald),
                      const Gap(4),
                      Text('SIMPLE CUSTOMISER · ${_cfg.imageZones.length}+${_cfg.textZones.length} zones',
                          style: GoogleFonts.inter(
                              fontSize: 9,
                              fontWeight: FontWeight.w900,
                              color: GColors.emerald,
                              letterSpacing: 0.6)),
                    ],
                  ),
                ),
                const Gap(4),
                Text('Tap a highlighted slot to upload an image or add text',
                    style: GoogleFonts.inter(
                        fontSize: 11, color: _c.text2)),
              ],
            ),
          ),
        ),

        // Template inspiration strip (zone mode)
        Consumer(builder: (context, ref, _) {
          final tAsync = ref.watch(_designTemplatesProvider);
          return tAsync.maybeWhen(
            data: (templates) {
              if (templates.isEmpty) return const SizedBox.shrink();
              final c = GColors.of(context);
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 6),
                    child: Row(children: [
                      Text('✨ Templates', style: GoogleFonts.inter(
                          fontSize: 12, fontWeight: FontWeight.w800, color: c.text0)),
                      const Spacer(),
                      GestureDetector(
                        onTap: () => _showTemplatePicker(templates),
                        child: Text('See all', style: GoogleFonts.inter(
                            fontSize: 11, fontWeight: FontWeight.w600, color: GColors.brand)),
                      ),
                    ]),
                  ),
                  SizedBox(
                    height: 84,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: templates.length.clamp(0, 8),
                      separatorBuilder: (_, __) => const Gap(8),
                      itemBuilder: (_, i) {
                        final t = templates[i];
                        final preview = t['previewUrl']?.toString() ?? '';
                        final name = t['name']?.toString() ?? 'Template';
                        return GestureDetector(
                          onTap: () => _applyZoneTemplate(t),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 60, height: 60,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(color: c.border),
                                  color: c.bg2,
                                ),
                                clipBehavior: Clip.antiAlias,
                                child: preview.isNotEmpty
                                    ? CachedNetworkImage(imageUrl: preview, fit: BoxFit.cover,
                                        errorWidget: (_, __, ___) => const Center(
                                          child: Text('🎨', style: TextStyle(fontSize: 20))))
                                    : const Center(child: Text('🎨', style: TextStyle(fontSize: 20))),
                              ),
                              const Gap(4),
                              SizedBox(
                                width: 60,
                                child: Text(name, maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    textAlign: TextAlign.center,
                                    style: GoogleFonts.inter(
                                        fontSize: 9, fontWeight: FontWeight.w600,
                                        color: c.text2)),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
                  const Gap(4),
                ],
              );
            },
            orElse: () => const SizedBox.shrink(),
          );
        }),

        // Canvas
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Container(
              decoration: BoxDecoration(
                color: _c.bg1,
                border: Border.all(color: _c.border),
                borderRadius: BorderRadius.circular(12),
              ),
              child: LayoutBuilder(
                builder: (ctx, constraints) {
                  final w = constraints.maxWidth;
                  final h = w / _canvasAR;
                  return SizedBox(
                    width: w,
                    height: h,
                    child: Stack(
                      children: [
                        // Base image
                        if (_cfg.baseImage.isNotEmpty)
                          Positioned.fill(
                            child: CachedNetworkImage(
                              imageUrl: _cfg.baseImage,
                              fit: BoxFit.cover,
                              errorWidget: (_, __, ___) => Container(
                                color: _c.bg2,
                                child: Center(
                                    child: Icon(Icons.image_not_supported_outlined,
                                        color: _c.text2)),
                              ),
                            ),
                          ),

                        // Mask overlays (Phase 2) — z-order matches web's
                        // composePreview: base → masks → image zones → text
                        // zones → top overlay. Renders even when there are no
                        // image/text zones.
                        for (final m in _cfg.masks)
                          _maskOverlay(m, w, h),

                        // Image zone overlays
                        for (final z in _cfg.imageZones)
                          _imgZoneOverlay(z, w, h),

                        // Text zone overlays
                        for (final z in _cfg.textZones)
                          _txtZoneOverlay(z, w, h),

                        // Top overlay frame
                        if (_cfg.overlayImage != null)
                          Positioned.fill(
                            child: IgnorePointer(
                              child: CachedNetworkImage(
                                imageUrl: _cfg.overlayImage!,
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ),
        ),

        // Zone list
        _ZoneListPanel(
          imageZones: _cfg.imageZones,
          textZones: _cfg.textZones,
          masks: _cfg.masks,
          imgBytes: _imgBytes,
          imgUrls: _imgUrls,
          texts: _texts,
          maskBytes: _maskBytes,
          maskUrls: _maskUrls,
          onImgTap: _onImgZoneTap,
          onTxtTap: (z) => _showTextEditor(z),
          onMaskTap: _onMaskTap,
        ),

        const Gap(12),

        // Designs panel
        _DesignsPanel(
          designs: _designs,
          activeIndex: _activeDesign,
          onSwitch: _switchDesign,
          onAdd: _addAnotherDesign,
          onRemove: _removeDesign,
        ),

        if (!_hasAnyFill) ...[
          const Gap(8),
          Center(
            child: Text('Fill at least one slot before proceeding',
                style: GoogleFonts.inter(
                    fontSize: 11, color: _c.text2)),
          ),
        ],
      ],
    );
  }

  // ─── Mask overlay (Phase 2) ───────────────────────────────────────────────

  Widget _maskOverlay(MaskSlot m, double cw, double ch) {
    final bytes = _maskBytes[m.id];
    final url   = _maskUrls[m.id];
    final filled = bytes != null || url != null;

    return Positioned(
      left:   m.x / 100 * cw,
      top:    m.y / 100 * ch,
      width:  m.w / 100 * cw,
      height: m.h / 100 * ch,
      child: GestureDetector(
        onTap: () => _onMaskTap(m),
        child: filled
            ? _FilledMaskZone(
                mask: m,
                bytes: bytes,
                url: url,
                scale:    _maskScales[m.id]    ?? 1.0,
                rotation: _maskRotations[m.id] ?? 0.0,
                onClear: () => _clearMask(m.id),
              )
            : _EmptyMaskZone(mask: m),
      ),
    );
  }

  // ─── Image zone overlay ───────────────────────────────────────────────────

  Widget _imgZoneOverlay(SimpleZone z, double cw, double ch) {
    final bytes = _imgBytes[z.id];
    final url   = _imgUrls[z.id];
    final filled = bytes != null || url != null;

    return Positioned(
      left:   z.x / 100 * cw,
      top:    z.y / 100 * ch,
      width:  z.w / 100 * cw,
      height: z.h / 100 * ch,
      child: GestureDetector(
        onTap: () => _onImgZoneTap(z),
        child: filled
            ? _FilledImgZone(
                zone: z,
                bytes: bytes,
                url: url,
                scale: _imgScales[z.id] ?? 1.0,
                rotation: _imgRotations[z.id] ?? 0.0,
                onClear: () => _clearImg(z.id),
              )
            : _EmptyImgZone(zone: z),
      ),
    );
  }

  // ─── Text zone overlay ────────────────────────────────────────────────────

  Widget _txtZoneOverlay(SimpleZone z, double cw, double ch) {
    final text  = _texts[z.id] ?? '';
    final style = _textStyles[z.id];
    final filled = text.isNotEmpty;
    final zoneW = z.w / 100 * cw;
    final zoneH = z.h / 100 * ch;
    // Customiser v2 — runtime drag offset (% of zone w/h), only meaningful
    // when admin ticked customerCanDrag for this zone.
    final pos = _textPositions[z.id] ?? Offset.zero;
    final canDrag = z.customerCanDrag && filled;

    return Positioned(
      left:   z.x / 100 * cw,
      top:    z.y / 100 * ch,
      width:  zoneW,
      height: zoneH,
      child: GestureDetector(
        onTap: () => _showTextEditor(z),
        // Pan drag only fires when admin allowed it. Translates pixel delta
        // into % of zone w/h and clamps so the anchor stays in the box.
        onPanUpdate: canDrag
            ? (d) {
                final newDx = (pos.dx + d.delta.dx / zoneW * 100)
                    .clamp(-50.0, 50.0);
                final newDy = (pos.dy + d.delta.dy / zoneH * 100)
                    .clamp(-50.0, 50.0);
                setState(() {
                  _textPositions[z.id] = Offset(newDx, newDy);
                });
              }
            : null,
        child: filled
            ? _FilledTxtZone(
                zone: z,
                text: text,
                style: style,
                zoneHeightPx: zoneH,
                dragOffsetPct: pos,
                onClear: () => _clearText(z.id),
              )
            : _EmptyTxtZone(zone: z),
      ),
    );
  }

  // ─── Fallback text form ───────────────────────────────────────────────────

  Widget _buildFallback() {
    final _c = GColors.of(context);
    const occasions = [
      '🎂 Birthday', '💍 Anniversary', '💑 Wedding', '🎓 Graduation',
      '🎄 Christmas', '💝 Valentine\'s', '👩‍👧 Mother\'s Day',
      '👨‍👧 Father\'s Day', '✨ Just Because', '🏆 Achievement',
    ];
    const fonts = ['Inter', 'Serif Classic', 'Script', 'Bold Block'];

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _label('✏️  Recipient Name'),
          const Gap(8),
          _field(_nameCtrl, 'Who is this gift for?', 1),
          const Gap(14),
          _label('💬  Personal Message'),
          const Gap(8),
          _field(_messageCtrl, 'Write something from the heart…', 4),
          const Gap(22),
          _label('🎉  Occasion'),
          const Gap(10),
          Wrap(
            spacing: 8, runSpacing: 8,
            children: occasions.map((o) {
              final sel = _occasion == o;
              return GestureDetector(
                onTap: () => setState(() => _occasion = sel ? null : o),
                child: AnimatedContainer(
                  duration: 150.ms,
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: sel
                        ? GColors.brand.withValues(alpha: 0.12)
                        : _c.bg1,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                        color: sel ? GColors.brand : _c.border,
                        width: sel ? 1.5 : 1),
                  ),
                  child: Text(o,
                      style: GoogleFonts.inter(
                          fontSize: 12,
                          fontWeight: sel
                              ? FontWeight.w700
                              : FontWeight.w500,
                          color: sel ? GColors.brand : _c.text1)),
                ),
              );
            }).toList(),
          ),
          const Gap(22),
          _label('🖋️  Font'),
          const Gap(10),
          SizedBox(
            height: 46,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: fonts.length,
              separatorBuilder: (_, __) => const Gap(8),
              itemBuilder: (_, i) {
                final f = fonts[i];
                final sel = _font == f;
                return GestureDetector(
                  onTap: () => setState(() => _font = f),
                  child: AnimatedContainer(
                    duration: 150.ms,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(
                      color: sel
                          ? GColors.brand.withValues(alpha: 0.12)
                          : _c.bg1,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                          color: sel ? GColors.brand : _c.border,
                          width: sel ? 1.5 : 1),
                    ),
                    child: Text(f,
                        style: GoogleFonts.inter(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: sel ? GColors.brand : _c.text1)),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _label(String t) => Text(t,
      style: GoogleFonts.inter(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: GColors.of(context).text0));

  Widget _field(
      TextEditingController ctrl, String hint, int maxLines) =>
      TextField(
        controller: ctrl,
        maxLines: maxLines,
        onChanged: (_) => setState(() {}),
        style: GoogleFonts.inter(fontSize: 14, color: GColors.of(context).text0),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle:
              GoogleFonts.inter(fontSize: 14, color: GColors.of(context).text2),
        ),
      );

  // ─── Modals ───────────────────────────────────────────────────────────────

  Future<void> _showIconPicker(SimpleZone z) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: GColors.of(context).bg1,
      shape: const RoundedRectangleBorder(
          borderRadius:
              BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _IconPickerSheet(
        zone: z,
        currentUrl: _imgUrls[z.id],
        onPick: (url) {
          setState(() {
            _imgUrls[z.id] = url;
            _imgBytes.remove(z.id);
          });
          Navigator.pop(context);
        },
        onUpload: () async {
          Navigator.pop(context);
          await _pickImage(z.id);
        },
        onClear: () {
          _clearImg(z.id);
          Navigator.pop(context);
        },
      ),
    );
  }

  void _showTextEditor(SimpleZone z) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: GColors.of(context).bg1,
      shape: const RoundedRectangleBorder(
          borderRadius:
              BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _TextEditorSheet(
        zone: z,
        initialText: _texts[z.id] ?? '',
        initialStyle: _textStyles[z.id],
        onSave: (text, style) {
          setState(() {
            if (text.isNotEmpty) {
              _texts[z.id] = text;
              _textStyles[z.id] = style;
            } else {
              _clearText(z.id);
            }
          });
        },
      ),
    );
  }

  // ── Template methods ───────────────────────────────────────────────────────

  /// Apply a template to zone-based mode by pre-filling text zones
  /// from the template's text objects (best-effort).
  void _applyZoneTemplate(Map<String, dynamic> template) {
    final jsonStr = template['canvasJson'];
    if (jsonStr == null) return;
    try {
      final Map<String, dynamic> parsed = jsonStr is String
          ? jsonDecode(jsonStr) as Map<String, dynamic>
          : Map<String, dynamic>.from(jsonStr as Map);
      final objects = (parsed['objects'] as List?) ?? [];
      // Extract text objects in order
      final textValues = objects
          .whereType<Map>()
          .where((o) =>
              (o['type']?.toString() ?? '').startsWith('text') ||
              o['type'] == 'i-text')
          .map((o) => o['text']?.toString() ?? '')
          .where((t) => t.isNotEmpty)
          .toList();

      if (textValues.isEmpty) {
        _snack('No text found in template — start with a blank canvas', GColors.of(context).bg2);
        return;
      }
      setState(() {
        // Pre-fill text zones in order with template text values
        for (var i = 0; i < _cfg.textZones.length && i < textValues.length; i++) {
          _texts[_cfg.textZones[i].id] = textValues[i];
        }
      });
      HapticFeedback.selectionClick();
      _snack('Template applied — tap zones to customise ✨', GColors.emerald);
    } catch (_) {
      _snack('Could not apply template', GColors.of(context).bg2);
    }
  }

  void _showTemplatePicker(List<Map<String, dynamic>> templates) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: GColors.of(context).bg1,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _TemplatePickerSheet(
        templates: templates,
        isFullCanvas: !_cfg.hasZones,
        onPickFull: (json) {
          setState(() {
            _selectedTemplateJson = json;
            _templateKey++;
          });
          Navigator.pop(context);
          HapticFeedback.selectionClick();
        },
        onPickZone: (template) {
          Navigator.pop(context);
          _applyZoneTemplate(template);
        },
      ),
    );
  }

  // ── Image edit sheet (zoom + rotate) ──────────────────────────────────────

  void _showImgEditSheet(SimpleZone z) {
    final initScale  = _imgScales[z.id]    ?? 1.0;
    final initRotate = _imgRotations[z.id] ?? 0.0;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: GColors.of(context).bg1,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _ImgEditSheet(
        zone: z,
        bytes: _imgBytes[z.id],
        url: _imgUrls[z.id],
        initialScale: initScale,
        initialRotation: initRotate,
        onApply: (scale, rotation) {
          setState(() {
            _imgScales[z.id]    = scale;
            _imgRotations[z.id] = rotation;
          });
        },
        onRemove: () => setState(() {
          _imgBytes.remove(z.id);
          _imgUrls.remove(z.id);
          _imgScales.remove(z.id);
          _imgRotations.remove(z.id);
        }),
        onReplace: () async {
          await _pickImage(z.id);
          setState(() {
            _imgScales.remove(z.id);
            _imgRotations.remove(z.id);
          });
        },
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-widgets
// ─────────────────────────────────────────────────────────────────────────────

// ── Header ────────────────────────────────────────────────────────────────────

class _Header extends StatelessWidget {
  final String title;
  final int price;
  final VoidCallback onBack;
  const _Header(
      {required this.title, required this.price, required this.onBack});

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    final _c  = GColors.of(context);
    return Container(
      padding: EdgeInsets.fromLTRB(12, top + 8, 16, 12),
      decoration: BoxDecoration(
        color: _c.bg0,
        border: Border(bottom: BorderSide(color: _c.border)),
      ),
      child: Row(
        children: [
          GestureDetector(
            onTap: onBack,
            child: Icon(Icons.arrow_back_ios_new_rounded,
                size: 18, color: _c.text0),
          ),
          const Gap(10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: _c.text0)),
                Text('Personalise your product',
                    style: GoogleFonts.inter(
                        fontSize: 11, color: _c.text2)),
              ],
            ),
          ),
          Text('₹$price',
              style: GoogleFonts.inter(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: GColors.rose)),
        ],
      ),
    );
  }
}

// ── Bottom bar ─────────────────────────────────────────────────────────────────

class _BottomBar extends StatelessWidget {
  final int qty, price;
  final bool saving;
  final VoidCallback? onQtyDec, onSave;
  final VoidCallback onQtyInc;

  const _BottomBar({
    required this.qty,
    required this.price,
    required this.saving,
    required this.onQtyDec,
    required this.onQtyInc,
    required this.onSave,
  });

  @override
  Widget build(BuildContext context) {
    // Customizer pushes via the root navigator (above the shell), so the
    // bottom tab bar is hidden during customization. We only need to
    // pad for the system safe area now — was +62 to clear the tab bar
    // and producing a visible empty band on every device.
    final bot = MediaQuery.of(context).padding.bottom;
    final _c  = GColors.of(context);
    return Container(
      padding: EdgeInsets.fromLTRB(14, 8, 14, bot + 8),
      decoration: BoxDecoration(
        color: _c.bg0,
        border: Border(top: BorderSide(color: _c.border)),
      ),
      child: Row(
        children: [
          // Qty stepper — compact single-row layout to leave more space
          // for the primary CTA on the right.
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _QtyBtn(icon: Icons.remove, onTap: onQtyDec),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: Text('$qty',
                    style: GoogleFonts.inter(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: _c.text0)),
              ),
              _QtyBtn(icon: Icons.add, onTap: onQtyInc),
            ],
          ),
          const Gap(10),
          // CTA — sized down so it doesn't dominate the footer. Was a
          // 56-px tall bar that ate ⅓ of the screen on small devices.
          Expanded(
            child: SizedBox(
              height: 44,
              child: GButton(
                label: saving
                    ? 'Saving…'
                    : 'Save & Proceed · ₹${price * qty}',
                loading: saving,
                onPressed: onSave,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _QtyBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  const _QtyBtn({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final _c = GColors.of(context);
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: 120.ms,
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: onTap != null
              ? _c.bg2
              : _c.bg2.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _c.border),
        ),
        child: Icon(icon,
            size: 16,
            color: onTap != null ? _c.text0 : _c.text2),
      ),
    );
  }
}

// ── Filled image zone ──────────────────────────────────────────────────────────

class _FilledImgZone extends StatefulWidget {
  final SimpleZone zone;
  final Uint8List? bytes;
  final String? url;
  final double scale;
  final double rotation; // degrees
  final VoidCallback onClear;
  const _FilledImgZone(
      {required this.zone,
      this.bytes,
      this.url,
      this.scale = 1.0,
      this.rotation = 0.0,
      required this.onClear});

  @override
  State<_FilledImgZone> createState() => _FilledImgZoneState();
}

class _FilledImgZoneState extends State<_FilledImgZone> {
  ui.Image? _mask;

  @override
  void initState() {
    super.initState();
    if (widget.zone.shape == 'custom-image' &&
        widget.zone.maskImageUrl != null) {
      _loadMask();
    }
  }

  Future<void> _loadMask() async {
    try {
      final img = await _loadUiImage(widget.zone.maskImageUrl!);
      if (mounted) setState(() => _mask = img);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    Widget img;
    if (widget.bytes != null) {
      img = Image.memory(widget.bytes!,
          fit: BoxFit.cover,
          width: double.infinity,
          height: double.infinity);
    } else {
      img = CachedNetworkImage(
          imageUrl: widget.url!,
          fit: BoxFit.cover,
          width: double.infinity,
          height: double.infinity);
    }

    // Apply zoom + rotation
    if (widget.scale != 1.0 || widget.rotation != 0.0) {
      img = Transform(
        alignment: Alignment.center,
        transform: Matrix4.identity()
          ..rotateZ(widget.rotation * 3.14159265358979 / 180)
          ..scale(widget.scale),
        child: img,
      );
    }

    Widget clipped;
    final z = widget.zone;
    if (z.shape == 'circle' || z.shape == 'oval') {
      // ClipOval clips to an ellipse fitting the parent box. For "circle"
      // the parent is forced to a 1:1 box upstream, giving a true circle;
      // for "oval" the parent stays rectangular, giving an ellipse.
      clipped = ClipOval(child: img);
    } else if (z.shape == 'custom-image' && _mask != null) {
      clipped = ShaderMask(
        blendMode: BlendMode.dstIn,
        shaderCallback: (rect) => ImageShader(
          _mask!,
          TileMode.clamp,
          TileMode.clamp,
          Matrix4.identity().storage,
        ),
        child: img,
      );
    } else {
      clipped = img;
    }

    // Match the web admin's borderRadius semantics by computing the radius
    // off the actual rendered zone size (LayoutBuilder gives us pixels):
    //   • circle  → inner SQUARE of side min(w_px, h_px) so it renders as a
    //               TRUE circle even when the zone's bounding rectangle is
    //               not square (parity with the customer/admin web logic).
    //   • oval    → fills the full rectangle, fully-rounded ellipse outline.
    //   • free / square → admin-controlled cornerRadius slider (0–50%) of
    //               the zone's smaller dimension.
    return LayoutBuilder(builder: (ctx, c) {
      final shorter = c.maxWidth < c.maxHeight ? c.maxWidth : c.maxHeight;
      final longer  = c.maxWidth > c.maxHeight ? c.maxWidth : c.maxHeight;

      if (z.shape == 'circle') {
        final radius = BorderRadius.circular(shorter / 2);
        return Center(
          child: SizedBox(
            width: shorter,
            height: shorter,
            child: Stack(
              fit: StackFit.expand,
              children: [
                Container(
                  decoration: BoxDecoration(
                    border: Border.all(
                        color: GColors.rose.withValues(alpha: 0.7),
                        width: 2),
                    borderRadius: radius,
                  ),
                  child: ClipRRect(
                      borderRadius: radius, child: clipped),
                ),
                Positioned(
                  top: 3, right: 3,
                  child: GestureDetector(
                    onTap: widget.onClear,
                    child: Container(
                      width: 22, height: 22,
                      decoration: const BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle),
                      child: const Icon(Icons.close,
                          size: 13, color: Colors.black87),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      }

      final BorderRadius radius;
      if (z.shape == 'oval') {
        radius = BorderRadius.circular(longer / 2);
      } else {
        final pct = z.cornerRadius.clamp(0, 50) / 100.0;
        radius = BorderRadius.circular(shorter * pct);
      }

      return Stack(
        fit: StackFit.expand,
        children: [
          Container(
            decoration: BoxDecoration(
              border: Border.all(
                  color: GColors.rose.withValues(alpha: 0.7),
                  width: 2),
              borderRadius: radius,
            ),
            child: ClipRRect(
                borderRadius: radius, child: clipped),
          ),
        Positioned(
          top: 3, right: 3,
          child: GestureDetector(
            onTap: widget.onClear,
            child: Container(
              width: 22, height: 22,
              decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle),
              child: const Icon(Icons.close,
                  size: 13, color: Colors.black87),
            ),
          ),
        ),
      ],
    );
    });
  }
}

// ── Empty image zone ───────────────────────────────────────────────────────────

class _EmptyImgZone extends StatelessWidget {
  final SimpleZone zone;
  const _EmptyImgZone({required this.zone});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (ctx, c) {
      final shorter = c.maxWidth < c.maxHeight ? c.maxWidth : c.maxHeight;
      final longer  = c.maxWidth > c.maxHeight ? c.maxWidth : c.maxHeight;

      // Inner content of the placeholder — same in every shape.
      final inner = Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.upload_rounded,
                size: 22,
                color: GColors.rose.withValues(alpha: 0.85)),
            const Gap(4),
            Text(zone.label,
                textAlign: TextAlign.center,
                maxLines: 2,
                style: GoogleFonts.inter(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: GColors.rose.withValues(alpha: 0.9))),
          ],
        ),
      );

      // For circle, force the placeholder onto a square box of side
      // min(w_px, h_px) so the dashed outline is a TRUE circle even when
      // the zone's bounding rectangle is not square (parity with web).
      if (zone.shape == 'circle') {
        return Center(
          child: SizedBox(
            width: shorter,
            height: shorter,
            child: Container(
              decoration: BoxDecoration(
                color: GColors.rose.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(shorter / 2),
                border: Border.all(
                    color: GColors.rose.withValues(alpha: 0.75), width: 2),
              ),
              child: inner,
            ),
          ),
        );
      }

      final BorderRadius radius;
      if (zone.shape == 'oval') {
        radius = BorderRadius.circular(longer / 2);
      } else {
        final pct = zone.cornerRadius.clamp(0, 50) / 100.0;
        radius = BorderRadius.circular(shorter * pct);
      }
      return Container(
        decoration: BoxDecoration(
          color: GColors.rose.withValues(alpha: 0.08),
          borderRadius: radius,
          border: Border.all(
              color: GColors.rose.withValues(alpha: 0.75), width: 2),
        ),
        child: inner,
      );
    });
  }
}

// ── Mask zone widgets (Phase 2) ────────────────────────────────────────────────
//
// These render the admin-positioned `masks[]` entries on the customer canvas.
// Geometry comes from `pathForShape(shape, size)`, which is a direct
// translation of the web's `shapePath(shape, 0, 0, w, h)` — keep them in sync.

/// Clips a child to a path produced by [pathForShape] for the given mask shape.
class _ShapeClipper extends CustomClipper<Path> {
  final String shape;
  const _ShapeClipper(this.shape);

  @override
  Path getClip(Size size) => pathForShape(shape, size);

  @override
  bool shouldReclip(covariant _ShapeClipper old) => old.shape != shape;
}

/// Paints a dashed outline + faint fill of the given mask shape across the
/// widget's full size. Mirrors the web's `<svg preserveAspectRatio="none">
/// <path stroke="..." strokeDasharray="4 3" />` empty-mask treatment.
class _ShapeOutlinePainter extends CustomPainter {
  final String shape;
  final Color color;
  const _ShapeOutlinePainter({required this.shape, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final path = pathForShape(shape, size);
    if (path.getBounds().isEmpty) return;

    // Faint fill (matches web rgba(239,55,82,0.10))
    final fill = Paint()
      ..style = PaintingStyle.fill
      ..color = color.withValues(alpha: 0.10);
    canvas.drawPath(path, fill);

    // Dashed stroke approximation. Flutter doesn't have a native dash API on
    // Paint; we compute dash segments along the path using PathMetrics.
    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5
      ..color = color.withValues(alpha: 0.80);
    const dashOn = 4.0;
    const dashOff = 3.0;
    for (final metric in path.computeMetrics()) {
      double dist = 0.0;
      while (dist < metric.length) {
        final next = (dist + dashOn).clamp(0.0, metric.length);
        canvas.drawPath(metric.extractPath(dist, next), stroke);
        dist = next + dashOff;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _ShapeOutlinePainter old) =>
      old.shape != shape || old.color != color;
}

class _FilledMaskZone extends StatefulWidget {
  final MaskSlot mask;
  final Uint8List? bytes;
  final String? url;
  /// Customer-applied transform (zoom + rotation degrees). Mirrors the web
  /// renderer's `transform: scale(...) rotate(...)` on the inner <img>.
  final double scale;
  final double rotation;
  final VoidCallback onClear;
  const _FilledMaskZone({
    required this.mask,
    this.bytes,
    this.url,
    this.scale = 1.0,
    this.rotation = 0.0,
    required this.onClear,
  });

  @override
  State<_FilledMaskZone> createState() => _FilledMaskZoneState();
}

class _FilledMaskZoneState extends State<_FilledMaskZone> {
  /// Cached rasterised silhouette for shape == "custom-image". Loaded once
  /// per mask URL via flutter_svg → ui.Image so we can use it as the alpha
  /// mask for ShaderMask(BlendMode.dstIn).
  ui.Image? _silImage;
  String? _silImageUrl;

  @override
  void initState() {
    super.initState();
    if (widget.mask.shape == 'custom-image' &&
        widget.mask.maskImageUrl != null) {
      _loadSilhouette(widget.mask.maskImageUrl!);
    }
  }

  @override
  void didUpdateWidget(covariant _FilledMaskZone old) {
    super.didUpdateWidget(old);
    final url = widget.mask.maskImageUrl;
    if (widget.mask.shape == 'custom-image' &&
        url != null &&
        url != _silImageUrl) {
      _loadSilhouette(url);
    }
  }

  Future<void> _loadSilhouette(String url) async {
    try {
      // 256px is enough for a phone-sized mask preview; the photo underneath
      // is what the customer sees crisp.
      const px = 256.0;
      final loader = SvgNetworkLoader(url);
      final pictureInfo = await vg.loadPicture(loader, null);
      final img = await pictureInfo.picture.toImage(px.toInt(), px.toInt());
      pictureInfo.picture.dispose();
      if (mounted) {
        setState(() {
          _silImage = img;
          _silImageUrl = url;
        });
      }
    } catch (_) {
      // Fall back to no silhouette — the photo still shows in the rectangle.
    }
  }

  @override
  void dispose() {
    _silImage?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    Widget photo;
    if (widget.bytes != null) {
      photo = Image.memory(widget.bytes!,
          fit: BoxFit.cover,
          width: double.infinity,
          height: double.infinity);
    } else {
      photo = CachedNetworkImage(
        imageUrl: widget.url!,
        fit: BoxFit.cover,
        width: double.infinity,
        height: double.infinity,
      );
    }

    // Apply customer's zoom + rotate BEFORE clipping. Same z-order as the web:
    // transform on the photo, mask/clip on the wrapper. Skipped when both are
    // identity to keep the simple case allocation-free.
    if (widget.scale != 1.0 || widget.rotation != 0.0) {
      photo = Transform(
        alignment: Alignment.center,
        transform: Matrix4.identity()
          ..rotateZ(widget.rotation * 3.14159265358979 / 180)
          ..scale(widget.scale),
        child: photo,
      );
    }

    final shape = widget.mask.shape;
    return LayoutBuilder(builder: (ctx, c) {
      final shorter = c.maxWidth < c.maxHeight ? c.maxWidth : c.maxHeight;

      // Custom-image silhouette mask
      if (shape == 'custom-image') {
        final clipped = _silImage != null
            ? ShaderMask(
                blendMode: BlendMode.dstIn,
                shaderCallback: (rect) => ImageShader(
                  _silImage!,
                  TileMode.clamp,
                  TileMode.clamp,
                  (Matrix4.identity()
                        ..scaleByDouble(
                          rect.width / _silImage!.width,
                          rect.height / _silImage!.height,
                          1.0,
                          1.0,
                        ))
                      .storage,
                ),
                child: photo,
              )
            : photo;
        return _maskWrapper(child: clipped, onClear: widget.onClear);
      }

      // Circle — inscribed-square wrapper to render a TRUE circle even when
      // the mask's bounding rectangle is not square (matches web's
      // closest-side circle clip in simple-zone-customizer.tsx).
      if (shape == 'circle') {
        return Center(
          child: SizedBox(
            width: shorter,
            height: shorter,
            child: _maskWrapper(
              child: ClipPath(
                clipper: const _ShapeClipper('circle'),
                child: photo,
              ),
              onClear: widget.onClear,
            ),
          ),
        );
      }

      // Geometric shapes — clip to pathForShape over the full rect (oval
      // intentionally fills the rectangle, matching the web).
      return _maskWrapper(
        child: ClipPath(
          clipper: _ShapeClipper(shape),
          child: photo,
        ),
        onClear: widget.onClear,
      );
    });
  }

  Widget _maskWrapper({required Widget child, required VoidCallback onClear}) {
    return Stack(
      fit: StackFit.expand,
      children: [
        child,
        Positioned(
          top: 3, right: 3,
          child: GestureDetector(
            onTap: onClear,
            child: Container(
              width: 22, height: 22,
              decoration: const BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.close,
                  size: 13, color: Colors.black87),
            ),
          ),
        ),
      ],
    );
  }
}

class _EmptyMaskZone extends StatelessWidget {
  final MaskSlot mask;
  const _EmptyMaskZone({required this.mask});

  @override
  Widget build(BuildContext context) {
    final shape = mask.shape;
    const color = GColors.rose;

    final inner = Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.upload_rounded,
              size: 22, color: color.withValues(alpha: 0.85)),
          const Gap(4),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(mask.label,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.inter(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: color.withValues(alpha: 0.9))),
          ),
        ],
      ),
    );

    final requiredDot = mask.required
        ? Positioned(
            top: 4, right: 4,
            child: Container(
              width: 10, height: 10,
              decoration: const BoxDecoration(
                color: GColors.rose,
                shape: BoxShape.circle,
              ),
            ),
          )
        : null;

    return LayoutBuilder(builder: (ctx, c) {
      final shorter = c.maxWidth < c.maxHeight ? c.maxWidth : c.maxHeight;

      // Custom-image silhouette ghost — uses flutter_svg with a tinted color
      // filter so the customer can see the silhouette before uploading.
      if (shape == 'custom-image' && mask.maskImageUrl != null) {
        return Stack(fit: StackFit.expand, children: [
          SvgPicture.network(
            mask.maskImageUrl!,
            fit: BoxFit.fill,
            colorFilter: ColorFilter.mode(
              color.withValues(alpha: 0.20),
              BlendMode.srcIn,
            ),
            placeholderBuilder: (_) => const SizedBox.shrink(),
          ),
          inner,
          if (requiredDot != null) requiredDot,
        ]);
      }

      // Circle — inscribed square so the dashed outline is a TRUE circle.
      if (shape == 'circle') {
        return Center(
          child: SizedBox(
            width: shorter,
            height: shorter,
            child: Stack(fit: StackFit.expand, children: [
              const CustomPaint(
                painter: _ShapeOutlinePainter(shape: 'circle', color: color),
              ),
              inner,
              if (requiredDot != null) requiredDot,
            ]),
          ),
        );
      }

      // All other geometric shapes — outline + fill over full rectangle.
      return Stack(fit: StackFit.expand, children: [
        CustomPaint(
          painter: _ShapeOutlinePainter(shape: shape, color: color),
        ),
        inner,
        if (requiredDot != null) requiredDot,
      ]);
    });
  }
}

// ── Filled text zone ───────────────────────────────────────────────────────────

class _FilledTxtZone extends StatelessWidget {
  final SimpleZone zone;
  final String text;
  final TextStyleChoice? style;
  final double zoneHeightPx;
  final VoidCallback onClear;
  // Customiser v2 — drag offset in % of zone w/h. Default Offset.zero =
  // perfectly centred (i.e. exactly the same as before this feature).
  final Offset dragOffsetPct;
  const _FilledTxtZone(
      {required this.zone,
      required this.text,
      this.style,
      required this.zoneHeightPx,
      required this.onClear,
      this.dragOffsetPct = Offset.zero});

  @override
  Widget build(BuildContext context) {
    final ff = style?.fontFamily ??
        (zone.allowedFonts.isNotEmpty ? zone.allowedFonts.first : null);
    final colorHex = style?.fontColor ??
        (zone.allowedColors.isNotEmpty
            ? zone.allowedColors.first
            : '#111111');
    final sizePct = style?.fontSizePct ?? zone.defaultFontSizePct;
    final fs = (zoneHeightPx * sizePct / 100).clamp(8.0, 200.0);

    // Translate the centred Text by (dxPct, dyPct)% of the available space.
    // FractionalTranslation expects fractions of the child's size — but we
    // want fractions of the zone (parent) size, so we scale via a Transform.
    final canDrag = zone.customerCanDrag;

    return Stack(
      fit: StackFit.expand,
      children: [
        Container(
          decoration: BoxDecoration(
            border: Border.all(
                color: GColors.brand.withValues(alpha: 0.7),
                width: 2),
            borderRadius: BorderRadius.circular(12),
          ),
          child: LayoutBuilder(
            builder: (ctx, c) {
              final dx = (dragOffsetPct.dx / 100) * c.maxWidth;
              final dy = (dragOffsetPct.dy / 100) * c.maxHeight;
              return Center(
                child: Transform.translate(
                  offset: Offset(dx, dy),
                  child: Text(text,
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontFamily: ff,
                          fontSize: fs,
                          fontWeight: _fw(zone.fontWeight),
                          color: _hexColor(colorHex))),
                ),
              );
            },
          ),
        ),
        if (canDrag)
          Positioned(
            top: 2, left: 2,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.85),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text('drag',
                  style: GoogleFonts.inter(
                      fontSize: 8,
                      fontWeight: FontWeight.w700,
                      color: GColors.brand)),
            ),
          ),
        Positioned(
          top: 2, right: 2,
          child: GestureDetector(
            onTap: onClear,
            child: Container(
              width: 18, height: 18,
              decoration: const BoxDecoration(
                  color: Colors.white, shape: BoxShape.circle),
              child: const Icon(Icons.close,
                  size: 11, color: Colors.black87),
            ),
          ),
        ),
      ],
    );
  }
}

// ── Empty text zone ────────────────────────────────────────────────────────────

class _EmptyTxtZone extends StatelessWidget {
  final SimpleZone zone;
  const _EmptyTxtZone({required this.zone});

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          color: GColors.brand.withValues(alpha: 0.08),
          border: Border.all(
              color: GColors.brand.withValues(alpha: 0.75), width: 2),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Center(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.edit_rounded,
                  size: 12,
                  color: GColors.brand.withValues(alpha: 0.9)),
              const Gap(4),
              Flexible(
                child: Text(zone.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        color: GColors.brand.withValues(alpha: 0.9))),
              ),
            ],
          ),
        ),
      );
}

// ── Zone list panel ────────────────────────────────────────────────────────────

/// Row "kind" for the bottom slot list. 'mask' rows are Phase 2 additions.
enum _ZoneRowKind { image, text, mask }

class _ZoneListPanel extends StatelessWidget {
  final List<SimpleZone> imageZones, textZones;
  final List<MaskSlot> masks;
  final Map<String, Uint8List> imgBytes;
  final Map<String, String> imgUrls, texts;
  final Map<String, Uint8List> maskBytes;
  final Map<String, String> maskUrls;
  final void Function(SimpleZone) onImgTap, onTxtTap;
  final void Function(MaskSlot) onMaskTap;

  const _ZoneListPanel({
    required this.imageZones,
    required this.textZones,
    required this.masks,
    required this.imgBytes,
    required this.imgUrls,
    required this.texts,
    required this.maskBytes,
    required this.maskUrls,
    required this.onImgTap,
    required this.onTxtTap,
    required this.onMaskTap,
  });

  @override
  Widget build(BuildContext context) {
    if (imageZones.isEmpty && textZones.isEmpty && masks.isEmpty) {
      return const SizedBox.shrink();
    }

    final _c = GColors.of(context);
    // Order: masks first (admin-positioned photo slots typically above the
    // canvas in importance), then image zones, then text zones.
    final rows = <
        ({_ZoneRowKind kind, String id, String label, bool filled, String subtitle, bool required})>[
      ...masks.map((m) {
        final filled = maskBytes.containsKey(m.id) || maskUrls.containsKey(m.id);
        return (
          kind: _ZoneRowKind.mask,
          id: m.id,
          label: m.label,
          filled: filled,
          subtitle: filled ? 'Photo added — tap to change' : 'Tap to upload your photo',
          required: m.required,
        );
      }),
      ...imageZones.map((z) {
        final filled = imgBytes.containsKey(z.id) || imgUrls.containsKey(z.id);
        return (
          kind: _ZoneRowKind.image,
          id: z.id,
          label: z.label,
          filled: filled,
          subtitle: filled ? 'Photo added — tap to change' : 'Tap to upload your photo',
          required: false,
        );
      }),
      ...textZones.map((z) {
        final filled = (texts[z.id]?.isNotEmpty ?? false);
        return (
          kind: _ZoneRowKind.text,
          id: z.id,
          label: z.label,
          filled: filled,
          subtitle: filled ? (texts[z.id] ?? '') : 'Tap to add text',
          required: false,
        );
      }),
    ];

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: _c.bg1,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _c.border),
      ),
      child: Column(
        children: rows.indexed.map((entry) {
          final i = entry.$1;
          final r = entry.$2;
          final isImageLike =
              r.kind == _ZoneRowKind.image || r.kind == _ZoneRowKind.mask;
          final accentColor = isImageLike ? GColors.rose : GColors.brand;

          return Column(
            children: [
              if (i > 0) Divider(height: 1, color: _c.border),
              GestureDetector(
                onTap: () {
                  switch (r.kind) {
                    case _ZoneRowKind.mask:
                      final m = masks.firstWhere((x) => x.id == r.id);
                      onMaskTap(m);
                      break;
                    case _ZoneRowKind.image:
                      final z = imageZones.firstWhere((x) => x.id == r.id);
                      onImgTap(z);
                      break;
                    case _ZoneRowKind.text:
                      final z = textZones.firstWhere((x) => x.id == r.id);
                      onTxtTap(z);
                      break;
                  }
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 12),
                  child: Row(
                    children: [
                      Container(
                        width: 36, height: 36,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: r.filled
                              ? GColors.emerald.withValues(alpha: 0.15)
                              : accentColor.withValues(alpha: 0.1),
                        ),
                        child: Icon(
                          r.filled
                              ? Icons.check_circle_rounded
                              : isImageLike
                                  ? Icons.upload_rounded
                                  : Icons.edit_rounded,
                          size: 18,
                          color: r.filled ? GColors.emerald : accentColor,
                        ),
                      ),
                      const Gap(12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(children: [
                              Flexible(
                                child: Text(r.label,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: GoogleFonts.inter(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w700,
                                        color: _c.text0)),
                              ),
                              if (r.required && !r.filled) ...[
                                const Gap(6),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: GColors.rose.withValues(alpha: 0.15),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text('Required',
                                      style: GoogleFonts.inter(
                                          fontSize: 9,
                                          fontWeight: FontWeight.w800,
                                          color: GColors.rose)),
                                ),
                              ],
                            ]),
                            Text(
                              r.subtitle,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.inter(
                                  fontSize: 11, color: _c.text2),
                            ),
                          ],
                        ),
                      ),
                      Icon(Icons.chevron_right_rounded,
                          size: 18, color: _c.text2),
                    ],
                  ),
                ),
              ),
            ],
          );
        }).toList(),
      ),
    );
  }
}

// ── Designs panel ──────────────────────────────────────────────────────────────

class _DesignsPanel extends StatelessWidget {
  final List<_SimpleDesign> designs;
  final int activeIndex;
  final ValueChanged<int> onSwitch;
  final ValueChanged<int> onRemove;
  final VoidCallback onAdd;

  const _DesignsPanel({
    required this.designs,
    required this.activeIndex,
    required this.onSwitch,
    required this.onAdd,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final _c = GColors.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('DESIGNS (${designs.length} ITEM${designs.length > 1 ? 'S' : ''})',
                  style: GoogleFonts.inter(
                      fontSize: 10, fontWeight: FontWeight.w800,
                      color: _c.text2, letterSpacing: 0.5)),
              const Spacer(),
              GestureDetector(
                onTap: onAdd,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: GColors.rose.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: GColors.rose.withValues(alpha: 0.4)),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.add_rounded, size: 14, color: GColors.rose),
                    const Gap(4),
                    Text('Add another design',
                        style: GoogleFonts.inter(
                            fontSize: 11, fontWeight: FontWeight.w700,
                            color: GColors.rose)),
                  ]),
                ),
              ),
            ],
          ),
          const Gap(10),
          SizedBox(
            height: 72,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: designs.length,
              separatorBuilder: (_, __) => const Gap(10),
              itemBuilder: (_, i) {
                final active = i == activeIndex;
                final filled = designs[i].hasAnyFill;
                return GestureDetector(
                  onTap: () => onSwitch(i),
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Container(
                        width: 64, height: 64,
                        decoration: BoxDecoration(
                          border: Border.all(
                            color: active ? GColors.rose : _c.border,
                            width: active ? 2 : 1,
                          ),
                          borderRadius: BorderRadius.circular(12),
                          color: active
                              ? GColors.rose.withValues(alpha: 0.08)
                              : _c.bg1,
                        ),
                        child: Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text('#${i + 1}',
                                  style: GoogleFonts.inter(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w800,
                                      color: active ? GColors.rose : _c.text1)),
                              if (filled)
                                const Icon(Icons.check_circle_rounded,
                                    size: 12, color: GColors.emerald)
                              else
                                Text('empty', style: GoogleFonts.inter(
                                  fontSize: 9, color: _c.text2)),
                            ],
                          ),
                        ),
                      ),
                      if (designs.length > 1)
                        Positioned(
                          top: -6, right: -6,
                          child: GestureDetector(
                            onTap: () => onRemove(i),
                            child: Container(
                              width: 20, height: 20,
                              decoration: BoxDecoration(
                                color: _c.bg2,
                                shape: BoxShape.circle,
                              ),
                              child: Icon(Icons.close_rounded,
                                  size: 12, color: _c.text1),
                            ),
                          ),
                        ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Icon picker bottom sheet
// ─────────────────────────────────────────────────────────────────────────────

class _IconPickerSheet extends StatelessWidget {
  final SimpleZone zone;
  final String? currentUrl;
  final void Function(String) onPick;
  final VoidCallback onUpload, onClear;

  const _IconPickerSheet({
    required this.zone,
    this.currentUrl,
    required this.onPick,
    required this.onUpload,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    final bot = MediaQuery.of(context).padding.bottom;
    final _c  = GColors.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 20, 16, bot + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Handle
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: _c.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const Gap(16),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Pick for: ${zone.label}',
                        style: GoogleFonts.inter(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: _c.text0)),
                    Text('Choose an icon or upload your own',
                        style: GoogleFonts.inter(
                            fontSize: 11, color: _c.text2)),
                  ],
                ),
              ),
              GestureDetector(
                onTap: () => Navigator.pop(context),
                child: Container(
                  width: 32, height: 32,
                  decoration: BoxDecoration(
                    color: _c.bg2,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.close,
                      size: 16, color: _c.text1),
                ),
              ),
            ],
          ),
          const Gap(16),

          // Icon grid
          if (zone.allowedIcons.isNotEmpty) ...[
            Text('ICONS',
                style: GoogleFonts.inter(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: _c.text2,
                    letterSpacing: 0.5)),
            const Gap(10),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate:
                  const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 5,
                crossAxisSpacing: 8,
                mainAxisSpacing: 8,
              ),
              itemCount: zone.allowedIcons.length,
              itemBuilder: (_, i) {
                final ic = zone.allowedIcons[i];
                final url = ic['url']?.toString() ?? '';
                final label = ic['label']?.toString() ?? '';
                final active = currentUrl == url;
                return GestureDetector(
                  onTap: () => onPick(url),
                  child: Container(
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: active
                            ? GColors.rose
                            : _c.border,
                        width: active ? 2 : 1,
                      ),
                      borderRadius: BorderRadius.circular(12),
                      color: _c.bg2,
                    ),
                    padding: const EdgeInsets.all(6),
                    child: Column(
                      children: [
                        Expanded(
                          child: CachedNetworkImage(
                              imageUrl: url,
                              fit: BoxFit.contain),
                        ),
                        if (label.isNotEmpty) ...[
                          const Gap(2),
                          Text(label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.inter(
                                  fontSize: 8,
                                  color: _c.text2)),
                        ],
                      ],
                    ),
                  ),
                );
              },
            ),
            const Gap(12),
          ],

          // Upload button
          GestureDetector(
            onTap: onUpload,
            child: Container(
              width: double.infinity,
              height: 40,
              decoration: BoxDecoration(
                border: Border.all(
                    color: GColors.rose.withValues(alpha: 0.7),
                    width: 2),
                borderRadius: BorderRadius.circular(12),
                color: GColors.rose.withValues(alpha: 0.06),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.upload_rounded,
                      size: 18, color: GColors.rose),
                  const Gap(8),
                  Text('Upload your own image',
                      style: GoogleFonts.inter(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: GColors.rose)),
                ],
              ),
            ),
          ),

          if (currentUrl != null) ...[
            const Gap(8),
            GestureDetector(
              onTap: onClear,
              child: Center(
                child: Text('Remove current selection',
                    style: GoogleFonts.inter(
                        fontSize: 12,
                        color: _c.text2,
                        fontWeight: FontWeight.w500)),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Text editor bottom sheet
// ─────────────────────────────────────────────────────────────────────────────
// Image edit sheet (zoom + rotate)
// ─────────────────────────────────────────────────────────────────────────────

class _ImgEditSheet extends StatefulWidget {
  final SimpleZone zone;
  final Uint8List? bytes;
  final String? url;
  final double initialScale;
  final double initialRotation;
  final void Function(double scale, double rotation) onApply;
  final VoidCallback onRemove;
  final VoidCallback onReplace;

  const _ImgEditSheet({
    required this.zone,
    this.bytes,
    this.url,
    required this.initialScale,
    required this.initialRotation,
    required this.onApply,
    required this.onRemove,
    required this.onReplace,
  });

  @override
  State<_ImgEditSheet> createState() => _ImgEditSheetState();
}

class _ImgEditSheetState extends State<_ImgEditSheet> {
  late double _scale;
  late double _rotation;

  @override
  void initState() {
    super.initState();
    _scale    = widget.initialScale;
    _rotation = widget.initialRotation;
  }

  void _rotateLeft()  => setState(() => _rotation = (_rotation - 90 + 360) % 360);
  void _rotateRight() => setState(() => _rotation = (_rotation + 90) % 360);

  @override
  Widget build(BuildContext context) {
    final bot = MediaQuery.of(context).padding.bottom;
    final _c  = GColors.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 12, 16, bot + 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Handle
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                  color: _c.border,
                  borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const Gap(12),
          Text('EDIT IMAGE',
              style: GoogleFonts.inter(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: _c.text2,
                  letterSpacing: 1)),
          Text(widget.zone.label,
              style: GoogleFonts.inter(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: _c.text0)),
          const Gap(12),

          // Live preview
          Center(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 200, height: 200,
                child: ColoredBox(
                  color: const Color(0xFFF5F5F5),
                  child: Transform(
                    alignment: Alignment.center,
                    transform: Matrix4.identity()
                      ..rotateZ(_rotation * 3.14159265358979 / 180)
                      ..scale(_scale),
                    child: widget.bytes != null
                        ? Image.memory(widget.bytes!,
                            fit: BoxFit.cover,
                            width: 200, height: 200)
                        : CachedNetworkImage(
                            imageUrl: widget.url ?? '',
                            fit: BoxFit.cover,
                            width: 200, height: 200),
                  ),
                ),
              ),
            ),
          ),
          const Gap(16),

          // Zoom slider
          Row(
            children: [
              Text('ZOOM',
                  style: GoogleFonts.inter(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: _c.text2,
                      letterSpacing: 0.5)),
              const Spacer(),
              Text('${(_scale * 100).round()}%',
                  style: GoogleFonts.inter(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: _c.text1)),
            ],
          ),
          const Gap(4),
          Row(
            children: [
              Text('1×',
                  style: GoogleFonts.inter(
                      fontSize: 10, color: _c.text2)),
              Expanded(
                child: SliderTheme(
                  data: SliderTheme.of(context).copyWith(
                    trackHeight: 3,
                    thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 8),
                    overlayShape: const RoundSliderOverlayShape(overlayRadius: 16),
                    activeTrackColor: GColors.rose,
                    inactiveTrackColor: _c.bg2,
                    thumbColor: GColors.rose,
                  ),
                  child: Slider(
                    min: 1.0, max: 3.0, divisions: 40,
                    value: _scale,
                    onChanged: (v) => setState(() => _scale = v),
                  ),
                ),
              ),
              Text('3×',
                  style: GoogleFonts.inter(
                      fontSize: 10, color: _c.text2)),
            ],
          ),
          const Gap(12),

          // Rotate controls
          Row(
            children: [
              Text('ROTATE',
                  style: GoogleFonts.inter(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: _c.text2,
                      letterSpacing: 0.5)),
              const Spacer(),
              Text('${_rotation.round()}°',
                  style: GoogleFonts.inter(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: _c.text1)),
              if (_rotation != 0) ...[
                const Gap(8),
                GestureDetector(
                  onTap: () => setState(() => _rotation = 0),
                  child: Text('Reset',
                      style: GoogleFonts.inter(
                          fontSize: 11,
                          color: GColors.rose,
                          decoration: TextDecoration.underline)),
                ),
              ],
            ],
          ),
          const Gap(6),
          Row(
            children: [
              // Rotate left 90°
              GestureDetector(
                onTap: _rotateLeft,
                child: Container(
                  width: 44, height: 44,
                  decoration: BoxDecoration(
                    color: _c.bg2,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: _c.border),
                  ),
                  child: Center(
                    child: Text('↺',
                        style: TextStyle(fontSize: 20, color: _c.text0)),
                  ),
                ),
              ),
              const Gap(8),
              // Fine rotation slider 0–359
              Expanded(
                child: SliderTheme(
                  data: SliderTheme.of(context).copyWith(
                    trackHeight: 3,
                    thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 8),
                    overlayShape: const RoundSliderOverlayShape(overlayRadius: 16),
                    activeTrackColor: GColors.rose,
                    inactiveTrackColor: _c.bg2,
                    thumbColor: GColors.rose,
                  ),
                  child: Slider(
                    min: 0, max: 359, divisions: 359,
                    value: _rotation,
                    onChanged: (v) => setState(() => _rotation = v.roundToDouble()),
                  ),
                ),
              ),
              const Gap(8),
              // Rotate right 90°
              GestureDetector(
                onTap: _rotateRight,
                child: Container(
                  width: 44, height: 44,
                  decoration: BoxDecoration(
                    color: _c.bg2,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: _c.border),
                  ),
                  child: Center(
                    child: Text('↻',
                        style: TextStyle(fontSize: 20, color: _c.text0)),
                  ),
                ),
              ),
            ],
          ),
          const Gap(20),

          // Action buttons
          Row(
            children: [
              // Remove
              Expanded(
                child: GestureDetector(
                  onTap: () { Navigator.pop(context); widget.onRemove(); },
                  child: Container(
                    height: 44,
                    decoration: BoxDecoration(
                      border: Border.all(color: GColors.rose.withValues(alpha: 0.5)),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Center(
                      child: Text('Remove',
                          style: GoogleFonts.inter(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: GColors.rose)),
                    ),
                  ),
                ),
              ),
              const Gap(8),
              // Change photo
              Expanded(
                child: GestureDetector(
                  onTap: () { Navigator.pop(context); widget.onReplace(); },
                  child: Container(
                    height: 44,
                    decoration: BoxDecoration(
                      border: Border.all(color: _c.border),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Center(
                      child: Text('Change',
                          style: GoogleFonts.inter(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: _c.text1)),
                    ),
                  ),
                ),
              ),
              const Gap(8),
              // Apply
              Expanded(
                child: GestureDetector(
                  onTap: () {
                    widget.onApply(_scale, _rotation);
                    Navigator.pop(context);
                  },
                  child: Container(
                    height: 44,
                    decoration: BoxDecoration(
                      color: GColors.rose,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Center(
                      child: Text('Apply',
                          style: GoogleFonts.inter(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: Colors.white)),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Extract a clean display name from a CSS font-family string.
/// e.g. "'Outfit', 'DM Sans', Arial, sans-serif"  →  "Outfit"
String _cleanFontName(String cssFamily) {
  final first = cssFamily.split(',').first.trim();
  return first.replaceAll("'", '').replaceAll('"', '').trim();
}

// ─────────────────────────────────────────────────────────────────────────────

class _TextEditorSheet extends StatefulWidget {
  final SimpleZone zone;
  final String initialText;
  final TextStyleChoice? initialStyle;
  final void Function(String text, TextStyleChoice style) onSave;

  const _TextEditorSheet({
    required this.zone,
    required this.initialText,
    this.initialStyle,
    required this.onSave,
  });

  @override
  State<_TextEditorSheet> createState() => _TextEditorSheetState();
}

class _TextEditorSheetState extends State<_TextEditorSheet> {
  late TextEditingController _ctrl;
  late String? _font;
  late String? _color;
  late double _sizePct;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.initialText);
    final z = widget.zone;
    final s = widget.initialStyle;
    _font  = s?.fontFamily ?? (z.allowedFonts.isNotEmpty  ? z.allowedFonts.first  : null);
    _color = s?.fontColor  ?? (z.allowedColors.isNotEmpty ? z.allowedColors.first : null);
    _sizePct = s?.fontSizePct ?? z.defaultFontSizePct;
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _save() {
    widget.onSave(
      _ctrl.text.trim(),
      TextStyleChoice(
        fontFamily: _font,
        fontColor: _color,
        fontSizePct: _sizePct,
      ),
    );
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final bot = MediaQuery.of(context).padding.bottom;
    final _c  = GColors.of(context);
    final z = widget.zone;
    final fonts  = z.allowedFonts;
    final colors = z.allowedColors;
    final previewFont  = _font  ?? "'Outfit', sans-serif";
    final previewColor = _color ?? '#111111';

    return Padding(
      padding: EdgeInsets.fromLTRB(
          16, 20, 16, MediaQuery.of(context).viewInsets.bottom + bot + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Handle
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                  color: _c.border,
                  borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const Gap(16),
          Text('Edit text',
              style: GoogleFonts.inter(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: _c.text2,
                  letterSpacing: 1)),
          Text(z.label,
              style: GoogleFonts.inter(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: _c.text0)),
          const Gap(12),

          // Text input — uses selected font+color for live typing preview
          TextField(
            controller: _ctrl,
            autofocus: true,
            onChanged: (_) => setState(() {}),
            style: TextStyle(
              fontFamily: previewFont,
              fontSize: 16,
              color: _hexColor(previewColor),
              fontWeight: _fw(z.fontWeight),
            ),
            decoration: InputDecoration(
              hintText: 'Type here...',
              hintStyle: GoogleFonts.inter(
                  fontSize: 14, color: _c.text2),
              filled: true,
              fillColor: _c.bg2,
              contentPadding: const EdgeInsets.symmetric(
                  horizontal: 14, vertical: 14),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: _c.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: _c.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(
                    color: GColors.brand, width: 1.5),
              ),
            ),
          ),
          const Gap(8),

          // Font picker — Canva-style square "Aa" chips
          if (fonts.length > 1) ...[
            const Gap(16),
            _sheetLabel('FONT', _c),
            const Gap(8),
            Wrap(
              spacing: 10, runSpacing: 10,
              children: fonts.map((f) {
                final sel = (_font ?? fonts.first) == f;
                final fontName = _cleanFontName(f);
                // Resolve via GoogleFonts so the "Aa" sample is actually
                // drawn in the named typeface (was rendering in the
                // default system font for every tile, defeating the
                // point of a font picker — issue #46). Falls back to the
                // raw fontFamily for non-Google fonts that ship as
                // bundled assets.
                TextStyle previewStyle({double size = 22, double weight = 700}) {
                  try {
                    return GoogleFonts.getFont(
                      fontName,
                      fontSize: size,
                      fontWeight: weight == 600 ? FontWeight.w600 : FontWeight.w700,
                      color: sel ? GColors.brand : _c.text0,
                    );
                  } catch (_) {
                    return TextStyle(
                      fontFamily: f,
                      fontSize: size,
                      fontWeight: weight == 600 ? FontWeight.w600 : FontWeight.w700,
                      color: sel ? GColors.brand : _c.text0,
                    );
                  }
                }
                return GestureDetector(
                  onTap: () => setState(() => _font = f),
                  child: AnimatedContainer(
                    duration: 120.ms,
                    width: 72,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 8),
                    decoration: BoxDecoration(
                      color: sel
                          ? GColors.brand.withValues(alpha: 0.10)
                          : _c.bg2,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                          color: sel ? GColors.brand : _c.border,
                          width: sel ? 1.5 : 1),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('Aa', style: previewStyle(size: 22)),
                        const Gap(2),
                        Text(
                            fontName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 9,
                                color: sel ? GColors.brand : _c.text2,
                                fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ],

          // Color picker
          if (colors.length > 1) ...[
            const Gap(16),
            _sheetLabel('COLOUR', _c),
            const Gap(8),
            Wrap(
              spacing: 10, runSpacing: 8,
              children: colors.map((c) {
                final sel = (_color ?? colors.first) == c;
                return GestureDetector(
                  onTap: () => setState(() => _color = c),
                  child: AnimatedContainer(
                    duration: 120.ms,
                    width: sel ? 36 : 32,
                    height: sel ? 36 : 32,
                    decoration: BoxDecoration(
                      color: _hexColor(c),
                      shape: BoxShape.circle,
                      border: Border.all(
                          color: sel ? GColors.rose : Colors.transparent,
                          width: 2.5),
                    ),
                  ),
                );
              }).toList(),
            ),
          ],

          // Size slider — only when admin allowed customerCanResize on this zone.
          if (z.customerCanResize) ...[
            const Gap(16),
            Row(
              children: [
                _sheetLabel('SIZE', _c),
                const Spacer(),
                Text('${_sizePct.round()}%',
                    style: GoogleFonts.inter(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: _c.text1)),
              ],
            ),
            const Gap(8),
            Row(
              children: [
                GestureDetector(
                  onTap: () => setState(
                      () => _sizePct = (_sizePct - 5).clamp(30, 200)),
                  child: _sizeBtn(Icons.remove, _c),
                ),
                Expanded(
                  child: SliderTheme(
                    data: SliderTheme.of(context).copyWith(
                      trackHeight: 3,
                      thumbShape: const RoundSliderThumbShape(
                          enabledThumbRadius: 8),
                      overlayShape: const RoundSliderOverlayShape(
                          overlayRadius: 16),
                      activeTrackColor: GColors.rose,
                      inactiveTrackColor: _c.bg2,
                      thumbColor: GColors.rose,
                    ),
                    child: Slider(
                      min: 30, max: 200,
                      value: _sizePct.clamp(30, 200),
                      onChanged: (v) =>
                          setState(() => _sizePct = v.roundToDouble()),
                    ),
                  ),
                ),
                GestureDetector(
                  onTap: () => setState(
                      () => _sizePct = (_sizePct + 5).clamp(30, 200)),
                  child: _sizeBtn(Icons.add, _c),
                ),
              ],
            ),
          ],

          const Gap(20),

          // Buttons
          Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () => Navigator.pop(context),
                  child: Container(
                    height: 40,
                    decoration: BoxDecoration(
                      border: Border.all(color: _c.border),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Center(
                      child: Text('Cancel',
                          style: GoogleFonts.inter(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: _c.text1)),
                    ),
                  ),
                ),
              ),
              const Gap(10),
              Expanded(
                child: GButton(
                  label: 'Save',
                  onPressed: _save,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _sheetLabel(String t, GColorsPalette c) => Text(t,
      style: GoogleFonts.inter(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: c.text2,
          letterSpacing: 0.5));

  Widget _sizeBtn(IconData icon, GColorsPalette c) => Container(
        width: 32, height: 32,
        decoration: BoxDecoration(
          color: c.bg2,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: c.border),
        ),
        child: Icon(icon, size: 16, color: c.text0),
      );
}

// ─────────────────────────────────────────────────────────────────────────────
// Template picker bottom sheet
// ─────────────────────────────────────────────────────────────────────────────

class _TemplatePickerSheet extends StatefulWidget {
  final List<Map<String, dynamic>> templates;
  final bool isFullCanvas;
  final void Function(String json) onPickFull;
  final void Function(Map<String, dynamic> template) onPickZone;

  const _TemplatePickerSheet({
    required this.templates,
    required this.isFullCanvas,
    required this.onPickFull,
    required this.onPickZone,
  });

  @override
  State<_TemplatePickerSheet> createState() => _TemplatePickerSheetState();
}

class _TemplatePickerSheetState extends State<_TemplatePickerSheet> {
  String? _selectedCategory;

  @override
  Widget build(BuildContext context) {
    final c = GColors.of(context);
    final bot = MediaQuery.of(context).padding.bottom;

    // Build unique category list
    final categories = <String>['All'];
    for (final t in widget.templates) {
      final cat = t['category']?.toString() ?? '';
      if (cat.isNotEmpty && !categories.contains(cat)) categories.add(cat);
    }

    final filtered = _selectedCategory == null || _selectedCategory == 'All'
        ? widget.templates
        : widget.templates
            .where((t) => (t['category']?.toString() ?? '') == _selectedCategory)
            .toList();

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      minChildSize: 0.5,
      maxChildSize: 0.93,
      builder: (_, scrollController) => Column(
        children: [
          // Handle + header
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
            child: Column(
              children: [
                Center(
                  child: Container(
                    width: 36, height: 4,
                    decoration: BoxDecoration(
                        color: c.border, borderRadius: BorderRadius.circular(2)),
                  ),
                ),
                const Gap(14),
                Row(children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Design Templates', style: GoogleFonts.inter(
                          fontSize: 17, fontWeight: FontWeight.w800, color: c.text0)),
                      Text(
                        widget.isFullCanvas
                            ? 'Start your canvas from a pre-made design'
                            : 'Apply template text to your customiser',
                        style: GoogleFonts.inter(fontSize: 11, color: c.text2),
                      ),
                    ]),
                  ),
                  GestureDetector(
                    onTap: () => Navigator.pop(context),
                    child: Container(
                      width: 30, height: 30,
                      decoration: BoxDecoration(color: c.bg2, shape: BoxShape.circle),
                      child: Icon(Icons.close, size: 16, color: c.text1),
                    ),
                  ),
                ]),
                const Gap(12),
              ],
            ),
          ),

          // Category filter chips
          if (categories.length > 1) ...[
            SizedBox(
              height: 32,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: categories.length,
                separatorBuilder: (_, __) => const Gap(8),
                itemBuilder: (_, i) {
                  final cat = categories[i];
                  final sel = cat == 'All'
                      ? _selectedCategory == null || _selectedCategory == 'All'
                      : _selectedCategory == cat;
                  return GestureDetector(
                    onTap: () => setState(() => _selectedCategory = cat),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 120),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: sel
                            ? GColors.brand.withValues(alpha: 0.12)
                            : c.bg2,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                            color: sel ? GColors.brand : c.border,
                            width: sel ? 1.5 : 1),
                      ),
                      child: Text(cat, style: GoogleFonts.inter(
                          fontSize: 12,
                          fontWeight: sel ? FontWeight.w700 : FontWeight.w500,
                          color: sel ? GColors.brand : c.text1)),
                    ),
                  );
                },
              ),
            ),
            const Gap(10),
          ],

          Divider(height: 1, color: c.border),

          // Template grid
          Expanded(
            child: filtered.isEmpty
                ? Center(
                    child: Text('No templates in this category',
                        style: GoogleFonts.inter(fontSize: 13, color: c.text2)))
                : GridView.builder(
                    controller: scrollController,
                    padding: EdgeInsets.fromLTRB(16, 14, 16, bot + 16),
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 12,
                      childAspectRatio: 0.85,
                    ),
                    itemCount: filtered.length,
                    itemBuilder: (_, i) {
                      final t = filtered[i];
                      final preview = t['previewUrl']?.toString() ?? '';
                      final name = t['name']?.toString() ?? 'Template';
                      final cat  = t['category']?.toString() ?? '';
                      return GestureDetector(
                        onTap: () {
                          if (widget.isFullCanvas) {
                            // Full canvas: pass canvasJson as string
                            final cj = t['canvasJson'];
                            String jsonStr;
                            if (cj is String) {
                              jsonStr = cj;
                            } else if (cj is Map) {
                              jsonStr = jsonEncode(cj);
                            } else {
                              jsonStr = '{}';
                            }
                            widget.onPickFull(jsonStr);
                          } else {
                            widget.onPickZone(t);
                          }
                        },
                        child: Container(
                          decoration: BoxDecoration(
                            color: c.bg1,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: c.border),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: preview.isNotEmpty
                                    ? CachedNetworkImage(
                                        imageUrl: preview,
                                        fit: BoxFit.cover,
                                        width: double.infinity,
                                        errorWidget: (_, __, ___) => Container(
                                          color: c.bg2,
                                          child: const Center(
                                              child: Text('🎨',
                                                  style: TextStyle(fontSize: 40))),
                                        ),
                                      )
                                    : Container(
                                        color: c.bg2,
                                        child: const Center(
                                            child: Text('🎨',
                                                style: TextStyle(fontSize: 40))),
                                      ),
                              ),
                              Padding(
                                padding: const EdgeInsets.all(10),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(name,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: GoogleFonts.inter(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w700,
                                            color: c.text0)),
                                    if (cat.isNotEmpty) ...[
                                      const Gap(2),
                                      Text(cat,
                                          style: GoogleFonts.inter(
                                              fontSize: 10,
                                              color: c.text2)),
                                    ],
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ).animate()
                        .fadeIn(delay: (i * 30).ms, duration: 250.ms)
                        .scaleXY(begin: 0.96, end: 1.0);
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
