import '../models/models.dart';
import 'price_record_dao.dart';

class SubstituteShopService {
  /// Returns the primary substitute (and optional secondary) for an item,
  /// or null if no valid substitute exists.
  static (SubstituteShop, SubstituteShop?)? resolveSubstitute(ShopItem item) {
    final sub1 = item.substituteShop1;
    final sub2 = item.substituteShop2;
    if (sub1 != null && sub1.marketItemId != null) return (sub1, sub2);
    if (sub2 != null && sub2.marketItemId != null) return (sub2, null);
    return null;
  }

  /// Adds a forwarded item to the substitute shop within the given market.
  /// If the substitute shop doesn't exist yet, it is created and appended.
  /// Duplicate items (by marketItemId) are skipped.
  /// Returns true if a new item was added, false if it already existed.
  static bool addItemToSubstituteShop(
    Market market,
    ShopItem originalItem,
    SubstituteShop substitute,
    SubstituteShop? remainingSubstitute,
  ) {
    Shop targetShop;
    final idx = market.shops.indexWhere((s) => s.shopId == substitute.shopId);
    if (idx >= 0) {
      targetShop = market.shops[idx];
    } else {
      targetShop = Shop(
        shopId: substitute.shopId,
        shopSerialNo: substitute.shopSerialNo,
        shopName: substitute.shopName,
        shopDescriptionAndLocation: substitute.shopDescriptionAndLocation,
        generalDescriptionOfItemsSold: '',
        items: [],
      );
      market.shops.add(targetShop);
    }

    if (targetShop.items
        .any((i) => i.marketItemId == substitute.marketItemId)) {
      return false;
    }

    targetShop.items.add(ShopItem(
      itemPriceCollectionShopSetupId: substitute.itemPriceCollectionShopSetupId,
      itemId: originalItem.itemId,
      itemCode: originalItem.itemCode,
      itemName: originalItem.itemName,
      marketItemDescription: substitute.marketItemDescription ??
          originalItem.marketItemDescription,
      itemAvailabilityCode: originalItem.itemAvailabilityCode,
      marketItemId: substitute.marketItemId!,
      productSpecification: originalItem.productSpecification,
      unitOfSale: originalItem.unitOfSale,
      previousPeriodPrice: substitute.previousPeriodPrice,
      storedPreviousPeriodPrice: substitute.storedPreviousPeriodPrice,
      currentPrice: substitute.currentPeriodPrice,
      isNa: substitute.isNa,
      isNotApplicable: substitute.isNotApplicable,
      isForwarded: true,
      isCollected: substitute.currentPeriodPrice != null ||
          substitute.isNa ||
          substitute.isNotApplicable,
      dsRemark: originalItem.dsRemark,
      substituteShop1: remainingSubstitute,
      substituteShop2: null,
    ));
    return true;
  }

  /// Removes forwarded substitute items for the given item from the market.
  /// Also deletes the corresponding DB records.
  static Future<void> removeForwardedItems(
    Market market,
    ShopItem item,
    String? userId,
    int? roundId,
  ) async {
    for (final sub in [item.substituteShop1, item.substituteShop2]) {
      if (sub == null || sub.marketItemId == null) continue;

      final shopIdx = market.shops.indexWhere((s) => s.shopId == sub.shopId);
      if (shopIdx < 0) continue;

      final shop = market.shops[shopIdx];
      shop.items.removeWhere((i) => i.marketItemId == sub.marketItemId);

      if (shop.items.isEmpty) {
        market.shops.removeAt(shopIdx);
      }

      if (userId != null && roundId != null) {
        final dao = await PriceRecordDao.getInstance();
        final record =
            await dao.getRecordForItem(userId, roundId, sub.marketItemId!);
        if (record != null) {
          await dao.deleteRecord(record.clientId);
        }
      }
    }
  }

  /// Iterates all markets/shops/items and reconstructs substitute shops
  /// for every item that is marked NA and has valid substitutes.
  /// Loops until the full chain is reconstructed (e.g. original → sub1 → sub2).
  static void reconstructSubstituteShops(List<Market> markets) {
    for (final market in markets) {
      bool addedAny;
      do {
        addedAny = false;
        final toForward = <(ShopItem, SubstituteShop, SubstituteShop?)>[];
        for (final shop in market.shops) {
          for (final item in shop.items) {
            if (!item.isNa) continue;
            final resolved = resolveSubstitute(item);
            if (resolved == null) continue;
            final (primary, remaining) = resolved;
            toForward.add((item, primary, remaining));
          }
        }
        for (final (originalItem, substitute, remaining) in toForward) {
          if (addItemToSubstituteShop(
              market, originalItem, substitute, remaining)) {
            addedAny = true;
          }
        }
      } while (addedAny);
    }
  }
}
