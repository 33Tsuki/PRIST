import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:surveyor_app/models/models.dart';
import 'package:surveyor_app/utils/date_formatter.dart';
import 'package:surveyor_app/widgets/market_card.dart';
import 'package:surveyor_app/widgets/market_progress_ring.dart';

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();

  group('DateFormatter.timeAgo', () {
    final now = DateTime(2026, 8, 6, 15, 20);

    test('collapses anything under a minute to "just now"', () {
      expect(
        DateFormatter.timeAgo(now.subtract(const Duration(seconds: 41)),
            now: now),
        'just now',
      );
    });

    test('reports minutes, then hours, then days', () {
      String ago(Duration d) =>
          DateFormatter.timeAgo(now.subtract(d), now: now);

      expect(ago(const Duration(minutes: 1)), '1 min ago');
      expect(ago(const Duration(minutes: 42)), '42 min ago');
      expect(ago(const Duration(minutes: 59)), '59 min ago');
      expect(ago(const Duration(hours: 1)), '1 hour ago');
      expect(ago(const Duration(hours: 5)), '5 hours ago');
      expect(ago(const Duration(hours: 25)), 'yesterday');
      expect(ago(const Duration(days: 4)), '4 days ago');
    });

    test('falls back to an absolute date beyond a week', () {
      final old = DateTime(2026, 7, 20, 9, 5);
      expect(DateFormatter.timeAgo(old, now: now), '20 Jul 2026, 9:05 AM');
    });

    test('does not render a negative delta when the clock is skewed', () {
      expect(
        DateFormatter.timeAgo(now.add(const Duration(minutes: 10)), now: now),
        'just now',
      );
    });
  });

  group('MarketCard', () {
    /// Tall surface so every shop row is hit-testable without scrolling.
    Future<void> pump(WidgetTester tester, MarketCard card) async {
      await binding.setSurfaceSize(const Size(420, 1600));
      addTearDown(() => binding.setSurfaceSize(null));
      await tester.pumpWidget(_wrap(card));
      await tester.pumpAndSettle();
    }

    testWidgets('shows the progress ring percentage and the shop tag line',
        (tester) async {
      await pump(
          tester,
          _card(
            shopStatuses: _statuses(done: 3, partial: 1, pending: 4),
            collectedShops: 3,
            totalShops: 8,
          ));

      expect(find.byType(MarketProgressRing), findsOneWidget);
      expect(find.text('38%'), findsOneWidget);
      expect(find.text('3 of 8 shops collected'), findsOneWidget);
    });

    testWidgets('says "Ready to submit" at full collection', (tester) async {
      await pump(
          tester,
          _card(
            shopStatuses: _statuses(done: 4),
            collectedShops: 4,
            totalShops: 4,
            readyToSubmit: true,
          ));

      expect(find.text('100%'), findsOneWidget);
      expect(find.text('Ready to submit'), findsOneWidget);
    });

    testWidgets('truncates a long shop list until "Show N more" is tapped',
        (tester) async {
      await pump(
          tester,
          _card(
            shopStatuses: _statuses(pending: 8),
            collectedShops: 0,
            totalShops: 8,
            expanded: true,
          ));

      expect(find.text('Shop 1'), findsOneWidget);
      expect(find.text('Shop 5'), findsOneWidget);
      expect(find.text('Shop 6'), findsNothing);
      expect(find.text('Show 3 more'), findsOneWidget);

      await tester.tap(find.text('Show 3 more'));
      await tester.pumpAndSettle();

      expect(find.text('Shop 8'), findsOneWidget);
      expect(find.text('Show 3 more'), findsNothing);
    });

    testWidgets('filter pills narrow the list and re-collapse it',
        (tester) async {
      await pump(
          tester,
          _card(
            // Shops 1-2 done, 3 partial, 4-10 pending.
            shopStatuses: _statuses(done: 2, partial: 1, pending: 7),
            collectedShops: 2,
            totalShops: 10,
            expanded: true,
          ));

      expect(find.text('All 10'), findsOneWidget);
      expect(find.text('Pending 7'), findsOneWidget);
      expect(find.text('Partial 1'), findsOneWidget);
      expect(find.text('Done 2'), findsOneWidget);

      await tester.tap(find.text('Done 2'));
      await tester.pumpAndSettle();

      expect(find.text('Shop 1'), findsOneWidget);
      expect(find.text('Shop 2'), findsOneWidget);
      expect(find.text('Shop 3'), findsNothing);
      expect(find.textContaining('Show '), findsNothing);

      // Switching back must not carry over the previous "show all" state.
      await tester.tap(find.text('All 10'));
      await tester.pumpAndSettle();
      expect(find.text('Show 5 more'), findsOneWidget);
    });

    testWidgets('renders a placeholder when a filter matches nothing',
        (tester) async {
      await pump(
          tester,
          _card(
            shopStatuses: _statuses(done: 3),
            collectedShops: 3,
            totalShops: 3,
            readyToSubmit: true,
            expanded: true,
          ));

      await tester.tap(find.text('Pending 0'));
      await tester.pumpAndSettle();

      expect(find.text('No shops in this filter'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}

Widget _wrap(Widget child) => MaterialApp(
      home: Scaffold(
        body: ListView(children: [child]),
      ),
    );

List<CollectionStatus> _statuses({
  int done = 0,
  int partial = 0,
  int pending = 0,
}) =>
    [
      ...List.filled(done, CollectionStatus.completed),
      ...List.filled(partial, CollectionStatus.partial),
      ...List.filled(pending, CollectionStatus.notStarted),
    ];

MarketCard _card({
  required List<CollectionStatus> shopStatuses,
  required int collectedShops,
  required int totalShops,
  bool readyToSubmit = false,
  bool expanded = false,
}) {
  return MarketCard(
    marketName: 'Jirania (UO0109)',
    description: 'Bankimnagar, West Tripura',
    initiallyExpanded: expanded,
    collectedShops: collectedShops,
    totalShops: totalShops,
    readyToSubmit: readyToSubmit,
    shops: List.generate(
      shopStatuses.length,
      (i) => MarketCardShop(name: 'Shop ${i + 1}', status: shopStatuses[i]),
    ),
  );
}
