import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:gap/gap.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:share_plus/share_plus.dart';

import '../../../../core/services/audio_service.dart';
import '../../../../core/theme/app_theme.dart';

/// Deep-link base for shared product URLs.
///
/// `gifteeng.com` (apex) currently fails the SSL handshake on shared
/// devices (`ERR_SSL_UNRECOGNIZED_NAME_ALERT`) because the cert is bound to
/// `new.gifteeng.com`. Sharing through the canonical subdomain keeps the
/// link openable for everyone who receives the message; it can be flipped
/// back to the apex once the apex cert is reissued.
///
/// Override at build time with:
///   flutter run --dart-define=SHARE_BASE_URL=https://www.gifteeng.com
const _kShareBaseUrl = String.fromEnvironment(
  'SHARE_BASE_URL',
  defaultValue: 'https://www.gifteeng.com',
);

/// Circular icon button that opens the native OS share sheet with a
/// product deep link + compelling message.
class ShareProductButton extends StatelessWidget {
  final String productSlug;
  final String productTitle;
  final double? productPrice;
  final String? productImage;
  final double size;
  final Color bg;
  final Color fg;
  final Color border;

  const ShareProductButton({
    super.key,
    required this.productSlug,
    required this.productTitle,
    this.productPrice,
    this.productImage,
    this.size = 42,
    this.bg = const Color(0xFF080A0E),
    this.fg = const Color(0xFFF0F0F5),
    this.border = const Color(0xFF1A1C26),
  });

  Future<void> _share(BuildContext context) async {
    HapticFeedback.selectionClick();
    AudioService.instance.tap();
    final url = '$_kShareBaseUrl/shop/$productSlug';
    final price = productPrice != null ? ' · ₹${productPrice!.toInt()}' : '';
    final message = 'Check out this gift on Gifteeng 🎁\n\n'
        '$productTitle$price\n'
        '$url\n\n'
        'Personalise it and get it delivered!';

    try {
      // Dart 3 API change — use SharePlus.instance.share(ShareParams(...))
      // share_plus ^10 also exposes the old top-level Share.share() as a
      // fallback that we prefer for broad compatibility.
      await Share.share(message, subject: productTitle);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Could not open share sheet', style: GoogleFonts.inter()),
          backgroundColor: GColors.rose,
          behavior: SnackBarBehavior.floating,
        ));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => _share(context),
      child: Container(
        width: size, height: size,
        decoration: BoxDecoration(
          color: bg.withValues(alpha: 0.9),
          shape: BoxShape.circle,
          border: Border.all(color: border),
          boxShadow: [BoxShadow(
            color: Colors.black.withValues(alpha: 0.4),
            blurRadius: 12,
          )],
        ),
        child: Icon(Icons.ios_share_rounded, size: size * 0.45, color: fg),
      ),
    );
  }
}

/// A filled pill-style share CTA (for anywhere that needs a labelled button
/// instead of the round icon).
class ShareProductPill extends StatelessWidget {
  final String productSlug;
  final String productTitle;
  final double? productPrice;
  final Color color;
  final Color? background;
  const ShareProductPill({
    super.key,
    required this.productSlug,
    required this.productTitle,
    this.productPrice,
    this.color = GColors.gold,
    this.background,
  });

  Future<void> _share() async {
    HapticFeedback.selectionClick();
    final url = '$_kShareBaseUrl/shop/$productSlug';
    final price = productPrice != null ? ' · ₹${productPrice!.toInt()}' : '';
    try {
      await Share.share(
        'Check out this gift on Gifteeng 🎁\n\n'
        '$productTitle$price\n'
        '$url\n\n'
        'Personalise it and get it delivered!',
        subject: productTitle,
      );
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _share,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: background ?? color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.ios_share_rounded, size: 14, color: color),
          const Gap(6),
          Text('Share', style: GoogleFonts.inter(
            fontSize: 12, fontWeight: FontWeight.w700, color: color)),
        ]),
      ),
    );
  }
}
