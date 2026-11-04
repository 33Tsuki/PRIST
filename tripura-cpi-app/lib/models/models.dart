enum CollectionStatus { completed, partial, notStarted }

int _toInt(dynamic v) => v is int ? v : int.parse(v.toString());

double _toDouble(dynamic v) =>
    v is num ? v.toDouble() : double.parse(v.toString());

double? _toDoubleOrNull(dynamic v) => v == null ? null : _toDouble(v);

int? _toIntOrNull(dynamic v) => v == null ? null : _toInt(v);

class SurveyRound {
  final int roundId;
  final int roundNumber;
  final String? roundName;
  final String roundStartDate;
  final String roundEndDate;

  SurveyRound({
    required this.roundId,
    required this.roundNumber,
    required this.roundName,
    required this.roundStartDate,
    required this.roundEndDate,
  });

  factory SurveyRound.fromJson(Map<String, dynamic> json) {
    return SurveyRound(
      roundId: _toInt(json['round_id']),
      roundNumber: _toInt(json['round_number']),
      roundName: json['round_name']?.toString(),
      roundStartDate: json['round_start_date']?.toString() ?? '',
      roundEndDate: json['round_end_date']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
        'round_id': roundId,
        'round_number': roundNumber,
        'round_name': roundName,
        'round_start_date': roundStartDate,
        'round_end_date': roundEndDate,
      };
}

class SubstituteShop {
  final int itemPriceCollectionShopSetupId;
  final int shopId;
  final String shopSerialNo;
  final String shopName;
  final String shopDescriptionAndLocation;
  final int? marketItemId;
  final String? marketItemDescription;
  final double? previousPeriodPrice;
  final double? storedPreviousPeriodPrice;
  final double? currentPeriodPrice;
  final bool isNa;
  final bool isNotApplicable;
  final String? remark;
  final String? dsRemark;

  SubstituteShop({
    required this.itemPriceCollectionShopSetupId,
    required this.shopId,
    required this.shopSerialNo,
    required this.shopName,
    required this.shopDescriptionAndLocation,
    this.marketItemId,
    this.marketItemDescription,
    this.previousPeriodPrice,
    this.storedPreviousPeriodPrice,
    this.currentPeriodPrice,
    this.isNa = false,
    this.isNotApplicable = false,
    this.remark,
    this.dsRemark,
  });

  factory SubstituteShop.fromJson(Map<String, dynamic> json) {
    return SubstituteShop(
      itemPriceCollectionShopSetupId:
          _toInt(json['item_price_collection_shop_setup_id']),
      shopId: _toInt(json['shop_id']),
      shopSerialNo: json['shop_serial_no'].toString(),
      shopName: json['shop_name'].toString(),
      shopDescriptionAndLocation:
          json['shop_description_and_location']?.toString() ?? '',
      marketItemId: _toIntOrNull(json['market_item_id']),
      marketItemDescription: json['market_item_description']?.toString(),
      previousPeriodPrice: _toDoubleOrNull(json['previous_period_price']),
      storedPreviousPeriodPrice:
          _toDoubleOrNull(json['stored_previous_period_price']),
      currentPeriodPrice: _toDoubleOrNull(json['current_period_price']),
      isNa: json['is_na'] == true,
      isNotApplicable: json['is_not_applicable'] == true,
      remark: json['remark']?.toString(),
      dsRemark: json['ds_remark']?.toString(),
    );
  }
}

class ShopItem {
  final int itemPriceCollectionShopSetupId;
  final int itemId;
  final String itemCode;
  final String itemName;
  final String? marketItemDescription;
  final String itemAvailabilityCode;
  final int marketItemId;
  final String productSpecification;
  final String unitOfSale;
  double? previousPeriodPrice;
  double? storedPreviousPeriodPrice;
  final SubstituteShop? substituteShop1;
  final SubstituteShop? substituteShop2;

  double? currentPrice;
  bool isCollected;
  bool isNa;
  bool isNotApplicable;
  final bool isForwarded;
  String? remark;

  /// District Supervisor's item-level remark (read-only to the surveyor).
  final String? dsRemark;

  double? get priceChangePercent {
    if (currentPrice == null ||
        previousPeriodPrice == null ||
        previousPeriodPrice == 0) {
      return null;
    }
    return ((currentPrice! - previousPeriodPrice!) / previousPeriodPrice!) *
        100;
  }

  /// Local name (market item description) when available, else the canonical
  /// item name.
  String get displayName => (marketItemDescription?.trim().isNotEmpty ?? false)
      ? marketItemDescription!.trim()
      : itemName;

  ShopItem({
    required this.itemPriceCollectionShopSetupId,
    required this.itemId,
    required this.itemCode,
    required this.itemName,
    this.marketItemDescription,
    required this.itemAvailabilityCode,
    required this.marketItemId,
    required this.productSpecification,
    required this.unitOfSale,
    this.previousPeriodPrice,
    this.storedPreviousPeriodPrice,
    this.substituteShop1,
    this.substituteShop2,
    this.currentPrice,
    this.isCollected = false,
    this.isNa = false,
    this.isNotApplicable = false,
    this.isForwarded = false,
    this.remark,
    this.dsRemark,
  });

  factory ShopItem.fromJson(Map<String, dynamic> json) {
    return ShopItem(
      itemPriceCollectionShopSetupId:
          _toInt(json['item_price_collection_shop_setup_id']),
      itemId: _toInt(json['item_id']),
      itemCode: json['item_code'].toString(),
      itemName: json['item_name'].toString(),
      marketItemDescription: json['market_item_description']?.toString(),
      itemAvailabilityCode: json['item_availability_code']?.toString() ?? '',
      marketItemId: _toInt(json['market_item_id']),
      productSpecification: json['product_specification']?.toString() ?? '',
      unitOfSale: json['unit_of_sale']?.toString() ?? '',
      previousPeriodPrice: _toDoubleOrNull(json['previous_period_price']),
      storedPreviousPeriodPrice:
          _toDoubleOrNull(json['stored_previous_period_price']),
      substituteShop1: json['substitute_shop_1'] != null
          ? SubstituteShop.fromJson(json['substitute_shop_1'])
          : null,
      substituteShop2: json['substitute_shop_2'] != null
          ? SubstituteShop.fromJson(json['substitute_shop_2'])
          : null,
      currentPrice: _toDoubleOrNull(json['current_period_price']),
      isNa: json['is_na'] == true,
      isNotApplicable: json['is_not_applicable'] == true,
      isForwarded: json['is_forwarded'] == true,
      remark: json['remark']?.toString(),
      dsRemark: json['ds_remark']?.toString(),
      isCollected: json['is_na'] == true ||
          json['is_not_applicable'] == true ||
          json['current_period_price'] != null,
    );
  }
}

class Shop {
  final int shopId;
  final String shopSerialNo;
  final String shopName;
  final String? shopPhoneNumber;
  final String shopDescriptionAndLocation;
  final String generalDescriptionOfItemsSold;
  final List<ShopItem> items;

  Shop({
    required this.shopId,
    required this.shopSerialNo,
    required this.shopName,
    this.shopPhoneNumber,
    required this.shopDescriptionAndLocation,
    required this.generalDescriptionOfItemsSold,
    required this.items,
  });

  int get totalItems => items.length;

  int get collectedItems => items.where((i) => i.isCollected).length;

  CollectionStatus get status {
    if (totalItems == 0) return CollectionStatus.completed;
    final collected = collectedItems;
    if (collected == 0) return CollectionStatus.notStarted;
    if (collected >= totalItems) return CollectionStatus.completed;
    return CollectionStatus.partial;
  }

  factory Shop.fromJson(Map<String, dynamic> json) {
    final itemsList =
        (json['items'] as List?)?.map((i) => ShopItem.fromJson(i)).toList() ??
            [];
    return Shop(
      shopId: _toInt(json['shop_id']),
      shopSerialNo: json['shop_serial_no'].toString(),
      shopName: json['shop_name'].toString(),
      shopPhoneNumber: json['shop_phone_number']?.toString(),
      shopDescriptionAndLocation:
          json['shop_description_and_location']?.toString() ?? '',
      generalDescriptionOfItemsSold:
          json['general_description_of_items_sold']?.toString() ?? '',
      items: itemsList,
    );
  }
}

class Market {
  final int marketId;
  final String marketCode;
  final String selectedMarket;
  final String domain;
  final String districtName;
  final String districtCode;
  final String villageTown;
  final String address;
  final String? reviewRemark;
  final List<Shop> shops;

  Market({
    required this.marketId,
    required this.marketCode,
    required this.selectedMarket,
    required this.domain,
    required this.districtName,
    required this.districtCode,
    required this.villageTown,
    required this.address,
    this.reviewRemark,
    required this.shops,
  });

  String get displayName => '$selectedMarket ($marketCode)';
  String get location => '$villageTown, $districtName';

  int get totalItems => shops.fold(0, (sum, shop) => sum + shop.totalItems);

  int get collectedItems =>
      shops.fold(0, (sum, shop) => sum + shop.collectedItems);

  int get collectedShops =>
      shops.where((s) => s.status == CollectionStatus.completed).length;

  /// Every shop collected — the precondition for submitting this market.
  /// A market with no shops has nothing to hand in, so it is never ready.
  bool get isReadyToSubmit =>
      shops.isNotEmpty && collectedShops == shops.length;

  double get completionPercent =>
      totalItems == 0 ? 0 : (collectedItems / totalItems) * 100;

  List<ShopItem> get items => shops.expand((shop) => shop.items).toList();

  CollectionStatus get status {
    if (totalItems == 0) return CollectionStatus.completed;
    final collected = collectedItems;
    if (collected == 0) return CollectionStatus.notStarted;
    if (collected >= totalItems) return CollectionStatus.completed;
    return CollectionStatus.partial;
  }

  factory Market.fromJson(Map<String, dynamic> json) {
    final shopsList =
        (json['shops'] as List?)?.map((s) => Shop.fromJson(s)).toList() ?? [];
    return Market(
      marketId: _toInt(json['market_id']),
      marketCode: json['market_code'].toString(),
      selectedMarket: json['selected_market'].toString(),
      domain: json['domain'].toString(),
      districtName: json['district_name']?.toString() ?? '',
      districtCode: json['district_code']?.toString() ?? '',
      villageTown: json['village_town']?.toString() ?? '',
      address: json['address']?.toString() ?? '',
      reviewRemark: json['review_remark'] as String?,
      shops: shopsList,
    );
  }
}

class SyncData {
  final SurveyRound? surveyRound;
  final List<Market> markets;
  final String? message;

  SyncData({required this.surveyRound, required this.markets, this.message});

  factory SyncData.fromJson(Map<String, dynamic> json) {
    return SyncData(
      surveyRound: json['survey_round'] == null
          ? null
          : SurveyRound.fromJson(json['survey_round']),
      markets: (json['markets'] as List? ?? [])
          .map((m) => Market.fromJson(m))
          .toList(),
      message: json['message']?.toString(),
    );
  }
}
