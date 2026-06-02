import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_colorpicker/flutter_colorpicker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gallery_saver_plus/gallery_saver.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:palette_generator/palette_generator.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pretty_qr_code/pretty_qr_code.dart';
import 'package:screenshot/screenshot.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_theme.dart';
import 'dart:io';

// ─────────────────────────────────────────────────────────────────────────────
// Element model
// ─────────────────────────────────────────────────────────────────────────────

enum ShapeKind { rect, circle, triangle, star, heart, diamond, hexagon, custom }

class CanvasElement {
  final String id;
  final String type; // 'text' | 'image' | 'shape'

  double x, y;       // center in local canvas pixels
  double scale;      // 1.0 = 100%
  double rotation;   // radians
  bool visible;

  // Text
  String text;
  String fontFamily;
  Color color;
  double fontSize;
  FontWeight fontWeight;
  String textAlign; // 'left' | 'center' | 'right'

  // Image
  Uint8List? bytes;
  String? imageUrl;
  double baseWidth, baseHeight;

  // Shape
  ShapeKind shapeKind;
  Color fillColor;
  Color strokeColor;
  double strokeWidth;

  CanvasElement({
    required this.id,
    required this.type,
    required this.x,
    required this.y,
    this.scale = 1,
    this.rotation = 0,
    this.visible = true,
    this.text = '',
    this.fontFamily = 'Inter',
    this.color = Colors.white,
    this.fontSize = 28,
    this.fontWeight = FontWeight.w700,
    this.textAlign = 'center',
    this.bytes,
    this.imageUrl,
    this.baseWidth = 120,
    this.baseHeight = 120,
    this.shapeKind = ShapeKind.rect,
    this.fillColor = const Color(0xFFEC4899),
    this.strokeColor = Colors.transparent,
    this.strokeWidth = 0,
  });

  /// Produces fabric.js-compatible JSON so the web can load it natively with
  /// `fabric.Canvas.loadFromJSON(...)`.
  Map<String, dynamic> toFabric() {
    final angleDeg = rotation * 180 / math.pi;
    final hex = '#${color.value.toRadixString(16).padLeft(8, '0').substring(2)}';
    final common = <String, dynamic>{
      'version': '5.3.0',
      'originX': 'center', 'originY': 'center',
      'left': x, 'top': y,
      'scaleX': scale, 'scaleY': scale,
      'angle': angleDeg,
      'opacity': visible ? 1 : 0,
      'flipX': false, 'flipY': false,
      'visible': visible,
      'gId': id,
    };

    if (type == 'text') {
      return {
        ...common,
        'type': 'textbox',
        'text': text,
        'fontSize': fontSize,
        'fontFamily': fontFamily,
        'fontWeight': fontWeight.value,
        'fontStyle': 'normal',
        'textAlign': textAlign,
        'lineHeight': 1.16,
        'fill': hex,
        'width': baseWidth,
        'height': baseHeight,
      };
    }
    if (type == 'image') {
      return {
        ...common,
        'type': 'image',
        'src': bytes != null
            ? 'data:image/jpeg;base64,${base64Encode(bytes!)}'
            : (imageUrl ?? ''),
        'width': baseWidth, 'height': baseHeight,
      };
    }
    // Shape
    final fillHex = '#${fillColor.value.toRadixString(16).padLeft(8, '0').substring(2)}';
    final strokeHex = '#${strokeColor.value.toRadixString(16).padLeft(8, '0').substring(2)}';
    final fabricType = switch (shapeKind) {
      ShapeKind.rect     => 'rect',
      ShapeKind.circle   => 'circle',
      ShapeKind.triangle => 'triangle',
      _                  => 'polygon',
    };
    return {
      ...common,
      'type': fabricType,
      'width': baseWidth, 'height': baseHeight,
      'fill': fillHex,
      'stroke': strokeWidth > 0 ? strokeHex : null,
      'strokeWidth': strokeWidth,
      'gShapeKind': shapeKind.name,
      if (shapeKind == ShapeKind.circle) 'radius': baseWidth / 2,
    };
  }

  CanvasElement clone(String newId) => CanvasElement(
        id: newId, type: type,
        x: x + 16, y: y + 16, scale: scale, rotation: rotation, visible: visible,
        text: text, fontFamily: fontFamily, color: color,
        fontSize: fontSize, fontWeight: fontWeight, textAlign: textAlign,
        bytes: bytes, imageUrl: imageUrl,
        baseWidth: baseWidth, baseHeight: baseHeight,
        shapeKind: shapeKind, fillColor: fillColor,
        strokeColor: strokeColor, strokeWidth: strokeWidth,
      );

  static CanvasElement? fromFabric(Map<String, dynamic> obj, String id) {
    final type = obj['type']?.toString() ?? '';
    final x = (obj['left'] as num?)?.toDouble() ?? 100;
    final y = (obj['top']  as num?)?.toDouble() ?? 100;
    final scaleX = (obj['scaleX'] as num?)?.toDouble() ?? 1.0;
    final angleDeg = (obj['angle'] as num?)?.toDouble() ?? 0.0;
    final rotation = angleDeg * 3.14159265358979 / 180.0;
    final w = (obj['width']  as num?)?.toDouble() ?? 120;
    final h = (obj['height'] as num?)?.toDouble() ?? 40;
    final visible = obj['visible'] as bool? ?? true;

    Color parseHex(String? hex) {
      if (hex == null || hex.isEmpty) return Colors.white;
      final s = hex.replaceAll('#', '');
      if (s.length == 6) return Color(int.parse('FF$s', radix: 16));
      if (s.length == 8) return Color(int.parse(s, radix: 16));
      return Colors.white;
    }

    if (type == 'textbox' || type == 'text' || type == 'i-text') {
      final fw = obj['fontWeight'];
      FontWeight parseFw(dynamic v) {
        final n = v is num ? v.toInt() : int.tryParse(v?.toString() ?? '') ?? 700;
        return switch (n) {
          300 => FontWeight.w300, 400 => FontWeight.w400, 500 => FontWeight.w500,
          600 => FontWeight.w600, 700 => FontWeight.w700, 800 => FontWeight.w800,
          900 => FontWeight.w900, _ => FontWeight.w700,
        };
      }
      return CanvasElement(
        id: id, type: 'text', x: x, y: y,
        scale: scaleX, rotation: rotation, visible: visible,
        text: obj['text']?.toString() ?? '',
        fontSize: (obj['fontSize'] as num?)?.toDouble() ?? 28,
        fontFamily: obj['fontFamily']?.toString() ?? 'Inter',
        fontWeight: parseFw(fw),
        textAlign: obj['textAlign']?.toString() ?? 'center',
        color: parseHex(obj['fill']?.toString()),
        baseWidth: w, baseHeight: h,
      );
    }
    if (type == 'image') {
      return CanvasElement(
        id: id, type: 'image', x: x, y: y,
        scale: scaleX, rotation: rotation, visible: visible,
        imageUrl: obj['src']?.toString(),
        baseWidth: w, baseHeight: h,
      );
    }
    // Shapes
    final shapeKind = switch (obj['gShapeKind']?.toString() ?? type) {
      'circle'   => ShapeKind.circle,
      'triangle' => ShapeKind.triangle,
      'star'     => ShapeKind.star,
      'heart'    => ShapeKind.heart,
      'diamond'  => ShapeKind.diamond,
      'hexagon'  => ShapeKind.hexagon,
      _          => ShapeKind.rect,
    };
    return CanvasElement(
      id: id, type: 'shape', x: x, y: y,
      scale: scaleX, rotation: rotation, visible: visible,
      shapeKind: shapeKind,
      fillColor:   parseHex(obj['fill']?.toString()),
      strokeColor: parseHex(obj['stroke']?.toString()),
      strokeWidth: (obj['strokeWidth'] as num?)?.toDouble() ?? 0,
      baseWidth: w, baseHeight: h,
    );
  }

  /// Emoji shown in the layers panel next to each element.
  String get previewEmoji {
    if (type == 'text') return 'T';
    if (type == 'image') return '🖼️';
    return switch (shapeKind) {
      ShapeKind.rect     => '⬛',
      ShapeKind.circle   => '⚫',
      ShapeKind.triangle => '🔺',
      ShapeKind.star     => '⭐',
      ShapeKind.heart    => '❤️',
      ShapeKind.diamond  => '💎',
      ShapeKind.hexagon  => '⬡',
      ShapeKind.custom   => '🖼️',
    };
  }

  String get shortLabel {
    if (type == 'text') return text.isEmpty ? '(empty text)' : text;
    if (type == 'image') return 'Image';
    return '${shapeKind.name[0].toUpperCase()}${shapeKind.name.substring(1)}';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A single design (list of elements + undo history)
// ─────────────────────────────────────────────────────────────────────────────

class _Design {
  final List<CanvasElement> elements = [];
  final List<List<CanvasElement>> undoStack = [];
  final List<List<CanvasElement>> redoStack = [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public widget
// ─────────────────────────────────────────────────────────────────────────────

class FullCanvasEditor extends ConsumerStatefulWidget {
  final String baseImageUrl;
  final double aspectRatio;
  /// Payload passed back to the parent on Save. Has `type: 'fabric'` +
  /// (if more than one design) `designs: [...]`.
  final void Function(Map<String, dynamic> payload) onSave;
  final List<String> availableFonts;
  final String? initialCanvasJson;

  const FullCanvasEditor({
    super.key,
    required this.baseImageUrl,
    required this.aspectRatio,
    required this.onSave,
    this.availableFonts = const [
      'Inter', 'Playfair Display', 'Pacifico', 'Montserrat',
      'Dancing Script', 'Lobster', 'Oswald', 'Bebas Neue',
      'Caveat', 'Great Vibes', 'Satisfy', 'Shadows Into Light',
    ],
    this.initialCanvasJson,
  });

  @override
  ConsumerState<FullCanvasEditor> createState() => _FullCanvasEditorState();
}

class _FullCanvasEditorState extends ConsumerState<FullCanvasEditor> {
  // Multiple designs (for "Add another design" flow)
  final List<_Design> _designs = [_Design()];
  int _activeDesign = 0;
  List<CanvasElement> get _elements => _designs[_activeDesign].elements;
  List<List<CanvasElement>> get _undo => _designs[_activeDesign].undoStack;
  List<List<CanvasElement>> get _redo => _designs[_activeDesign].redoStack;

  String? _selectedId;
  bool _preview = false;
  int _idCounter = 0;

  // Gesture tracking (element-level)
  double _startScale = 1, _startRotation = 0;
  Offset _startFocal = Offset.zero;
  double _startX = 0, _startY = 0;

  // ── Phase B: canvas-level pinch-zoom (viewport only, not design data) ──
  double _viewScale = 1.0;
  double _viewScaleStart = 1.0;

  // ── Phase C: extracted palette from last uploaded image ─────────────────
  List<Color> _extractedPalette = [];

  // ── Phase C: QR tool state ───────────────────────────────────────────────
  bool _qrToolOpen = false;
  String _qrUrl = 'https://gifteeng.com';
  Color _qrFgColor = const Color(0xFF1A1A2E);

  // ── Phase B: floating mini-toolbar position above selected element ───────
  // Computed from the selected element's position every time selection changes
  Offset? _floatingToolbarPos;

  Size _canvasSize = Size.zero;
  final _screenshotCtrl = ScreenshotController();

  @override
  void initState() {
    super.initState();
    if (widget.initialCanvasJson != null) {
      _applyTemplateJson(widget.initialCanvasJson!);
    }
  }

  void _applyTemplateJson(String json) {
    try {
      final parsed = jsonDecode(json) as Map<String, dynamic>;
      final objects = (parsed['objects'] as List?) ?? [];
      final elements = <CanvasElement>[];
      for (final obj in objects) {
        if (obj is Map<String, dynamic>) {
          final el = CanvasElement.fromFabric(obj, _newId());
          if (el != null) elements.add(el);
        }
      }
      if (elements.isNotEmpty) {
        _designs[0].elements
          ..clear()
          ..addAll(elements);
      }
    } catch (_) { /* malformed JSON — start blank */ }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  String _newId() => 'el_${++_idCounter}_${DateTime.now().microsecondsSinceEpoch}';

  /// Update the floating mini-toolbar anchor above the selected element.
  void _updateFloatingPos() {
    final sel = _selected;
    if (sel == null || _canvasSize == Size.zero) {
      _floatingToolbarPos = null;
      return;
    }
    // Position toolbar 40px above the element center
    final yAbove = (sel.y * _viewScale) - (sel.baseHeight * sel.scale * _viewScale / 2) - 44;
    _floatingToolbarPos = Offset(sel.x * _viewScale, yAbove.clamp(4, _canvasSize.height - 40));
  }

  void _snapshot() {
    _undo.add(_elements.map((e) => e.clone(e.id)).toList());
    if (_undo.length > 30) _undo.removeAt(0);
    _redo.clear();
  }

  void _undoLast() {
    if (_undo.isEmpty) return;
    HapticFeedback.selectionClick();
    setState(() {
      _redo.add(_elements.map((e) => e.clone(e.id)).toList());
      final last = _undo.removeLast();
      _elements..clear()..addAll(last);
      _selectedId = null;
    });
  }

  void _redoLast() {
    if (_redo.isEmpty) return;
    HapticFeedback.selectionClick();
    setState(() {
      _undo.add(_elements.map((e) => e.clone(e.id)).toList());
      final next = _redo.removeLast();
      _elements..clear()..addAll(next);
      _selectedId = null;
    });
  }

  CanvasElement? get _selected =>
      _selectedId == null ? null
          : _elements.firstWhere((e) => e.id == _selectedId,
              orElse: () => _elements.isEmpty
                  ? CanvasElement(id: '', type: 'text', x: 0, y: 0)
                  : _elements.first);

  // ─── Add element actions ────────────────────────────────────────────────

  Future<void> _addText() async {
    if (_canvasSize == Size.zero) return;
    HapticFeedback.selectionClick();
    final result = await _showTextEditor(
      initialText: 'Your text here',
      fontFamily: 'Inter',
      color: Colors.white,
      fontSize: 32,
      fontWeight: FontWeight.w700,
      align: 'center',
    );
    if (result == null) return;
    _snapshot();
    final id = _newId();
    setState(() {
      _elements.add(CanvasElement(
        id: id, type: 'text',
        x: _canvasSize.width / 2, y: _canvasSize.height / 2,
        text: result['text'] as String,
        fontFamily: result['font'] as String,
        color: result['color'] as Color,
        fontSize: result['size'] as double,
        fontWeight: result['weight'] as FontWeight,
        textAlign: result['align'] as String,
      ));
      _selectedId = id;
    });
  }

  Future<void> _addImage() async {
    if (_canvasSize == Size.zero) return;
    HapticFeedback.selectionClick();
    try {
      final xf = await ImagePicker()
          .pickImage(source: ImageSource.gallery, imageQuality: 85);
      if (xf == null) return;
      final bytes = await xf.readAsBytes();
      _snapshot();
      final id = _newId();
      final target = _canvasSize.width * 0.45;
      setState(() {
        _elements.add(CanvasElement(
          id: id, type: 'image',
          x: _canvasSize.width / 2, y: _canvasSize.height / 2,
          bytes: bytes, baseWidth: target, baseHeight: target,
        ));
        _selectedId = id;
        _updateFloatingPos();
      });
      // ── Phase C: palette_generator — extract colors from uploaded image ──
      _extractPalette(bytes);
    } catch (e) {
      _snack('Could not pick image: $e');
    }
  }

  /// Extracts a 6-color palette from raw image bytes using palette_generator.
  Future<void> _extractPalette(Uint8List bytes) async {
    try {
      final codec = await ui.instantiateImageCodec(bytes, targetWidth: 200);
      final frame = await codec.getNextFrame();
      final provider = MemoryImage(bytes);
      final generator = await PaletteGenerator.fromImageProvider(
        provider, maximumColorCount: 6,
      );
      final colors = [
        if (generator.dominantColor != null) generator.dominantColor!.color,
        ...generator.paletteColors.map((c) => c.color),
      ].take(6).toList();
      if (mounted) setState(() => _extractedPalette = colors);
      frame.image.dispose();
    } catch (_) { /* silently ignore — palette is optional */ }
  }

  Future<void> _addShape() async {
    if (_canvasSize == Size.zero) return;
    HapticFeedback.selectionClick();
    final shape = await _showShapePicker();
    if (shape == null) return;
    // Custom "shape" is really an image upload — reuse the image picker.
    if (shape == ShapeKind.custom) {
      await _addImage();
      return;
    }
    _snapshot();
    final id = _newId();
    final size = _canvasSize.width * 0.28;
    setState(() {
      _elements.add(CanvasElement(
        id: id, type: 'shape',
        x: _canvasSize.width / 2, y: _canvasSize.height / 2,
        baseWidth: size, baseHeight: size,
        shapeKind: shape,
      ));
      _selectedId = id;
    });
  }

  /// Phase C: Renders a PrettyQrCode widget to image bytes and adds to canvas.
  Future<void> _addQrCode() async {
    if (_canvasSize == Size.zero) return;
    HapticFeedback.selectionClick();
    try {
      final qrWidget = PrettyQrView.data(
        data: _qrUrl.isEmpty ? 'https://gifteeng.com' : _qrUrl,
        decoration: PrettyQrDecoration(
          shape: PrettyQrSmoothSymbol(color: _qrFgColor, roundFactor: 1),
        ),
      );

      final imageBytes = await _renderWidgetToBytes(qrWidget, 300, 300);
      if (imageBytes == null) { _snack('QR render failed'); return; }

      _snapshot();
      final id = _newId();
      final size = _canvasSize.width * 0.35;
      setState(() {
        _elements.add(CanvasElement(
          id: id, type: 'image',
          x: _canvasSize.width / 2, y: _canvasSize.height / 2,
          bytes: imageBytes, baseWidth: size, baseHeight: size,
        ));
        _selectedId = id;
        _qrToolOpen = false;
        _updateFloatingPos();
      });
    } catch (e) {
      _snack('Could not add QR: $e');
    }
  }

  /// Renders a widget to PNG bytes using ScreenshotController off-screen capture.
  Future<Uint8List?> _renderWidgetToBytes(Widget widget, double w, double h) async {
    try {
      final ctrl = ScreenshotController();
      return await ctrl.captureFromLongWidget(
        MediaQuery(
          data: const MediaQueryData(),
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            home: Scaffold(
              backgroundColor: Colors.white,
              body: Center(
                child: SizedBox(width: w, height: h, child: widget),
              ),
            ),
          ),
        ),
        pixelRatio: 2,
        delay: const Duration(milliseconds: 100),
      );
    } catch (_) { return null; }
  }

  void _deleteSelected() {
    if (_selectedId == null) return;
    _snapshot();
    HapticFeedback.heavyImpact();
    setState(() {
      _elements.removeWhere((e) => e.id == _selectedId);
      _selectedId = null;
      _floatingToolbarPos = null;
    });
  }

  void _duplicateSelected() {
    final sel = _selected;
    if (sel == null) return;
    _snapshot();
    HapticFeedback.lightImpact();
    final copy = sel.clone(_newId());
    setState(() {
      _elements.add(copy);
      _selectedId = copy.id;
    });
  }

  // ─── Layer controls ─────────────────────────────────────────────────────

  void _bringForward() {
    if (_selected == null) return;
    final i = _elements.indexWhere((e) => e.id == _selectedId);
    if (i == -1 || i >= _elements.length - 1) return;
    _snapshot();
    HapticFeedback.selectionClick();
    setState(() {
      final el = _elements.removeAt(i);
      _elements.insert(i + 1, el);
    });
  }

  void _sendBackward() {
    if (_selected == null) return;
    final i = _elements.indexWhere((e) => e.id == _selectedId);
    if (i <= 0) return;
    _snapshot();
    HapticFeedback.selectionClick();
    setState(() {
      final el = _elements.removeAt(i);
      _elements.insert(i - 1, el);
    });
  }

  void _bringToFront() {
    if (_selected == null) return;
    final i = _elements.indexWhere((e) => e.id == _selectedId);
    if (i == -1 || i >= _elements.length - 1) return;
    _snapshot();
    HapticFeedback.mediumImpact();
    setState(() {
      final el = _elements.removeAt(i);
      _elements.add(el);
    });
  }

  void _sendToBack() {
    if (_selected == null) return;
    final i = _elements.indexWhere((e) => e.id == _selectedId);
    if (i <= 0) return;
    _snapshot();
    HapticFeedback.mediumImpact();
    setState(() {
      final el = _elements.removeAt(i);
      _elements.insert(0, el);
    });
  }

  // ─── Edit text ──────────────────────────────────────────────────────────

  Future<void> _editSelectedText() async {
    final sel = _selected;
    if (sel == null || sel.type != 'text') return;
    final result = await _showTextEditor(
      initialText: sel.text, fontFamily: sel.fontFamily,
      color: sel.color, fontSize: sel.fontSize,
      fontWeight: sel.fontWeight, align: sel.textAlign,
      isEditing: true,
    );
    if (result == null) return;
    _snapshot();
    setState(() {
      sel.text       = result['text'] as String;
      sel.fontFamily = result['font'] as String;
      sel.color      = result['color'] as Color;
      sel.fontSize   = result['size'] as double;
      sel.fontWeight = result['weight'] as FontWeight;
      sel.textAlign  = result['align'] as String;
    });
  }

  /// Open a shape color picker for the selected shape element.
  Future<void> _editShapeColor() async {
    final sel = _selected;
    if (sel == null || sel.type != 'shape') return;
    final c = await _showColorPicker(context, sel.fillColor);
    if (c == null) return;
    _snapshot();
    setState(() => sel.fillColor = c);
  }

  // ─── Design tabs (Add another design) ───────────────────────────────────

  void _addAnotherDesign() {
    HapticFeedback.mediumImpact();
    setState(() {
      _designs.add(_Design());
      _activeDesign = _designs.length - 1;
      _selectedId = null;
    });
  }

  void _switchDesign(int i) {
    if (i < 0 || i >= _designs.length) return;
    HapticFeedback.selectionClick();
    setState(() { _activeDesign = i; _selectedId = null; });
  }

  void _removeDesign(int i) {
    if (_designs.length == 1) return;
    HapticFeedback.mediumImpact();
    setState(() {
      _designs.removeAt(i);
      if (_activeDesign >= _designs.length) _activeDesign = _designs.length - 1;
      _selectedId = null;
    });
  }

  // ─── Gestures ───────────────────────────────────────────────────────────

  void _onScaleStart(CanvasElement e, ScaleStartDetails d) {
    if (_preview) return;
    _snapshot();
    _startScale    = e.scale;
    _startRotation = e.rotation;
    _startFocal    = d.focalPoint;
    _startX        = e.x;
    _startY        = e.y;
    setState(() => _selectedId = e.id);
  }

  void _onScaleUpdate(CanvasElement e, ScaleUpdateDetails d) {
    if (_preview) return;
    final delta = d.focalPoint - _startFocal;
    setState(() {
      e.x = (_startX + delta.dx).clamp(0.0, _canvasSize.width);
      e.y = (_startY + delta.dy).clamp(0.0, _canvasSize.height);
      e.scale    = (_startScale * d.scale).clamp(0.2, 6.0);
      e.rotation = _startRotation + d.rotation;
    });
  }

  // ─── Download as image ──────────────────────────────────────────────────

  Future<void> _download() async {
    HapticFeedback.selectionClick();
    try {
      // Clear selection + preview so the screenshot has no handles.
      final hadSelection = _selectedId != null;
      if (hadSelection) setState(() => _selectedId = null);
      await Future.delayed(const Duration(milliseconds: 120));

      final bytes = await _screenshotCtrl.capture(
        pixelRatio: 3,
        delay: const Duration(milliseconds: 80),
      );
      if (bytes == null) throw 'capture failed';

      // Write to temp file + save to gallery via gallery_saver_plus
      final dir = await getTemporaryDirectory();
      final file = File(
          '${dir.path}/gifteeng_design_${DateTime.now().millisecondsSinceEpoch}.png');
      await file.writeAsBytes(bytes);
      final ok = await GallerySaver.saveImage(file.path, albumName: 'Gifteeng');
      _snack(ok == true ? '📥 Saved to gallery' : 'Could not save image');
    } catch (e) {
      _snack('Download failed: $e');
    }
  }

  // ─── Templates (from admin API + fallback) ─────────────────────────────

  Future<void> _openTemplates() async {
    HapticFeedback.selectionClick();
    final bottomInset = MediaQuery.of(context).padding.bottom;
    final picked = await showModalBottomSheet<List<Map<String, dynamic>>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: GColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _TemplatesSheet(bottomInset: bottomInset),
    );
    if (picked == null || picked.isEmpty) return;
    // Replace elements with template's fabric-style objects.
    _snapshot();
    setState(() {
      _elements.clear();
      for (final obj in picked) {
        _elements.add(_fromFabric(obj, _canvasSize));
      }
      _selectedId = null;
    });
  }

  CanvasElement _fromFabric(Map<String, dynamic> obj, Size canvas) {
    final id = _newId();
    final type = (obj['type'] as String? ?? 'text').toLowerCase();
    final x = (obj['left'] as num?)?.toDouble() ?? canvas.width / 2;
    final y = (obj['top']  as num?)?.toDouble() ?? canvas.height / 2;
    final sc = (obj['scaleX'] as num?)?.toDouble() ?? 1.0;
    final ang = (obj['angle'] as num?)?.toDouble() ?? 0.0;
    if (type.contains('text')) {
      return CanvasElement(
        id: id, type: 'text',
        x: x, y: y, scale: sc, rotation: ang * math.pi / 180,
        text: obj['text']?.toString() ?? 'Text',
        fontFamily: obj['fontFamily']?.toString() ?? 'Inter',
        fontSize: (obj['fontSize'] as num?)?.toDouble() ?? 32,
        fontWeight: FontWeight.values.firstWhere(
          (w) => w.value == (obj['fontWeight'] as num?)?.toInt(),
          orElse: () => FontWeight.w700,
        ),
        color: _parseHex(obj['fill']?.toString()) ?? Colors.white,
        textAlign: obj['textAlign']?.toString() ?? 'center',
      );
    }
    if (type == 'image') {
      return CanvasElement(
        id: id, type: 'image',
        x: x, y: y, scale: sc, rotation: ang * math.pi / 180,
        imageUrl: obj['src']?.toString(),
        baseWidth: (obj['width'] as num?)?.toDouble() ?? 120,
        baseHeight: (obj['height'] as num?)?.toDouble() ?? 120,
      );
    }
    // Shape
    final kindName = obj['gShapeKind']?.toString() ?? 'rect';
    final kind = ShapeKind.values.firstWhere(
        (k) => k.name == kindName, orElse: () => ShapeKind.rect);
    return CanvasElement(
      id: id, type: 'shape',
      x: x, y: y, scale: sc, rotation: ang * math.pi / 180,
      baseWidth: (obj['width'] as num?)?.toDouble() ?? 100,
      baseHeight: (obj['height'] as num?)?.toDouble() ?? 100,
      shapeKind: kind,
      fillColor: _parseHex(obj['fill']?.toString()) ?? const Color(0xFFEC4899),
    );
  }

  Color? _parseHex(String? h) {
    if (h == null || h.isEmpty) return null;
    final s = h.replaceAll('#', '');
    if (s.length == 6) return Color(int.parse('FF$s', radix: 16));
    if (s.length == 8) return Color(int.parse(s, radix: 16));
    return null;
  }

  // ─── Layers panel ───────────────────────────────────────────────────────

  Future<void> _openLayers() async {
    HapticFeedback.selectionClick();
    final bottomInset = MediaQuery.of(context).padding.bottom;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: GColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(builder: (ctx, setModal) {
        void refresh() {
          setModal(() {});
          setState(() {});
        }
        return Container(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(ctx).size.height * 0.7),
          padding: EdgeInsets.fromLTRB(20, 12, 20, bottomInset + 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(child: Container(
                width: 42, height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: GColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              )),
              Row(children: [
                Text('Layers', style: GoogleFonts.inter(
                  fontSize: 18, fontWeight: FontWeight.w800, color: GColors.text0)),
                const Spacer(),
                Text('${_elements.length} elements',
                  style: GoogleFonts.inter(fontSize: 11, color: GColors.text2)),
              ]),
              const Gap(4),
              Text('Drag to reorder. Top = front, bottom = back.',
                style: GoogleFonts.inter(fontSize: 11, color: GColors.text2)),
              const Gap(12),
              Flexible(
                child: _elements.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.symmetric(vertical: 40),
                      child: Text('No elements yet. Add text, image, or shape.',
                        style: GoogleFonts.inter(color: GColors.text2)),
                    )
                  : ReorderableListView.builder(
                      shrinkWrap: true,
                      itemCount: _elements.length,
                      // Reverse order so top of list = front of canvas.
                      itemBuilder: (_, i) {
                        final idx = _elements.length - 1 - i;
                        final e = _elements[idx];
                        return Padding(
                          key: ValueKey(e.id),
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: e.id == _selectedId
                                  ? GColors.brand.withValues(alpha: 0.1)
                                  : GColors.bg2,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: e.id == _selectedId
                                    ? GColors.brand : GColors.border,
                              ),
                            ),
                            child: Row(children: [
                              Container(
                                width: 36, height: 36,
                                decoration: BoxDecoration(
                                  color: GColors.bg1,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Center(child: Text(e.previewEmoji,
                                    style: const TextStyle(fontSize: 18))),
                              ),
                              const Gap(10),
                              Expanded(child: Text(e.shortLabel,
                                maxLines: 1, overflow: TextOverflow.ellipsis,
                                style: GoogleFonts.inter(
                                  fontSize: 13, fontWeight: FontWeight.w600,
                                  color: GColors.text0))),
                              GestureDetector(
                                onTap: () {
                                  e.visible = !e.visible;
                                  refresh();
                                },
                                child: Padding(
                                  padding: const EdgeInsets.all(6),
                                  child: Icon(
                                    e.visible ? Icons.visibility_outlined
                                              : Icons.visibility_off_outlined,
                                    size: 16, color: GColors.text1),
                                ),
                              ),
                              GestureDetector(
                                onTap: () {
                                  _elements.removeWhere((x) => x.id == e.id);
                                  if (_selectedId == e.id) _selectedId = null;
                                  refresh();
                                },
                                child: const Padding(
                                  padding: EdgeInsets.all(6),
                                  child: Icon(Icons.delete_outline_rounded,
                                      size: 16, color: GColors.rose),
                                ),
                              ),
                              GestureDetector(
                                onTap: () {
                                  _selectedId = e.id;
                                  refresh();
                                  Navigator.pop(ctx);
                                },
                                child: const Padding(
                                  padding: EdgeInsets.all(6),
                                  child: Icon(Icons.open_in_new_rounded,
                                      size: 16, color: GColors.text1),
                                ),
                              ),
                              const ReorderableDragStartListener(
                                index: 0, // index is set via outer item's key
                                child: Padding(
                                  padding: EdgeInsets.all(6),
                                  child: Icon(Icons.drag_indicator,
                                      size: 18, color: GColors.text2),
                                ),
                              ),
                            ]),
                          ),
                        );
                      },
                      onReorder: (oldVisible, newVisible) {
                        final oldIdx = _elements.length - 1 - oldVisible;
                        var newIdx = _elements.length - 1 - newVisible;
                        if (newIdx < 0) newIdx = 0;
                        if (newIdx >= _elements.length) newIdx = _elements.length - 1;
                        _snapshot();
                        final el = _elements.removeAt(oldIdx);
                        _elements.insert(newIdx, el);
                        refresh();
                      },
                    ),
              ),
            ],
          ),
        );
      }),
    );
  }

  // ─── Save ───────────────────────────────────────────────────────────────

  void _save() {
    if (_canvasSize == Size.zero) return;
    if (_designs.length == 1) {
      widget.onSave({
        'type': 'fabric',
        'baseImage': widget.baseImageUrl,
        'canvas': {
          'version': '5.3.0',
          'width': _canvasSize.width,
          'height': _canvasSize.height,
          'background': '',
          'objects': _designs.first.elements.map((e) => e.toFabric()).toList(),
        },
      });
    } else {
      widget.onSave({
        'type': 'fabric-multi',
        'baseImage': widget.baseImageUrl,
        'designs': _designs.map((d) => {
          'version': '5.3.0',
          'width': _canvasSize.width,
          'height': _canvasSize.height,
          'background': '',
          'objects': d.elements.map((e) => e.toFabric()).toList(),
        }).toList(),
      });
    }
  }

  // ─── Snack ──────────────────────────────────────────────────────────────

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg, style: GoogleFonts.inter(color: GColors.text0)),
      backgroundColor: GColors.bg2,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      duration: const Duration(seconds: 2),
    ));
  }

  // ─── Text editor sheet ──────────────────────────────────────────────────

  Future<Map<String, dynamic>?> _showTextEditor({
    required String initialText,
    required String fontFamily,
    required Color color,
    required double fontSize,
    required FontWeight fontWeight,
    required String align,
    bool isEditing = false,
  }) async {
    final ctrl = TextEditingController(text: initialText);
    String pickedFont = fontFamily;
    Color pickedColor = color;
    double pickedSize = fontSize;
    FontWeight pickedWeight = fontWeight;
    String pickedAlign = align;

    final bottomInset = MediaQuery.of(context).padding.bottom;
    return showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: GColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(builder: (ctx, setModal) => Padding(
        padding: EdgeInsets.only(
          left: 20, right: 20, top: 20,
          bottom: math.max(MediaQuery.of(ctx).viewInsets.bottom, bottomInset) + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Edit Text', style: GoogleFonts.inter(
              fontSize: 18, fontWeight: FontWeight.w800, color: GColors.text0)),
            const Gap(14),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: GColors.bg2,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: GColors.border),
              ),
              child: TextField(
                controller: ctrl, autofocus: true, maxLines: 3,
                style: GoogleFonts.getFont(
                  pickedFont, fontSize: 18, color: pickedColor,
                  fontWeight: pickedWeight),
                decoration: InputDecoration(
                  hintText: 'Type your message…',
                  hintStyle: GoogleFonts.inter(color: GColors.text2),
                  border: InputBorder.none,
                ),
              ),
            ),
            const Gap(14),
            Text('Font', style: _sectionLabelStyle),
            const Gap(8),
            SizedBox(
              height: 44,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: widget.availableFonts.length,
                separatorBuilder: (_, __) => const Gap(8),
                itemBuilder: (_, i) {
                  final f = widget.availableFonts[i];
                  final sel = pickedFont == f;
                  return GestureDetector(
                    onTap: () => setModal(() => pickedFont = f),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: sel ? GColors.brand.withValues(alpha: 0.12) : GColors.bg2,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: sel ? GColors.brand : GColors.border,
                          width: sel ? 1.5 : 1,
                        ),
                      ),
                      child: Text(f, style: GoogleFonts.getFont(f,
                        fontSize: 14, fontWeight: FontWeight.w600,
                        color: sel ? GColors.brand : GColors.text0)),
                    ),
                  );
                },
              ),
            ),
            const Gap(14),
            Row(children: [
              Text('Size', style: _sectionLabelStyle),
              const Gap(10),
              Expanded(child: Slider(
                value: pickedSize, min: 14, max: 80,
                activeColor: GColors.brand, inactiveColor: GColors.border,
                onChanged: (v) => setModal(() => pickedSize = v),
              )),
              Text('${pickedSize.toInt()}',
                style: GoogleFonts.inter(
                  fontSize: 13, fontWeight: FontWeight.w700, color: GColors.brand)),
            ]),
            const Gap(4),
            Row(children: [
              Text('Align', style: _sectionLabelStyle),
              const Gap(10),
              ...['left', 'center', 'right'].map((a) {
                final sel = pickedAlign == a;
                return Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: GestureDetector(
                    onTap: () => setModal(() => pickedAlign = a),
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: sel ? GColors.brand.withValues(alpha: 0.12) : GColors.bg2,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: sel ? GColors.brand : GColors.border),
                      ),
                      child: Icon(
                        a == 'left' ? Icons.format_align_left
                          : a == 'center' ? Icons.format_align_center
                          : Icons.format_align_right,
                        size: 16, color: sel ? GColors.brand : GColors.text1),
                    ),
                  ),
                );
              }),
              const Spacer(),
              GestureDetector(
                onTap: () => setModal(() => pickedWeight = pickedWeight == FontWeight.w900
                    ? FontWeight.w400 : FontWeight.w900),
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: pickedWeight.value > 600
                        ? GColors.brand.withValues(alpha: 0.12) : GColors.bg2,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: pickedWeight.value > 600 ? GColors.brand : GColors.border),
                  ),
                  child: const Icon(Icons.format_bold, size: 16,
                      color: GColors.text1),
                ),
              ),
            ]),
            const Gap(14),
            Text('Color', style: _sectionLabelStyle),
            const Gap(8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              ..._paletteColors.map((c) => GestureDetector(
                onTap: () => setModal(() => pickedColor = c),
                child: Container(
                  width: 32, height: 32,
                  decoration: BoxDecoration(
                    color: c, shape: BoxShape.circle,
                    border: Border.all(
                      color: pickedColor.value == c.value
                          ? GColors.brand : Colors.white.withValues(alpha: 0.15),
                      width: pickedColor.value == c.value ? 3 : 1,
                    ),
                  ),
                ),
              )),
              GestureDetector(
                onTap: () async {
                  final c = await _showColorPicker(ctx, pickedColor);
                  if (c != null) setModal(() => pickedColor = c);
                },
                child: Container(
                  width: 32, height: 32,
                  decoration: BoxDecoration(
                    gradient: const SweepGradient(colors: [
                      Color(0xFFEF4444), Color(0xFFF59E0B), Color(0xFFEAB308),
                      Color(0xFF22C55E), Color(0xFF3B82F6), Color(0xFF8B5CF6),
                      Color(0xFFEF4444),
                    ]),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 2),
                  ),
                ),
              ),
            ]),
            const Gap(18),
            Row(children: [
              Expanded(child: GestureDetector(
                onTap: () => Navigator.pop(ctx, null),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: GColors.bg2,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: GColors.border),
                  ),
                  child: Center(child: Text('Cancel',
                    style: GoogleFonts.inter(
                      fontSize: 14, fontWeight: FontWeight.w700, color: GColors.text1))),
                ),
              )),
              const Gap(10),
              Expanded(flex: 2, child: GestureDetector(
                onTap: () {
                  if (ctrl.text.trim().isEmpty) return;
                  Navigator.pop(ctx, {
                    'text': ctrl.text.trim(),
                    'font': pickedFont, 'color': pickedColor,
                    'size': pickedSize, 'weight': pickedWeight,
                    'align': pickedAlign,
                  });
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  decoration: BoxDecoration(
                    color: GColors.brand,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Center(child: Text(isEditing ? 'Update' : 'Add Text',
                    style: GoogleFonts.inter(
                      fontSize: 14, fontWeight: FontWeight.w800, color: Colors.white))),
                ),
              )),
            ]),
          ],
        ),
      )),
    );
  }

  Future<ShapeKind?> _showShapePicker() async {
    final bottomInset = MediaQuery.of(context).padding.bottom;
    return showModalBottomSheet<ShapeKind>(
      context: context,
      backgroundColor: GColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, bottomInset + 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Pick a shape', style: GoogleFonts.inter(
              fontSize: 18, fontWeight: FontWeight.w800, color: GColors.text0)),
            const Gap(16),
            Wrap(spacing: 12, runSpacing: 12, children: [
              _shapeTile(ctx, ShapeKind.rect,     '⬛', 'Square'),
              _shapeTile(ctx, ShapeKind.circle,   '⚫', 'Circle'),
              _shapeTile(ctx, ShapeKind.triangle, '🔺', 'Triangle'),
              _shapeTile(ctx, ShapeKind.star,     '⭐', 'Star'),
              _shapeTile(ctx, ShapeKind.heart,    '❤️', 'Heart'),
              _shapeTile(ctx, ShapeKind.diamond,  '💎', 'Diamond'),
              _shapeTile(ctx, ShapeKind.hexagon,  '⬡', 'Hexagon'),
              _shapeTile(ctx, ShapeKind.custom,   '🖼️', 'Custom'),
            ]),
            const Gap(10),
          ],
        ),
      ),
    );
  }

  Widget _shapeTile(BuildContext ctx, ShapeKind kind, String emoji, String label) {
    return GestureDetector(
      onTap: () => Navigator.pop(ctx, kind),
      child: Container(
        width: 82,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
        decoration: BoxDecoration(
          color: GColors.bg2,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: GColors.border),
        ),
        child: Column(children: [
          Text(emoji, style: const TextStyle(fontSize: 28)),
          const Gap(4),
          Text(label, style: GoogleFonts.inter(
            fontSize: 11, fontWeight: FontWeight.w600, color: GColors.text1)),
        ]),
      ),
    );
  }

  Future<Color?> _showColorPicker(BuildContext ctx, Color current) async {
    Color picked = current;
    return showDialog<Color>(
      context: ctx,
      builder: (d) => AlertDialog(
        backgroundColor: GColors.bg1,
        title: Text('Pick a color', style: GoogleFonts.inter(
          fontSize: 16, fontWeight: FontWeight.w700, color: GColors.text0)),
        content: SingleChildScrollView(
          child: ColorPicker(
            pickerColor: current,
            onColorChanged: (c) => picked = c,
            labelTypes: const [],
            pickerAreaHeightPercent: 0.7,
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, picked),
            child: Text('Select', style: GoogleFonts.inter(color: GColors.brand))),
        ],
      ),
    );
  }

  static const _paletteColors = [
    Colors.white, Colors.black,
    Color(0xFFEF4444), Color(0xFFF59E0B), Color(0xFFFACC15),
    Color(0xFF22C55E), Color(0xFF3B82F6), Color(0xFFEC4899),
    Color(0xFF8B5CF6),
  ];

  TextStyle get _sectionLabelStyle => GoogleFonts.inter(
      fontSize: 11, fontWeight: FontWeight.w800,
      color: GColors.text2, letterSpacing: 0.5);

  // ─── Build ──────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    // ── Phase C: hardware keyboard shortcuts (tablet/desktop / Bluetooth kbd) ──
    return Focus(
      autofocus: true,
      onKeyEvent: (node, event) {
        if (event is! KeyDownEvent) return KeyEventResult.ignored;
        final isCtrl = HardwareKeyboard.instance.isControlPressed ||
                       HardwareKeyboard.instance.isMetaPressed;
        // Delete / Backspace
        if (event.logicalKey == LogicalKeyboardKey.delete ||
            event.logicalKey == LogicalKeyboardKey.backspace) {
          if (_selectedId != null) { _deleteSelected(); return KeyEventResult.handled; }
        }
        if (isCtrl) {
          if (event.logicalKey == LogicalKeyboardKey.keyZ &&
              !HardwareKeyboard.instance.isShiftPressed) {
            _undoLast(); return KeyEventResult.handled;
          }
          if ((event.logicalKey == LogicalKeyboardKey.keyZ &&
               HardwareKeyboard.instance.isShiftPressed) ||
              event.logicalKey == LogicalKeyboardKey.keyY) {
            _redoLast(); return KeyEventResult.handled;
          }
          if (event.logicalKey == LogicalKeyboardKey.keyD && _selectedId != null) {
            _duplicateSelected(); return KeyEventResult.handled;
          }
        }
        return KeyEventResult.ignored;
      },
      child: Column(
        children: [
          // Top toolbar
          _buildTopBar(),
          // Canvas
          Expanded(child: _buildCanvas()),
          // Action bar (when selected)
          if (_selected != null && !_preview) _buildActionBar(_selected!),
          // Design tabs
          _buildDesignTabs(),
          // Bottom toolbar
          if (!_preview) _buildBottomToolbar(),
        ],
      ),
    );
  }

  Widget _buildTopBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: const BoxDecoration(
        color: GColors.bg1,
        border: Border(bottom: BorderSide(color: GColors.border)),
      ),
      child: Row(children: [
        _TopIcon(icon: Icons.undo_rounded, enabled: _undo.isNotEmpty,
            tooltip: 'Undo', onTap: _undoLast),
        _TopIcon(icon: Icons.redo_rounded, enabled: _redo.isNotEmpty,
            tooltip: 'Redo', onTap: _redoLast),
        _TopIcon(icon: Icons.layers_outlined, enabled: true,
            tooltip: 'Layers', onTap: _openLayers),
        _TopIcon(
          icon: _preview ? Icons.visibility_off_outlined : Icons.visibility_outlined,
          enabled: true,
          tooltip: _preview ? 'Exit preview' : 'Preview',
          active: _preview,
          onTap: () => setState(() => _preview = !_preview),
        ),
        _TopIcon(icon: Icons.download_rounded, enabled: true,
            tooltip: 'Download', onTap: _download),
        const Spacer(),
        Text('${_elements.length} element${_elements.length == 1 ? '' : 's'}',
          style: GoogleFonts.inter(
            fontSize: 11, fontWeight: FontWeight.w600, color: GColors.text2)),
        const Gap(8),
        GestureDetector(
          onTap: _save,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
            decoration: BoxDecoration(
              color: GColors.brand,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(children: [
              const Icon(Icons.check_rounded, size: 14, color: Colors.white),
              const Gap(4),
              Text('Save', style: GoogleFonts.inter(
                fontSize: 13, fontWeight: FontWeight.w800, color: Colors.white)),
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _buildCanvas() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: AspectRatio(
          aspectRatio: widget.aspectRatio,
          child: LayoutBuilder(
            builder: (ctx, constraints) {
              _canvasSize = Size(constraints.maxWidth, constraints.maxHeight);
              return GestureDetector(
                // Tap outside all elements → deselect
                onTap: () => setState(() {
                  _selectedId = null;
                  _floatingToolbarPos = null;
                }),
                // ── Phase B: canvas-level pinch-to-zoom ───────────────────
                onScaleStart: (d) {
                  if (d.pointerCount < 2) return;
                  _viewScaleStart = _viewScale;
                },
                onScaleUpdate: (d) {
                  if (d.pointerCount < 2) return;
                  setState(() {
                    _viewScale = (_viewScaleStart * d.scale).clamp(0.5, 3.0);
                  });
                },
                child: Transform.scale(
                  scale: _viewScale,
                  alignment: Alignment.center,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Stack(
                      children: [
                        // Screenshot wraps only the design content (not the floating UI)
                        Screenshot(
                          controller: _screenshotCtrl,
                          child: Container(
                            decoration: BoxDecoration(
                              color: GColors.bg2,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: GColors.border),
                            ),
                            child: Stack(
                              children: [
                                Positioned.fill(
                                  child: CachedNetworkImage(
                                    imageUrl: widget.baseImageUrl,
                                    fit: BoxFit.cover,
                                    errorWidget: (_, __, ___) => Container(
                                      color: GColors.bg2,
                                      child: const Center(
                                        child: Icon(Icons.image_not_supported_outlined,
                                            color: GColors.text2, size: 40),
                                      ),
                                    ),
                                  ),
                                ),
                                for (final e in _elements)
                                  if (e.visible) _buildElement(e),
                              ],
                            ),
                          ),
                        ),
                        // ── Phase B: floating mini-toolbar above selection ──
                        if (_floatingToolbarPos != null && _selectedId != null && !_preview)
                          _buildFloatingSelectionToolbar(),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  /// Phase B: compact floating toolbar that appears above the selected element.
  /// Mirrors the web @floating-ui/react toolbar (delete, duplicate, forward, back).
  Widget _buildFloatingSelectionToolbar() {
    final pos = _floatingToolbarPos!;
    return Positioned(
      left: (pos.dx - 72).clamp(4.0, _canvasSize.width - 148),
      top: pos.dy.clamp(4.0, _canvasSize.height - 44),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF1f1f23),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 12)],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _FloatingBtn(icon: Icons.delete_outline_rounded, color: Colors.red.shade300,
                tooltip: 'Delete', onTap: _deleteSelected),
            _divider(),
            _FloatingBtn(icon: Icons.copy_outlined, tooltip: 'Duplicate',
                onTap: _duplicateSelected),
            _FloatingBtn(icon: Icons.arrow_upward_rounded, tooltip: 'Bring Forward',
                onTap: _bringForward),
            _FloatingBtn(icon: Icons.arrow_downward_rounded, tooltip: 'Send Backward',
                onTap: _sendBackward),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 140.ms).scale(begin: const Offset(0.85, 0.85));
  }

  Widget _divider() => Container(width: 1, height: 24,
      margin: const EdgeInsets.symmetric(horizontal: 1),
      color: Colors.white.withValues(alpha: 0.1));

  Widget _buildElement(CanvasElement e) {
    final isSelected = _selectedId == e.id && !_preview;

    Widget content;
    if (e.type == 'text') {
      content = Text(
        e.text,
        textAlign: e.textAlign == 'left' ? TextAlign.left
                 : e.textAlign == 'right' ? TextAlign.right
                 : TextAlign.center,
        style: GoogleFonts.getFont(e.fontFamily,
          fontSize: e.fontSize, color: e.color, fontWeight: e.fontWeight),
      );
    } else if (e.type == 'image') {
      content = SizedBox(
        width: e.baseWidth, height: e.baseHeight,
        child: e.bytes != null
            ? Image.memory(e.bytes!, fit: BoxFit.contain, gaplessPlayback: true)
            : e.imageUrl != null
                ? CachedNetworkImage(imageUrl: e.imageUrl!, fit: BoxFit.contain)
                : const SizedBox.shrink(),
      );
    } else {
      content = CustomPaint(
        size: Size(e.baseWidth, e.baseHeight),
        painter: _ShapePainter(
          kind: e.shapeKind, fill: e.fillColor,
          stroke: e.strokeColor, strokeWidth: e.strokeWidth,
        ),
      );
    }

    final wrapped = IntrinsicWidth(
      child: IntrinsicHeight(
        child: Container(
          padding: const EdgeInsets.all(4),
          decoration: isSelected
              ? BoxDecoration(
                  border: Border.all(
                      color: GColors.brand.withValues(alpha: 0.8), width: 1.5),
                  borderRadius: BorderRadius.circular(12),
                )
              : null,
          child: content,
        ),
      ),
    );

    return Positioned(
      left: e.x, top: e.y,
      child: FractionalTranslation(
        translation: const Offset(-0.5, -0.5),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: _preview ? null : () {
            HapticFeedback.selectionClick();
            setState(() {
              _selectedId = e.id;
              _updateFloatingPos();
            });
          },
          onDoubleTap: _preview ? null : (e.type == 'text' ? () {
            setState(() => _selectedId = e.id);
            _editSelectedText();
          } : null),
          onScaleStart:  _preview ? null : (d) => _onScaleStart(e, d),
          onScaleUpdate: _preview ? null : (d) => _onScaleUpdate(e, d),
          child: Transform.rotate(
            angle: e.rotation,
            child: Transform.scale(scale: e.scale, child: wrapped),
          ),
        ),
      ),
    );
  }

  Widget _buildActionBar(CanvasElement e) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      decoration: BoxDecoration(
        color: GColors.bg1,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: GColors.border),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [
          if (e.type == 'text')
            _ChipAction(icon: Icons.edit_outlined, label: 'Edit',
                onTap: _editSelectedText),
          if (e.type == 'shape')
            _ChipAction(icon: Icons.palette_outlined, label: 'Color',
                onTap: _editShapeColor),
          _ChipAction(icon: Icons.copy_outlined, label: 'Copy',
              onTap: _duplicateSelected),
          _ChipAction(icon: Icons.arrow_upward_rounded, label: 'Forward',
              onTap: _bringForward),
          _ChipAction(icon: Icons.arrow_downward_rounded, label: 'Back',
              onTap: _sendBackward),
          _ChipAction(icon: Icons.vertical_align_top_rounded, label: 'To Front',
              onTap: _bringToFront),
          _ChipAction(icon: Icons.vertical_align_bottom_rounded, label: 'To Back',
              onTap: _sendToBack),
          _ChipAction(icon: Icons.delete_outline_rounded, label: 'Delete',
              color: GColors.rose, onTap: _deleteSelected),
        ]),
      ),
    ).animate().fadeIn(duration: 180.ms).slideY(begin: 0.5, end: 0);
  }

  Widget _buildDesignTabs() {
    return Container(
      height: 56,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: const BoxDecoration(
        color: GColors.bg1,
        border: Border(
          top: BorderSide(color: GColors.border),
          bottom: BorderSide(color: GColors.border),
        ),
      ),
      child: Row(children: [
        Text('DESIGNS', style: GoogleFonts.inter(
          fontSize: 9, fontWeight: FontWeight.w900,
          color: GColors.text2, letterSpacing: 1)),
        const Gap(10),
        Expanded(child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: _designs.length + 1,
          separatorBuilder: (_, __) => const Gap(6),
          itemBuilder: (_, i) {
            if (i == _designs.length) {
              return GestureDetector(
                onTap: _addAnotherDesign,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  decoration: BoxDecoration(
                    color: GColors.brand.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: GColors.brand.withValues(alpha: 0.5),
                      style: BorderStyle.solid, width: 1,
                    ),
                  ),
                  child: Row(children: [
                    const Icon(Icons.add_rounded, size: 14, color: GColors.brand),
                    const Gap(4),
                    Text('Add design', style: GoogleFonts.inter(
                      fontSize: 11, fontWeight: FontWeight.w700,
                      color: GColors.brand)),
                  ]),
                ),
              );
            }
            final active = i == _activeDesign;
            return GestureDetector(
              onTap: () => _switchDesign(i),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: active ? GColors.brand.withValues(alpha: 0.12) : GColors.bg2,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: active ? GColors.brand : GColors.border,
                    width: active ? 1.5 : 1,
                  ),
                ),
                child: Row(children: [
                  Text('#${i + 1}', style: GoogleFonts.inter(
                    fontSize: 12, fontWeight: FontWeight.w800,
                    color: active ? GColors.brand : GColors.text1)),
                  const Gap(4),
                  Text('${_designs[i].elements.length}el',
                    style: GoogleFonts.inter(
                      fontSize: 9, color: GColors.text2)),
                  if (_designs.length > 1) ...[
                    const Gap(6),
                    GestureDetector(
                      onTap: () => _removeDesign(i),
                      child: const Icon(Icons.close_rounded,
                          size: 12, color: GColors.text2),
                    ),
                  ],
                ]),
              ),
            );
          },
        )),
      ]),
    );
  }

  Widget _buildBottomToolbar() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // ── Phase C: extracted palette swatches ──────────────────────────
        if (_extractedPalette.isNotEmpty)
          Container(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 0),
            color: GColors.bg1,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Palette from your image',
                  style: GoogleFonts.inter(
                    fontSize: 9, fontWeight: FontWeight.w700,
                    color: GColors.text2, letterSpacing: 0.8)),
                const Gap(4),
                Row(children: [
                  for (final c in _extractedPalette)
                    GestureDetector(
                      onTap: () {
                        // Apply color to selected element
                        final sel = _selected;
                        if (sel == null) return;
                        _snapshot();
                        setState(() {
                          if (sel.type == 'text') sel.color = c;
                          else if (sel.type == 'shape') sel.fillColor = c;
                        });
                      },
                      child: Container(
                        width: 28, height: 28,
                        margin: const EdgeInsets.only(right: 6),
                        decoration: BoxDecoration(
                          color: c,
                          shape: BoxShape.circle,
                          border: Border.all(color: GColors.border, width: 1.5),
                        ),
                      ),
                    ),
                  const Spacer(),
                  GestureDetector(
                    onTap: () => setState(() => _extractedPalette = []),
                    child: const Icon(Icons.close_rounded, size: 14, color: GColors.text2),
                  ),
                ]),
                const Gap(4),
              ],
            ),
          ).animate().fadeIn(duration: 200.ms).slideY(begin: 0.3, end: 0),

        // ── Phase C: QR tool panel (inline, expandable) ──────────────────
        if (_qrToolOpen)
          Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            color: GColors.bg1,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(children: [
                  Text('QR Code', style: GoogleFonts.inter(
                    fontSize: 11, fontWeight: FontWeight.w800,
                    color: GColors.text1)),
                  const Spacer(),
                  GestureDetector(
                    onTap: () => setState(() => _qrToolOpen = false),
                    child: const Icon(Icons.close_rounded, size: 16, color: GColors.text2),
                  ),
                ]),
                const Gap(6),
                TextField(
                  controller: TextEditingController(text: _qrUrl),
                  style: GoogleFonts.inter(fontSize: 13, color: GColors.text1),
                  decoration: InputDecoration(
                    hintText: 'https://gifteeng.com',
                    hintStyle: GoogleFonts.inter(color: GColors.text2),
                    filled: true, fillColor: GColors.bg2,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: GColors.border),
                    ),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  ),
                  onChanged: (v) => _qrUrl = v,
                ),
                const Gap(8),
                Row(children: [
                  Text('Color: ', style: GoogleFonts.inter(
                    fontSize: 11, color: GColors.text2)),
                  GestureDetector(
                    onTap: () async {
                      final c = await _showColorPicker(context, _qrFgColor);
                      if (c != null) setState(() => _qrFgColor = c);
                    },
                    child: Container(
                      width: 28, height: 28,
                      decoration: BoxDecoration(
                        color: _qrFgColor, shape: BoxShape.circle,
                        border: Border.all(color: GColors.border)),
                    ),
                  ),
                  const Gap(8),
                  // QR preview
                  SizedBox(
                    width: 48, height: 48,
                    child: PrettyQrView.data(
                      data: _qrUrl.isEmpty ? 'https://gifteeng.com' : _qrUrl,
                      decoration: PrettyQrDecoration(
                        shape: PrettyQrSmoothSymbol(color: _qrFgColor, roundFactor: 1),
                      ),
                    ),
                  ),
                  const Spacer(),
                  GestureDetector(
                    onTap: _addQrCode,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: GColors.brand,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text('Add to Design', style: GoogleFonts.inter(
                        fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
                    ),
                  ),
                ]),
              ],
            ),
          ).animate().fadeIn(duration: 180.ms).slideY(begin: 0.4, end: 0),

        // Main tool row
        Container(
          padding: EdgeInsets.fromLTRB(
              8, 8, 8, MediaQuery.of(context).padding.bottom + 20),
          decoration: const BoxDecoration(
            color: GColors.bg1,
            border: Border(top: BorderSide(color: GColors.border)),
          ),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              _BottomToolIcon(icon: Icons.text_fields_rounded, label: 'Text',
                  onTap: _addText),
              _BottomToolIcon(icon: Icons.add_photo_alternate_outlined, label: 'Image',
                  onTap: _addImage),
              _BottomToolIcon(icon: Icons.interests_outlined, label: 'Shape',
                  onTap: _addShape),
              _BottomToolIcon(icon: Icons.qr_code_rounded, label: 'QR',
                  active: _qrToolOpen,
                  onTap: () => setState(() => _qrToolOpen = !_qrToolOpen)),
              _BottomToolIcon(icon: Icons.grid_view_rounded, label: 'Templates',
                  onTap: _openTemplates),
            ]),
          ),
        ),
      ],
    );
  }
}

// ─── Shape painter ────────────────────────────────────────────────────────────

class _ShapePainter extends CustomPainter {
  final ShapeKind kind;
  final Color fill, stroke;
  final double strokeWidth;
  _ShapePainter({required this.kind, required this.fill, required this.stroke, required this.strokeWidth});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = fill..style = PaintingStyle.fill;
    Path path;
    switch (kind) {
      case ShapeKind.rect:
        path = Path()..addRRect(RRect.fromRectAndRadius(
            Offset.zero & size, const Radius.circular(8)));
        break;
      case ShapeKind.circle:
        path = Path()..addOval(Offset.zero & size);
        break;
      case ShapeKind.triangle:
        path = Path()
          ..moveTo(size.width / 2, 0)
          ..lineTo(size.width, size.height)
          ..lineTo(0, size.height)
          ..close();
        break;
      case ShapeKind.star:
        path = _starPath(size, 5);
        break;
      case ShapeKind.heart:
        path = _heartPath(size);
        break;
      case ShapeKind.diamond:
        path = Path()
          ..moveTo(size.width / 2, 0)
          ..lineTo(size.width, size.height / 2)
          ..lineTo(size.width / 2, size.height)
          ..lineTo(0, size.height / 2)
          ..close();
        break;
      case ShapeKind.hexagon:
        path = _polygonPath(size, 6);
        break;
      case ShapeKind.custom:
        // Custom images are added as 'image' elements, never painted as shapes.
        path = Path()..addOval(Offset.zero & size);
        break;
    }
    canvas.drawPath(path, paint);
    if (strokeWidth > 0 && stroke.alpha > 0) {
      canvas.drawPath(path, Paint()
        ..color = stroke
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth);
    }
  }

  Path _starPath(Size size, int points) {
    final path = Path();
    final cx = size.width / 2, cy = size.height / 2;
    final rOuter = math.min(cx, cy);
    final rInner = rOuter * 0.45;
    double angle = -math.pi / 2;
    final step = math.pi / points;
    path.moveTo(cx + rOuter * math.cos(angle), cy + rOuter * math.sin(angle));
    for (var i = 1; i <= points * 2; i++) {
      angle += step;
      final r = i.isOdd ? rInner : rOuter;
      path.lineTo(cx + r * math.cos(angle), cy + r * math.sin(angle));
    }
    path.close();
    return path;
  }

  Path _heartPath(Size size) {
    final path = Path();
    final w = size.width, h = size.height;
    path.moveTo(w / 2, h * 0.85);
    path.cubicTo(-w * 0.1, h * 0.55, w * 0.1, h * 0.05, w / 2, h * 0.3);
    path.cubicTo(w * 0.9, h * 0.05, w * 1.1, h * 0.55, w / 2, h * 0.85);
    path.close();
    return path;
  }

  Path _polygonPath(Size size, int sides) {
    final path = Path();
    final cx = size.width / 2, cy = size.height / 2;
    final r = math.min(cx, cy);
    for (var i = 0; i < sides; i++) {
      final a = -math.pi / 2 + (i * 2 * math.pi / sides);
      final p = Offset(cx + r * math.cos(a), cy + r * math.sin(a));
      if (i == 0) path.moveTo(p.dx, p.dy); else path.lineTo(p.dx, p.dy);
    }
    path.close();
    return path;
  }

  @override
  bool shouldRepaint(_ShapePainter old) =>
      old.kind != kind || old.fill != fill ||
      old.stroke != stroke || old.strokeWidth != strokeWidth;
}

// ─── Toolbar helper widgets ───────────────────────────────────────────────────

class _TopIcon extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final bool enabled, active;
  final VoidCallback onTap;
  const _TopIcon({
    required this.icon, required this.tooltip, required this.enabled,
    this.active = false, required this.onTap,
  });
  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: GestureDetector(
        onTap: enabled ? onTap : null,
        child: Container(
          width: 36, height: 36, margin: const EdgeInsets.symmetric(horizontal: 2),
          decoration: BoxDecoration(
            color: active ? GColors.brand.withValues(alpha: 0.12)
                : enabled ? GColors.bg2 : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: active ? GColors.brand
                  : enabled ? GColors.border : GColors.border.withValues(alpha: 0.4),
            ),
          ),
          child: Icon(icon, size: 18,
              color: active ? GColors.brand
                  : enabled ? GColors.text0 : GColors.text2),
        ),
      ),
    );
  }
}

class _BottomToolIcon extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color? color;
  final bool active;
  final VoidCallback onTap;
  const _BottomToolIcon({
    required this.icon, required this.label, this.color,
    this.active = false, required this.onTap,
  });
  @override
  Widget build(BuildContext context) {
    final c = active ? GColors.brand : (color ?? GColors.text0);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: active ? GColors.brand.withValues(alpha: 0.12) : GColors.bg2,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: active ? GColors.brand.withValues(alpha: 0.5) : GColors.border),
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 18, color: c),
          const Gap(2),
          Text(label, style: GoogleFonts.inter(
            fontSize: 10, fontWeight: FontWeight.w700, color: c)),
        ]),
      ),
    );
  }
}

/// Phase B: compact floating button for the mini selection toolbar.
class _FloatingBtn extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final Color? color;
  final VoidCallback onTap;
  const _FloatingBtn({required this.icon, required this.tooltip, this.color, required this.onTap});
  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 36, height: 36,
          alignment: Alignment.center,
          child: Icon(icon, size: 16, color: color ?? Colors.white.withValues(alpha: 0.8)),
        ),
      ),
    );
  }
}

class _ChipAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color? color;
  final VoidCallback onTap;
  const _ChipAction({required this.icon, required this.label, this.color, required this.onTap});
  @override
  Widget build(BuildContext context) {
    final c = color ?? GColors.text0;
    return GestureDetector(
      onTap: () { HapticFeedback.selectionClick(); onTap(); },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 14, color: c),
          const Gap(4),
          Text(label, style: GoogleFonts.inter(
            fontSize: 11, fontWeight: FontWeight.w700, color: c)),
        ]),
      ),
    );
  }
}

// ─── Templates sheet ──────────────────────────────────────────────────────────

final _templatesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  try {
    final dio = ref.watch(dioProvider);
    final res = await dio.get('/customizer/templates');
    final data = res.data;
    if (data is List) return List<Map<String, dynamic>>.from(data);
    if (data is Map) {
      return List<Map<String, dynamic>>.from(
          data['items'] ?? data['templates'] ?? []);
    }
  } catch (_) {}
  return [];
});

class _TemplatesSheet extends ConsumerWidget {
  const _TemplatesSheet({required this.bottomInset});
  final double bottomInset;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_templatesProvider);

    // Only show admin templates — no hardcoded fallbacks.
    final templates = async.maybeWhen(
      data: (list) => list,
      orElse: () => <Map<String, dynamic>>[],
    );
    final isLoading = async is AsyncLoading;

    return Container(
      constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.7),
      padding: EdgeInsets.fromLTRB(20, 12, 20, bottomInset + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(child: Container(
            width: 42, height: 4,
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: GColors.border,
              borderRadius: BorderRadius.circular(2),
            ),
          )),
          Row(children: [
            Text('Choose a template', style: GoogleFonts.inter(
              fontSize: 18, fontWeight: FontWeight.w800, color: GColors.text0)),
            const Spacer(),
            GestureDetector(
              onTap: () => Navigator.pop(context),
              child: const Icon(Icons.close_rounded,
                  size: 22, color: GColors.text2),
            ),
          ]),
          const Gap(4),
          Text('Start with a preset design — you can edit anything after.',
            style: GoogleFonts.inter(fontSize: 12, color: GColors.text2)),
          const Gap(14),
          if (isLoading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (templates.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 40),
              child: Center(child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.grid_view_rounded,
                      size: 48, color: GColors.text2),
                  const Gap(12),
                  Text('No templates yet',
                    style: GoogleFonts.inter(
                      fontSize: 15, fontWeight: FontWeight.w700,
                      color: GColors.text1)),
                  const Gap(4),
                  Text('Templates added by your admin will appear here.',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.inter(fontSize: 12, color: GColors.text2)),
                ],
              )),
            )
          else
            Flexible(
              child: GridView.builder(
                shrinkWrap: true,
                itemCount: templates.length,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: 10,
                  mainAxisSpacing: 10,
                  childAspectRatio: 1.0,
                ),
                itemBuilder: (_, i) {
                  final t = templates[i];
                  final name  = t['name']  as String? ?? 'Template';
                  final emoji = t['emoji'] as String? ?? '🎨';
                  final image = t['image'] as String?;
                  final objects = t['objects'] as List?;
                  return GestureDetector(
                    onTap: () {
                      if (objects == null || objects.isEmpty) return;
                      final objs = objects
                          .map((o) => Map<String, dynamic>.from(o as Map))
                          .toList();
                      Navigator.pop(context, objs);
                    },
                    child: Container(
                      decoration: BoxDecoration(
                        color: GColors.bg2,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: GColors.border),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: Column(children: [
                        Expanded(
                          child: Container(
                            color: GColors.bg1,
                            width: double.infinity,
                            child: image != null && image.isNotEmpty
                                ? Image.network(image, fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => Center(
                                      child: Text(emoji,
                                        style: const TextStyle(fontSize: 60))))
                                : Center(child: Text(emoji,
                                    style: const TextStyle(fontSize: 60))),
                          ),
                        ),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 8),
                          child: Text(name, style: GoogleFonts.inter(
                            fontSize: 12, fontWeight: FontWeight.w700,
                            color: GColors.text0)),
                        ),
                      ]),
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
