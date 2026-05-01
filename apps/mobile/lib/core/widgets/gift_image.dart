import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:shimmer/shimmer.dart';
import '../theme/app_theme.dart';

/// Host portion of API base URL (for resolving relative /api/files/... paths).
const _kApiHost = 'https://new-api.gifteeng.com';

/// Resolves a product image from either:
///   • A Map  { "url": "data:image/png;base64,...", "alt": "" }
///   • A Map  { "url": "https://...", "alt": "" }
///   • A bare String URL
///   • A relative path starting with /api/files/... (prepended with host)
String? resolveImageUrl(dynamic raw) {
  if (raw == null) return null;
  String? url;
  if (raw is String) {
    url = raw;
  } else if (raw is Map) {
    url = raw['url'] as String? ?? raw['src'] as String?;
  }
  if (url == null || url.isEmpty) return null;
  // Relative path → prefix with host
  if (url.startsWith('/')) return '$_kApiHost$url';
  return url;
}

/// Decodes a base64 data-URL to bytes in an isolate.
Uint8List? _decodeDataUrl(String dataUrl) {
  try {
    final comma = dataUrl.indexOf(',');
    if (comma < 0) return null;
    return base64Decode(dataUrl.substring(comma + 1));
  } catch (_) {
    return null;
  }
}

/// Renders a product image regardless of whether it's a network URL
/// or a base64 data-URI (the Gifteeng API stores images as base64).
class GiftImage extends StatefulWidget {
  /// Raw image entry — either a Map {url, alt} or a String URL.
  final dynamic src;
  final BoxFit fit;
  final double? width;
  final double? height;

  const GiftImage({
    super.key,
    required this.src,
    this.fit = BoxFit.cover,
    this.width,
    this.height,
  });

  @override
  State<GiftImage> createState() => _GiftImageState();
}

class _GiftImageState extends State<GiftImage> {
  Future<Uint8List?>? _decodeFuture;
  String? _url;

  @override
  void initState() {
    super.initState();
    _resolve(widget.src);
  }

  @override
  void didUpdateWidget(GiftImage old) {
    super.didUpdateWidget(old);
    // If parent passed a different image, re-resolve (fixes variant swap etc.)
    final newUrl = resolveImageUrl(widget.src);
    if (newUrl != _url) {
      setState(() => _resolve(widget.src));
    }
  }

  void _resolve(dynamic src) {
    _url = resolveImageUrl(src);
    _decodeFuture = null;
    if (_url != null && _url!.startsWith('data:')) {
      // Decode base64 off the main thread.
      _decodeFuture = compute(_decodeDataUrl, _url!);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_url == null) return _placeholder();

    // ── base64 data URL ──────────────────────────────────────────────────────
    if (_url!.startsWith('data:')) {
      return FutureBuilder<Uint8List?>(
        future: _decodeFuture,
        builder: (ctx, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return _shimmer();
          }
          final bytes = snap.data;
          if (bytes == null) return _placeholder();
          return Image.memory(
            bytes,
            fit: widget.fit,
            width:  widget.width  ?? double.infinity,
            height: widget.height,
            gaplessPlayback: true,
          );
        },
      );
    }

    // ── Regular http/https URL ───────────────────────────────────────────────
    return CachedNetworkImage(
      imageUrl:    _url!,
      fit:         widget.fit,
      width:       widget.width  ?? double.infinity,
      height:      widget.height,
      placeholder: (_, __) => _shimmer(),
      errorWidget: (_, __, ___) => _placeholder(),
    );
  }

  Widget _shimmer() => Shimmer.fromColors(
    baseColor:      GColors.bg2,
    highlightColor: GColors.border,
    child: Container(
      width:  widget.width  ?? double.infinity,
      height: widget.height,
      color:  GColors.bg2,
    ),
  );

  Widget _placeholder() => Container(
    width:  widget.width  ?? double.infinity,
    height: widget.height,
    color:  GColors.bg2,
    child:  const Center(child: Text('🎁', style: TextStyle(fontSize: 32))),
  );
}
