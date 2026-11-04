/// A price is treated as a possible typo when it at least doubles or halves
/// versus the previous period (2x or 1/2). Non-blocking surety check only.
const double kPriceTypoMultiple = 2.0;

/// True when [current] looks like a data-entry typo against [previous].
///
/// Returns false when either value is missing or non-positive (cannot judge).
bool isPriceLikelyTypo(double? current, double? previous) {
  if (current == null || current <= 0) return false;
  if (previous == null || previous <= 0) return false;
  final ratio = current / previous;
  return ratio >= kPriceTypoMultiple || ratio <= 1 / kPriceTypoMultiple;
}
