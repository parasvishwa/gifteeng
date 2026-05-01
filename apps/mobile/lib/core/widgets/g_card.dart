import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Gifteeng premium card — dark bg with a subtle glowing border gradient.
/// Use [gradient] to override the border with a colour gradient (like gold/pink).
class GCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final BorderRadius? borderRadius;
  final Gradient? borderGradient;
  final Color? background;
  final VoidCallback? onTap;

  const GCard({
    super.key,
    required this.child,
    this.padding,
    this.borderRadius,
    this.borderGradient,
    this.background,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final radius = borderRadius ?? BorderRadius.circular(16);

    Widget card = Container(
      decoration: BoxDecoration(
        color: background ?? GColors.bg1,
        borderRadius: radius,
      ),
      padding: padding ?? const EdgeInsets.all(16),
      child: child,
    );

    // Wrap with gradient border when provided.
    if (borderGradient != null) {
      card = Container(
        decoration: BoxDecoration(
          gradient: borderGradient,
          borderRadius: radius,
        ),
        padding: const EdgeInsets.all(1.5),
        child: Container(
          decoration: BoxDecoration(
            color: background ?? GColors.bg1,
            borderRadius: BorderRadius.circular(radius.topLeft.x - 1.5),
          ),
          padding: padding ?? const EdgeInsets.all(16),
          child: child,
        ),
      );
    }

    if (onTap != null) {
      return GestureDetector(
        onTap: onTap,
        child: card,
      );
    }
    return card;
  }
}
