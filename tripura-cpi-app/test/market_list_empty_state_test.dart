import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:surveyor_app/data/app_data.dart';
import 'package:surveyor_app/models/models.dart';
import 'package:surveyor_app/screens/market_list_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late List<Market> originalMarkets;
  Surveyor? originalSurveyor;
  bool originalNoActiveRound = false;
  DateTime? originalLastSyncAt;

  setUp(() {
    originalMarkets = AppData.markets;
    originalSurveyor = AppData.surveyor;
    originalNoActiveRound = AppData.noActiveRound;
    originalLastSyncAt = AppData.lastSyncAt;

    AppData.surveyor = Surveyor(
      id: 'SRV-1',
      name: 'Ananya Dutta',
      designation: 'Field Surveyor',
      district: 'West Tripura',
      phone: '8000000000',
    );
    AppData.markets = [];
    AppData.noActiveRound = false;
  });

  tearDown(() {
    AppData.markets = originalMarkets;
    AppData.surveyor = originalSurveyor;
    AppData.noActiveRound = originalNoActiveRound;
    AppData.lastSyncAt = originalLastSyncAt;
  });

  /// The screen runs a Timer.periodic, so the widget has to be torn down
  /// inside the test or the framework fails it on a pending timer.
  Future<void> pumpScreen(WidgetTester tester) async {
    await tester.pumpWidget(const MaterialApp(home: MarketListScreen()));
    await tester.pump();
    addTearDown(() => tester.pumpWidget(const SizedBox()));
  }

  testWidgets('before the first sync it prompts to sync, and claims nothing',
      (tester) async {
    AppData.lastSyncAt = null;

    await pumpScreen(tester);

    expect(find.text('Sync to load your markets'), findsOneWidget);
    expect(
      find.text('Your assigned markets will appear here after you sync.'),
      findsOneWidget,
    );
    expect(find.text('Never synced'), findsOneWidget);

    // The old copy asserted submission had happened. It must not appear here.
    expect(find.text('No markets pending'), findsNothing);
    expect(find.textContaining('All markets submitted'), findsNothing);
  });

  testWidgets('after a sync returns nothing it stays neutral about the cause',
      (tester) async {
    AppData.lastSyncAt = DateTime.now();

    await pumpScreen(tester);

    expect(find.text('No markets pending'), findsOneWidget);
    expect(
      find.text(
        'Nothing left to collect right now. Sync to check for new assignments.',
      ),
      findsOneWidget,
    );
    expect(find.text('Synced just now'), findsOneWidget);

    expect(find.text('Sync to load your markets'), findsNothing);
    expect(find.textContaining('All markets submitted'), findsNothing);
  });
}
