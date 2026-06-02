import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lottie/lottie.dart';
import 'package:shimmer/shimmer.dart';

import '../../../../core/theme/app_theme.dart';

// ─────────────────────────────────────────────────────────────────────────────
// AI image generation — multi-provider with graceful fallback
//
// Order of preference:
//   1. Gifteeng backend at /customizer/ai       (when it ships)
//   2. Pollinations.ai public endpoint          (free, no key, production-ready)
//
// Pollinations returns a direct PNG from a simple GET request — no auth,
// no quota limits. Perfect for a "try it now" experience while the backend
// endpoint is being built. When the backend lands, uncomment the branch
// at the top of `_generate()`.
// ─────────────────────────────────────────────────────────────────────────────

const _kGifteengBackend = 'https://www.gifteeng.com/api/customizer/ai';
const _kPollinationsBase = 'https://image.pollinations.ai/prompt/';

/// Style preset — name + descriptive suffix appended to the prompt.
class _AiStyle {
  final String label;
  final String emoji;
  final String suffix;
  const _AiStyle(this.label, this.emoji, this.suffix);
}

const _kStyles = [
  _AiStyle('Sticker',       '🎨', 'sticker style, bold outline, vibrant colors, white background'),
  _AiStyle('Photo',         '📷', 'photorealistic, high detail, soft lighting'),
  _AiStyle('Cartoon',       '🖌️', 'cartoon style, cute, rounded shapes, pastel colors'),
  _AiStyle('Watercolor',    '🎭', 'watercolor painting, soft brush strokes, pastel'),
  _AiStyle('3D',            '🧸', '3d render, soft lighting, clay material, cute'),
  _AiStyle('Anime',         '🌸', 'anime style, cel shading, vibrant'),
  _AiStyle('Minimalist',    '⚪', 'minimalist, flat design, limited palette, clean'),
  _AiStyle('Oil Painting',  '🖼️', 'oil painting, textured brush strokes, classical'),
];

/// Canvas size preset.
class _AiSize {
  final String label;
  final int width;
  final int height;
  const _AiSize(this.label, this.width, this.height);
}

const _kSizes = [
  _AiSize('Square',    768, 768),
  _AiSize('Portrait',  576, 768),
  _AiSize('Landscape', 768, 576),
];

/// Starter prompts — tap to auto-fill + boost discovery.
const _kStarters = [
  ('🎂', 'Birthday cake with sparkles'),
  ('💐', 'Roses bouquet anniversary'),
  ('🪔', 'Diwali diya golden glow'),
  ('🐘', 'Cute baby elephant'),
  ('🎄', 'Christmas tree ornaments'),
  ('❤️', 'Heart with wings'),
  ('🌸', 'Cherry blossom branch'),
  ('🐾', 'Cute puppy sticker'),
  ('🚀', 'Rocket ship with stars'),
  ('🌈', 'Rainbow with clouds'),
  ('🦄', 'Magical unicorn'),
  ('☕', 'Steaming coffee cup'),
];

// ─────────────────────────────────────────────────────────────────────────────
// Public entry: opens the sheet and returns generated image bytes (or null
// if user cancelled).
// ─────────────────────────────────────────────────────────────────────────────

Future<Uint8List?> showAiGenerateSheet(BuildContext context) {
  return showModalBottomSheet<Uint8List?>(
    context: context,
    isScrollControlled: true,
    backgroundColor: GColors.bg1,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => const AiGenerateSheet(),
  );
}

// ─────────────────────────────────────────────────────────────────────────────

class AiGenerateSheet extends StatefulWidget {
  const AiGenerateSheet({super.key});
  @override
  State<AiGenerateSheet> createState() => _AiGenerateSheetState();
}

class _AiGenerateSheetState extends State<AiGenerateSheet> {
  final _promptCtrl = TextEditingController();
  int _styleIdx = 0;
  int _sizeIdx  = 0;
  int _seed     = 0; // drives regenerate

  bool _generating = false;
  Uint8List? _result;
  String? _error;

  // Loading copy rotates every 1.5s for vibes
  final _loadingLines = const [
    'Summoning pixels ✨',
    'Mixing colours 🎨',
    'Rendering magic 🪄',
    'Polishing the design 💎',
    'Almost there 🚀',
  ];
  int _loadingIdx = 0;
  Timer? _loadingTimer;

  @override
  void initState() {
    super.initState();
    _promptCtrl.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _promptCtrl.dispose();
    _loadingTimer?.cancel();
    super.dispose();
  }

  Future<void> _generate() async {
    final prompt = _promptCtrl.text.trim();
    if (prompt.length < 3) {
      setState(() => _error = 'Write at least 3 characters');
      return;
    }
    setState(() {
      _generating = true;
      _error = null;
      _result = null;
      _loadingIdx = 0;
    });
    HapticFeedback.mediumImpact();

    // Rotate loading messages while we wait
    _loadingTimer?.cancel();
    _loadingTimer = Timer.periodic(const Duration(milliseconds: 1500), (_) {
      if (!mounted) return;
      setState(() => _loadingIdx = (_loadingIdx + 1) % _loadingLines.length);
    });

    try {
      final style = _kStyles[_styleIdx];
      final size  = _kSizes[_sizeIdx];
      final fullPrompt = '$prompt, ${style.suffix}';

      // TODO — when Gifteeng backend ships /customizer/ai, swap to this:
      // final res = await Dio().post(_kGifteengBackend, data: {
      //   'prompt': fullPrompt, 'width': size.width, 'height': size.height,
      //   'seed': _seed,
      // });
      // final url = res.data['imageUrl'] as String;
      // final img = await Dio().get<List<int>>(url,
      //     options: Options(responseType: ResponseType.bytes));
      // setState(() => _result = Uint8List.fromList(img.data!));

      // For now: Pollinations public endpoint — free, no key, returns PNG.
      final encoded = Uri.encodeComponent(fullPrompt);
      final url = '$_kPollinationsBase$encoded'
          '?width=${size.width}&height=${size.height}'
          '&nologo=true&seed=$_seed';
      final res = await Dio().get<List<int>>(
        url,
        options: Options(
          responseType: ResponseType.bytes,
          receiveTimeout: const Duration(seconds: 60),
        ),
      );
      if (!mounted) return;
      final bytes = Uint8List.fromList(res.data!);
      setState(() {
        _result = bytes;
        _generating = false;
      });
      HapticFeedback.heavyImpact();
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _generating = false;
        _error = e.type == DioExceptionType.receiveTimeout
            ? 'Generation took too long — try a simpler prompt'
            : 'Generation failed — try again';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _generating = false;
        _error = 'Something went wrong: $e';
      });
    } finally {
      _loadingTimer?.cancel();
    }
  }

  void _reroll() {
    _seed = DateTime.now().millisecondsSinceEpoch;
    _generate();
  }

  void _addToDesign() {
    if (_result == null) return;
    HapticFeedback.selectionClick();
    Navigator.pop(context, _result);
  }

  @override
  Widget build(BuildContext context) {
    final canGenerate = _promptCtrl.text.trim().length >= 3 && !_generating;
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85),
      padding: EdgeInsets.only(
        left: 20, right: 20, top: 12,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle
          Center(child: Container(
            width: 42, height: 4,
            margin: const EdgeInsets.only(bottom: 10),
            decoration: BoxDecoration(
              color: GColors.border,
              borderRadius: BorderRadius.circular(2),
            ),
          )),

          // Header
          Row(children: [
            Container(
              width: 34, height: 34,
              decoration: BoxDecoration(
                color: GColors.brand,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Center(
                child: Text('✨', style: TextStyle(fontSize: 18))),
            ),
            const Gap(12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('AI Generate', style: GoogleFonts.inter(
                  fontSize: 18, fontWeight: FontWeight.w800,
                  color: GColors.text0)),
                Text('Describe it, we\'ll draw it', style: GoogleFonts.inter(
                  fontSize: 11, color: GColors.text2)),
              ],
            ),
            const Spacer(),
            GestureDetector(
              onTap: () => Navigator.pop(context),
              child: Container(
                width: 30, height: 30,
                decoration: BoxDecoration(
                  color: GColors.bg2, shape: BoxShape.circle),
                child: const Icon(Icons.close_rounded,
                    size: 16, color: GColors.text1),
              ),
            ),
          ]),
          const Gap(16),

          Flexible(
            child: SingleChildScrollView(
              child: Column(children: [
                // Prompt input
                Container(
                  decoration: BoxDecoration(
                    color: GColors.bg2,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: _promptCtrl.text.isEmpty
                          ? GColors.border
                          : GColors.brand.withValues(alpha: 0.5),
                    ),
                  ),
                  padding: const EdgeInsets.all(12),
                  child: TextField(
                    controller: _promptCtrl,
                    maxLines: 3, minLines: 2, maxLength: 200,
                    style: GoogleFonts.inter(
                      fontSize: 14, color: GColors.text0),
                    decoration: InputDecoration(
                      hintText: 'A cute elephant wearing a birthday hat with balloons...',
                      hintStyle: GoogleFonts.inter(
                        fontSize: 13, color: GColors.text2),
                      border: InputBorder.none,
                      counterStyle: GoogleFonts.inter(
                        fontSize: 10, color: GColors.text2),
                    ),
                  ),
                ),
                const Gap(14),

                // Starter chips
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text('Try one', style: GoogleFonts.inter(
                    fontSize: 11, fontWeight: FontWeight.w800,
                    color: GColors.text2, letterSpacing: 0.5)),
                ),
                const Gap(8),
                SizedBox(
                  height: 76,
                  child: GridView.builder(
                    scrollDirection: Axis.horizontal,
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      crossAxisSpacing: 6,
                      mainAxisSpacing: 6,
                      childAspectRatio: 0.3,
                    ),
                    itemCount: _kStarters.length,
                    itemBuilder: (_, i) {
                      final s = _kStarters[i];
                      return GestureDetector(
                        onTap: () {
                          HapticFeedback.selectionClick();
                          _promptCtrl.text = s.$2;
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: GColors.bg2,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: GColors.border),
                          ),
                          child: Row(children: [
                            Text(s.$1, style: const TextStyle(fontSize: 14)),
                            const Gap(6),
                            Flexible(
                              child: Text(s.$2,
                                maxLines: 1, overflow: TextOverflow.ellipsis,
                                style: GoogleFonts.inter(
                                  fontSize: 11, fontWeight: FontWeight.w600,
                                  color: GColors.text1)),
                            ),
                          ]),
                        ),
                      );
                    },
                  ),
                ),
                const Gap(14),

                // Style presets
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text('Style', style: GoogleFonts.inter(
                    fontSize: 11, fontWeight: FontWeight.w800,
                    color: GColors.text2, letterSpacing: 0.5)),
                ),
                const Gap(8),
                SizedBox(
                  height: 40,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _kStyles.length,
                    separatorBuilder: (_, __) => const Gap(6),
                    itemBuilder: (_, i) {
                      final s = _kStyles[i];
                      final sel = _styleIdx == i;
                      return GestureDetector(
                        onTap: () {
                          HapticFeedback.selectionClick();
                          setState(() => _styleIdx = i);
                        },
                        child: AnimatedContainer(
                          duration: 180.ms,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: sel ? GColors.brand : GColors.bg2,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: sel ? GColors.brand : GColors.border,
                              width: sel ? 1.5 : 1,
                            ),
                          ),
                          child: Row(children: [
                            Text(s.emoji, style: const TextStyle(fontSize: 13)),
                            const Gap(5),
                            Text(s.label, style: GoogleFonts.inter(
                              fontSize: 12, fontWeight: FontWeight.w700,
                              color: sel ? Colors.white : GColors.text1)),
                          ]),
                        ),
                      );
                    },
                  ),
                ),
                const Gap(14),

                // Size presets
                Row(children: [
                  Text('Size', style: GoogleFonts.inter(
                    fontSize: 11, fontWeight: FontWeight.w800,
                    color: GColors.text2, letterSpacing: 0.5)),
                  const Gap(12),
                  for (var i = 0; i < _kSizes.length; i++) ...[
                    GestureDetector(
                      onTap: () {
                        HapticFeedback.selectionClick();
                        setState(() => _sizeIdx = i);
                      },
                      child: AnimatedContainer(
                        duration: 180.ms,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: _sizeIdx == i
                              ? GColors.brand.withValues(alpha: 0.12)
                              : GColors.bg2,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: _sizeIdx == i ? GColors.brand : GColors.border,
                            width: _sizeIdx == i ? 1.5 : 1,
                          ),
                        ),
                        child: Text(_kSizes[i].label,
                          style: GoogleFonts.inter(
                            fontSize: 11, fontWeight: FontWeight.w700,
                            color: _sizeIdx == i
                                ? GColors.brand : GColors.text1)),
                      ),
                    ),
                    if (i < _kSizes.length - 1) const Gap(6),
                  ],
                ]),
                const Gap(18),

                // Preview area
                _PreviewArea(
                  generating: _generating,
                  result: _result,
                  error: _error,
                  loadingLine: _loadingLines[_loadingIdx],
                  aspectRatio: _kSizes[_sizeIdx].width / _kSizes[_sizeIdx].height,
                ),
              ]),
            ),
          ),

          const Gap(14),
          // Action row
          if (_result != null && !_generating)
            Row(children: [
              Expanded(child: GestureDetector(
                onTap: _reroll,
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: GColors.bg2,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: GColors.border),
                  ),
                  child: Row(mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.refresh_rounded,
                          size: 16, color: GColors.text0),
                      const Gap(6),
                      Text('Re-roll', style: GoogleFonts.inter(
                        fontSize: 13, fontWeight: FontWeight.w700,
                        color: GColors.text0)),
                    ]),
                ),
              )),
              const Gap(10),
              Expanded(flex: 2, child: GestureDetector(
                onTap: _addToDesign,
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: GColors.brand,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.check_rounded,
                          size: 18, color: Colors.white),
                      const Gap(6),
                      Text('Add to design', style: GoogleFonts.inter(
                        fontSize: 14, fontWeight: FontWeight.w800,
                        color: Colors.white)),
                    ]),
                ),
              )),
            ])
          else
            GestureDetector(
              onTap: canGenerate ? _generate : null,
              child: AnimatedContainer(
                duration: 220.ms,
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: canGenerate ? GColors.brand : GColors.bg2,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (_generating)
                      const SizedBox(width: 16, height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                    else
                      Text('✨', style: TextStyle(
                          fontSize: 16,
                          color: canGenerate ? Colors.white : GColors.text2)),
                    const Gap(8),
                    Text(_generating ? 'Generating…' : 'Generate',
                      style: GoogleFonts.inter(
                        fontSize: 14, fontWeight: FontWeight.w800,
                        color: canGenerate ? Colors.white : GColors.text2)),
                  ]),
              ),
            ),
          const Gap(8),
          // Footer credit
          Center(child: Text('Powered by AI · usually takes 10–30s',
            style: GoogleFonts.inter(
              fontSize: 10, color: GColors.text2))),
        ],
      ),
    );
  }
}

// ─── Preview area ─────────────────────────────────────────────────────────────

class _PreviewArea extends StatelessWidget {
  final bool generating;
  final Uint8List? result;
  final String? error;
  final String loadingLine;
  final double aspectRatio;

  const _PreviewArea({
    required this.generating,
    required this.result,
    required this.error,
    required this.loadingLine,
    required this.aspectRatio,
  });

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: aspectRatio,
      child: Container(
        decoration: BoxDecoration(
          color: GColors.bg2,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: result != null
                ? GColors.brand.withValues(alpha: 0.5)
                : GColors.border,
            width: result != null ? 1.5 : 1,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (generating) _loadingState()
            else if (error != null) _errorState()
            else if (result != null) _resultState()
            else _idleState(),
          ],
        ),
      ),
    );
  }

  Widget _loadingState() => Stack(fit: StackFit.expand, children: [
    Shimmer.fromColors(
      baseColor: GColors.bg2, highlightColor: GColors.border,
      child: Container(color: GColors.bg2),
    ),
    Center(child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 72, height: 72,
          child: Lottie.asset('assets/animations/sparkle_burst.json',
              repeat: true, errorBuilder: (_, __, ___) =>
                const CircularProgressIndicator(
                  strokeWidth: 3, color: Color(0xFFA78BFA))),
        ),
        const Gap(12),
        AnimatedSwitcher(
          duration: 280.ms,
          child: Text(loadingLine,
            key: ValueKey(loadingLine),
            style: GoogleFonts.inter(
              fontSize: 13, fontWeight: FontWeight.w700,
              color: GColors.text0)),
        ),
      ],
    )),
  ]);

  Widget _errorState() => Center(child: Padding(
    padding: const EdgeInsets.all(24),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text('😵', style: TextStyle(fontSize: 40)),
        const Gap(10),
        Text(error!, textAlign: TextAlign.center,
          style: GoogleFonts.inter(
            fontSize: 12, color: GColors.text1, height: 1.5)),
      ],
    ),
  ));

  Widget _resultState() => Image.memory(
    result!,
    fit: BoxFit.contain,
    gaplessPlayback: true,
  ).animate().fadeIn(duration: 300.ms).scaleXY(
      begin: 0.95, end: 1.0, duration: 400.ms, curve: Curves.easeOutCubic);

  Widget _idleState() => Center(child: Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      const Text('✨', style: TextStyle(fontSize: 40)),
      const Gap(8),
      Text('Preview will appear here',
        style: GoogleFonts.inter(
          fontSize: 12, color: GColors.text2, fontWeight: FontWeight.w500)),
      const Gap(2),
      Text('Pick a style and tap Generate',
        style: GoogleFonts.inter(fontSize: 10, color: GColors.text2)),
    ],
  ));
}
