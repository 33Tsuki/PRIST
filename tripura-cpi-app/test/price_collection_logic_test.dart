import 'package:flutter_test/flutter_test.dart';
import 'package:surveyor_app/models/models.dart';
import 'package:surveyor_app/models/price_record.dart';
import 'package:surveyor_app/utils/price_validation.dart';

void main() {
  group('Price Collection Logic Tests', () {
    test('Percentage difference logic handles null previous price gracefully',
        () {
      final item = ShopItem(
        itemPriceCollectionShopSetupId: 1,
        itemId: 101,
        itemCode: 'ITEM-1',
        itemName: 'Test Item',
        itemAvailabilityCode: 'A',
        marketItemId: 201,
        productSpecification: 'Spec',
        unitOfSale: 'kg',
        currentPrice: 150.0,
        previousPeriodPrice: null,
      );

      // Verify that percentage difference returns null instead of throwing or returning Infinity
      expect(item.priceChangePercent, isNull);
    });

    test('Percentage difference logic handles zero previous price gracefully',
        () {
      final item = ShopItem(
        itemPriceCollectionShopSetupId: 1,
        itemId: 101,
        itemCode: 'ITEM-1',
        itemName: 'Test Item',
        itemAvailabilityCode: 'A',
        marketItemId: 201,
        productSpecification: 'Spec',
        unitOfSale: 'kg',
        currentPrice: 150.0,
        previousPeriodPrice: 0.0,
      );

      // Verify that percentage difference returns null instead of throwing or returning Infinity
      expect(item.priceChangePercent, isNull);
    });

    test('isPriceLikelyTypo handles null/zero values gracefully', () {
      expect(isPriceLikelyTypo(150.0, null), isFalse);
      expect(isPriceLikelyTypo(150.0, 0.0), isFalse);
      expect(isPriceLikelyTypo(null, 150.0), isFalse);
      expect(isPriceLikelyTypo(0.0, 150.0), isFalse);
      // Actual typo check
      expect(isPriceLikelyTypo(200.0, 100.0), isTrue); // 2x
      expect(isPriceLikelyTypo(40.0, 100.0), isTrue); // < 1/2x
      expect(isPriceLikelyTypo(120.0, 100.0), isFalse);
    });

    test(
        'ShopItem JSON deserialization sets isCollected to true when only current period price is present',
        () {
      final json = {
        'item_price_collection_shop_setup_id': 1,
        'item_id': 101,
        'item_code': 'ITEM-1',
        'item_name': 'Test Item',
        'market_item_id': 201,
        'current_period_price': 150.0,
        'previous_period_price': null,
        'stored_previous_period_price': null,
      };

      final item = ShopItem.fromJson(json);

      expect(item.isCollected, isTrue);
      expect(item.currentPrice, 150.0);
      expect(item.previousPeriodPrice, isNull);
    });

    test(
        'ShopItem JSON deserialization sets isCollected to false when current period price is absent (not NA)',
        () {
      final json = {
        'item_price_collection_shop_setup_id': 1,
        'item_id': 101,
        'item_code': 'ITEM-1',
        'item_name': 'Test Item',
        'market_item_id': 201,
        'current_period_price': null,
        'previous_period_price': 150.0,
        'stored_previous_period_price': null,
      };

      final item = ShopItem.fromJson(json);

      expect(item.isCollected, isFalse);
    });

    test('PriceRecord toSyncJson serializes null previousPeriodPrice correctly',
        () {
      final record = PriceRecord(
        clientId: 'test-client',
        userId: 'user1',
        roundId: 1,
        marketItemId: 201,
        itemPriceCollectionShopSetupId: 1,
        previousPeriodPrice: null,
        currentPeriodPrice: 150.0,
        priceRecordingDate: '2026-09-28',
        createdAt: '2026-09-28',
        updatedAt: '2026-09-28',
      );

      final json = record.toSyncJson();
      expect(json['previous_period_price'], isNull);
      expect(json['current_period_price'], 150.0);
    });
  });
}
