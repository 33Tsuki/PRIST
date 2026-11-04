class DateFormatter {
  static const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  static const _months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  static int _hour12(int hour) =>
      hour == 0 ? 12 : (hour > 12 ? hour - 12 : hour);

  /// "Mon, 2 Apr 2026 · 3:05 PM"
  static String formatDateTime(DateTime dt) {
    final h = _hour12(dt.hour);
    final m = dt.minute.toString().padLeft(2, '0');
    final amPm = dt.hour >= 12 ? 'PM' : 'AM';
    return '${_weekdays[dt.weekday - 1]}, ${dt.day} ${_months[dt.month - 1]} ${dt.year} · $h:$m $amPm';
  }

  /// "Mon, 2 Apr 2026"
  static String formatDate(DateTime dt) {
    return '${_weekdays[dt.weekday - 1]}, ${dt.day} ${_months[dt.month - 1]} ${dt.year}';
  }

  /// "2 Apr 2026, 3:05 PM"
  static String formatSubmittedAt(DateTime dt) {
    final h = _hour12(dt.hour);
    final m = dt.minute.toString().padLeft(2, '0');
    final amPm = dt.hour >= 12 ? 'PM' : 'AM';
    return '${dt.day} ${_months[dt.month - 1]} ${dt.year}, $h:$m $amPm';
  }

  /// Coarse relative time — "just now", "12 min ago", "3 hours ago".
  /// Falls back to an absolute date once it stops being useful as a delta.
  /// [now] is injectable so this can be tested without a clock.
  static String timeAgo(DateTime dt, {DateTime? now}) {
    final diff = (now ?? DateTime.now()).difference(dt);

    // Clock skew or a timestamp from the future — don't say "-3 min ago".
    if (diff.isNegative || diff.inSeconds < 60) return 'just now';

    final minutes = diff.inMinutes;
    if (minutes < 60) return '$minutes min ago';

    final hours = diff.inHours;
    if (hours < 24) return hours == 1 ? '1 hour ago' : '$hours hours ago';

    final days = diff.inDays;
    if (days == 1) return 'yesterday';
    if (days < 7) return '$days days ago';

    return formatSubmittedAt(dt);
  }
}
