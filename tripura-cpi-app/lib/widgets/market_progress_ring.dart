import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../models/models.dart';
import '../theme/app_theme.dart';
import 'shop_row.dart' show CollectionStatusStyle;

/// Circular shop-collection progress for a market, with the percentage inside.
///
/// Counted in shops, not items — same basis as the card's footer note and
/// [Market.isReadyToSubmit], so the ring never disagrees with the text next to
/// it. (`Market.completionPercent` is item-based and would.)
class MarketProgressRing extends StatelessWidget {
  const MarketProgressRing({
    super.key,
    required this.collectedShops,
    required this.totalShops,
    required this.readyToSubmit,
    this.size = 44,
  });

  final int collectedShops;
  final int totalShops;
  final bool readyToSubmit;
  final double size;

  @override
  Widget build(BuildContext context) {
    final fraction =
        totalShops == 0 ? 0.0 : (collectedShops / totalShops).clamp(0.0, 1.0);

    final Color arcColor;
    if (readyToSubmit) {
      arcColor = CollectionStatus.completed.color;
    } else if (collectedShops == 0) {
      arcColor = const Color(0xFFDCDBD6);
    } else {
      arcColor = CollectionStatus.partial.color;
    }

    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _RingPainter(fraction: fraction, color: arcColor),
        child: Center(
          child: Text(
            '${(fraction * 100).round()}%',
            style: const TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w800,
              color: AppColors.textPrimary,
            ),
          ),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  const _RingPainter({required this.fraction, required this.color});

  final double fraction;
  final Color color;

  static const double _strokeWidth = 5;

  @override
  void paint(Canvas canvas, Size size) {
    final rect =
        Rect.fromLTWH(0, 0, size.width, size.height).deflate(_strokeWidth / 2);

    final track = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = _strokeWidth
      ..color = const Color(0xFFECEBE7);
    canvas.drawArc(rect, 0, 2 * math.pi, false, track);

    if (fraction <= 0) return;

    final progress = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = _strokeWidth
      ..strokeCap = StrokeCap.round
      ..color = color;
    canvas.drawArc(
      rect,
      -math.pi / 2,
      2 * math.pi * fraction,
      false,
      progress,
    );
  }

  @override
  bool shouldRepaint(_RingPainter oldDelegate) =>
      oldDelegate.fraction != fraction || oldDelegate.color != color;
}
