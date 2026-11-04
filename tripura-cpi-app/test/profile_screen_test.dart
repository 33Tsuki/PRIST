import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:surveyor_app/data/app_data.dart';
import 'package:surveyor_app/models/models.dart';
import 'package:surveyor_app/screens/profile_screen.dart';
import 'package:surveyor_app/utils/date_formatter.dart';

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();

  late List<Market> originalMarkets;
  Surveyor? originalSurveyor;

  setUp(() {
    originalMarkets = AppData.markets;
    originalSurveyor = AppData.surveyor;
  });

  tearDown(() async {
    AppData.markets = originalMarkets;
    AppData.surveyor = originalSurveyor;
  });

  testWidgets('profile shows surveyor details and collection stats',
      (WidgetTester tester) async {
    AppData.surveyor = Surveyor(
      id: 'SRV-88',
      name: 'Ananya Dutta',
      designation: 'Field Surveyor',
      district: 'West Tripura',
      phone: '8000000000',
    );
    AppData.markets = [
      _buildMarket(marketId: 1, collectedStates: [true, true, false, false]),
      _buildMarket(marketId: 2, collectedStates: [true, false, false, true]),
      _buildMarket(marketId: 3, collectedStates: [true, true, false, false]),
    ];

    final beforePump = DateTime.now();

    await tester.pumpWidget(
      const MaterialApp(
        home: ProfileScreen(),
      ),
    );
    await tester.pumpAndSettle();

    final afterPump = DateTime.now();
    final possibleTimestamps = {
      DateFormatter.formatSubmittedAt(beforePump),
      DateFormatter.formatSubmittedAt(afterPump),
    };

    expect(find.text('Profile'), findsOneWidget);
    expect(find.text('ID: SRV-88'), findsOneWidget);
    expect(find.text('Surveyor Name'), findsOneWidget);
    expect(find.text('Ananya Dutta'), findsOneWidget);
    expect(find.text('Phone Number'), findsOneWidget);
    expect(find.text('8000000000'), findsOneWidget);
    expect(
      possibleTimestamps.any((value) => find.text(value).evaluate().isNotEmpty),
      isTrue,
    );

    expect(find.text('This Month\'s Stats'), findsOneWidget);
    expect(find.text('Markets'), findsOneWidget);
    expect(find.text('Collected'), findsOneWidget);
    expect(find.text('Total Items'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    expect(find.text('6'), findsOneWidget);
    expect(find.text('12'), findsOneWidget);
  });

  testWidgets('profile avoids overflow on narrow layouts',
      (WidgetTester tester) async {
    const longName = 'A Very Long Surveyor Name That Needs Multiple Lines';
    const longPhone = '80000 11111 22222';

    await binding.setSurfaceSize(const Size(320, 800));
    addTearDown(() async {
      await binding.setSurfaceSize(null);
    });

    AppData.surveyor = Surveyor(
      id: 'SRV-99',
      name: longName,
      designation: 'Field Surveyor',
      district: 'West Tripura',
      phone: longPhone,
    );
    AppData.markets = [
      _buildMarket(marketId: 4, collectedStates: [true, false, true]),
    ];

    await tester.pumpWidget(
      const MaterialApp(
        home: ProfileScreen(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Profile'), findsOneWidget);
    expect(find.text(longName), findsOneWidget);
    expect(find.text(longPhone), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

Market _buildMarket({
  required int marketId,
  required List<bool> collectedStates,
}) {
  return Market(
    marketId: marketId,
    marketCode: 'M-$marketId',
    selectedMarket: 'Market $marketId',
    domain: 'Urban',
    districtName: 'West Tripura',
    districtCode: '01',
    villageTown: 'Town $marketId',
    address: 'Address $marketId',
    shops: [
      Shop(
        shopId: marketId,
        shopSerialNo: '$marketId',
        shopName: 'Shop $marketId',
        shopPhoneNumber: '700000000$marketId',
        shopDescriptionAndLocation: 'Location $marketId',
        generalDescriptionOfItemsSold: 'Groceries',
        items: List.generate(
          collectedStates.length,
          (index) => _buildItem(
            seed: marketId * 10 + index,
            isCollected: collectedStates[index],
          ),
        ),
      ),
    ],
  );
}

ShopItem _buildItem({
  required int seed,
  required bool isCollected,
}) {
  return ShopItem(
    itemPriceCollectionShopSetupId: seed,
    itemId: seed,
    itemCode: 'ITEM-$seed',
    itemName: 'Item $seed',
    itemAvailabilityCode: 'AVL',
    marketItemId: seed,
    productSpecification: 'Standard',
    unitOfSale: '',
    previousPeriodPrice: 100,
    currentPrice: isCollected ? 110 : null,
    isCollected: isCollected,
  );
}
