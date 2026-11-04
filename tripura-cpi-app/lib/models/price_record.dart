enum SyncStatus { pending, synced, failed }

class PriceRecord {
  final int? id;
  final String clientId;
  final String userId;
  final int roundId;
  final int marketItemId;
  final int itemPriceCollectionShopSetupId;
  final double? previousPeriodPrice;
  final double? currentPeriodPrice;
  final bool isNa;
  final bool isNotApplicable;
  final String? remark;
  final String priceRecordingDate;
  final SyncStatus syncStatus;
  final String createdAt;
  final String updatedAt;

  PriceRecord({
    this.id,
    required this.clientId,
    required this.userId,
    required this.roundId,
    required this.marketItemId,
    required this.itemPriceCollectionShopSetupId,
    this.previousPeriodPrice,
    this.currentPeriodPrice,
    this.isNa = false,
    this.isNotApplicable = false,
    this.remark,
    required this.priceRecordingDate,
    this.syncStatus = SyncStatus.pending,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() => {
        if (id != null) 'id': id,
        'client_id': clientId,
        'user_id': userId,
        'round_id': roundId,
        'market_item_id': marketItemId,
        'item_price_collection_shop_setup_id': itemPriceCollectionShopSetupId,
        'previous_period_price': previousPeriodPrice,
        'current_period_price': currentPeriodPrice,
        'is_na': isNa ? 1 : 0,
        'is_not_applicable': isNotApplicable ? 1 : 0,
        'remark': remark,
        'price_recording_date': priceRecordingDate,
        'sync_status': syncStatus.name,
        'created_at': createdAt,
        'updated_at': updatedAt,
      };

  factory PriceRecord.fromMap(Map<String, dynamic> map) => PriceRecord(
        id: map['id'] as int?,
        clientId: map['client_id'] as String,
        userId: map['user_id'] as String,
        roundId: map['round_id'] as int,
        marketItemId: map['market_item_id'] as int,
        itemPriceCollectionShopSetupId:
            map['item_price_collection_shop_setup_id'] as int,
        previousPeriodPrice: map['previous_period_price'] != null
            ? (map['previous_period_price'] as num).toDouble()
            : null,
        currentPeriodPrice: map['current_period_price'] != null
            ? (map['current_period_price'] as num).toDouble()
            : null,
        isNa: map['is_na'] == 1,
        isNotApplicable: map['is_not_applicable'] == 1,
        remark: map['remark'] as String?,
        priceRecordingDate: map['price_recording_date'] as String,
        syncStatus: SyncStatus.values.firstWhere(
          (s) => s.name == map['sync_status'],
          orElse: () => SyncStatus.pending,
        ),
        createdAt: map['created_at'] as String,
        updatedAt: map['updated_at'] as String,
      );

  Map<String, dynamic> toSyncJson() => {
        'client_id': clientId,
        'market_item_id': marketItemId,
        'item_price_collection_shop_setup_id': itemPriceCollectionShopSetupId,
        'previous_period_price': previousPeriodPrice,
        'current_period_price': currentPeriodPrice,
        'is_na': isNa,
        'is_not_applicable': isNotApplicable,
        'remark': remark,
        'price_recording_date': priceRecordingDate,
      };
}
