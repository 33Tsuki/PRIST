import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../data/app_data.dart';
import '../models/models.dart';
import '../models/price_record.dart';
import '../models/submission_models.dart';
import 'api_client.dart';
import 'price_record_dao.dart';
import 'substitute_shop_service.dart';

class SyncService {
  static SyncService? _instance;
  late final ApiClient _apiClient;

  static const String _cacheKey = 'cached_sync_data';
  static const String _noActiveRoundKey = 'no_active_round';
  static const String _lastSyncKey = 'last_sync_at';

  SyncService._(this._apiClient);

  static Future<SyncService> getInstance() async {
    if (_instance != null) return _instance!;
    final apiClient = await ApiClient.getInstance();
    _instance = SyncService._(apiClient);
    return _instance!;
  }

  Future<SyncData> fetchSyncData() async {
    final response = await _apiClient.get('/sync', tryRefresh: true);

    if (response.statusCode == 401) {
      throw SessionExpiredException();
    }

    if (response.statusCode != 200) {
      throw SyncException(
        'Failed to fetch sync data (${response.statusCode}) ${response.reasonPhrase}',
        response.statusCode,
      );
    }

    final data = json.decode(response.body);
    return SyncData.fromJson(data);
  }

  Future<SyncResult> syncAndStore() async {
    final userId = AppData.surveyor?.id;

    // Phase 1 — POST every round that has pending records. The ACTIVE round's
    // records sync (200); CLOSED/unknown rounds are rejected by the server
    // (409/404) and marked failed so they stop being retried on every sync.
    int rejectedCount = 0;
    if (userId != null) {
      rejectedCount = await _postAllPendingRecords(userId);
    }

    // Phase 2 — GET fresh data
    final syncData = await fetchSyncData();

    final prefs = await SharedPreferences.getInstance();

    // Recorded before the no-active-round branch below: reaching this point
    // means the server answered, which is what "last synced" means to a
    // surveyor — whether or not a round happens to be open.
    final syncedAt = DateTime.now();
    AppData.lastSyncAt = syncedAt;
    await prefs.setString(_lastSyncKey, syncedAt.toIso8601String());

    // Between rounds: server returns survey_round == null. Hide the previous
    // round's data from the UI (clear in-memory state) but keep the persisted
    // cache + DB records intact, so nothing is lost if the round re-opens.
    if (syncData.surveyRound == null) {
      AppData.noActiveRound = true;
      AppData.surveyRound = null;
      AppData.markets = [];
      await prefs.setBool(_noActiveRoundKey, true);
      return SyncResult(SyncOutcome.noActiveRound, rejectedCount);
    }

    final newRoundId = syncData.surveyRound!.roundId;

    // A genuinely new round started (different round id than what we last
    // cached): wipe the old round's local records before loading the new one.
    final cachedRoundId = await _cachedRoundId();
    if (cachedRoundId != null &&
        cachedRoundId != newRoundId &&
        userId != null) {
      final dao = await PriceRecordDao.getInstance();
      await dao.deleteAllRecords();
    }

    AppData.noActiveRound = false;
    await prefs.setBool(_noActiveRoundKey, false);
    AppData.surveyRound = syncData.surveyRound;
    AppData.markets = syncData.markets;

    // Cache clean API data to SharedPreferences
    final rawJson = json.encode({
      'survey_round': syncData.surveyRound!.toJson(),
      'markets': syncData.markets.map((m) => _marketToJson(m)).toList(),
    });
    await prefs.setString(_cacheKey, rawJson);

    // Phase 3 — Rehydrate pending DB records + reconstruct substitute shops
    if (userId != null) {
      await rehydrateFromDb(userId, newRoundId);
    }

    return SyncResult(SyncOutcome.synced, rejectedCount);
  }

  /// POST pending records for every round that has them. Returns the number of
  /// records that were terminally rejected (round closed/unknown).
  Future<int> _postAllPendingRecords(String userId) async {
    final dao = await PriceRecordDao.getInstance();
    final roundIds = await dao.getPendingRoundIds(userId);
    var rejected = 0;
    for (final roundId in roundIds) {
      rejected += await _postPendingRecords(userId, roundId);
    }
    return rejected;
  }

  /// POST one round's pending records. Returns the count of records that were
  /// terminally rejected (409 round closed / 404 round not found).
  Future<int> _postPendingRecords(String userId, int roundId) async {
    try {
      final dao = await PriceRecordDao.getInstance();
      final pending = await dao.getPendingRecords(userId, roundId);
      if (pending.isEmpty) return 0;

      final clientIds = pending.map((r) => r.clientId).toList();
      final body = {
        'round_id': roundId,
        'records': pending.map((r) => r.toSyncJson()).toList(),
      };

      final response = await _apiClient.post(
        '/sync',
        body: body,
        tryRefresh: true,
      );

      if (response.statusCode == 200) {
        await dao.markRecordsSynced(clientIds);
        return 0;
      }

      // Round is CLOSED (409) or doesn't exist (404): the server will never
      // accept these records. Mark them failed so they're not retried forever.
      if (response.statusCode == 409 || response.statusCode == 404) {
        await dao.markRecordsFailed(clientIds);
        return clientIds.length;
      }

      // Other failures (5xx, transient) — leave as pending for retry next sync.
      return 0;
    } catch (_) {
      // Network error / throw — leave records pending for retry.
      return 0;
    }
  }

  Future<bool> loadCachedData() async {
    final prefs = await SharedPreferences.getInstance();

    // Restored ahead of the no-active-round early return below, so the header's
    // "Synced X ago" survives a restart in that state too.
    final storedSyncAt = prefs.getString(_lastSyncKey);
    if (storedSyncAt != null) {
      AppData.lastSyncAt = DateTime.tryParse(storedSyncAt);
    }

    // Last sync reported no active round: stay hidden across restarts. The
    // cache on disk is intentionally kept for when the round re-opens.
    if (prefs.getBool(_noActiveRoundKey) ?? false) {
      AppData.noActiveRound = true;
      AppData.surveyRound = null;
      AppData.markets = [];
      return true;
    }

    final cached = prefs.getString(_cacheKey);
    if (cached == null) return false;

    try {
      final data = json.decode(cached);
      AppData.loadFromJson(data);

      // Rehydrate DB records onto in-memory ShopItems
      final userId = AppData.surveyor?.id;
      final roundId = AppData.surveyRound?.roundId;
      if (userId != null && roundId != null) {
        await rehydrateFromDb(userId, roundId);
      }

      return true;
    } catch (_) {
      return false;
    }
  }

  /// Round id of the currently cached sync data, or null if no cache exists.
  Future<int?> _cachedRoundId() async {
    final prefs = await SharedPreferences.getInstance();
    final cached = prefs.getString(_cacheKey);
    if (cached == null) return null;
    try {
      final data = json.decode(cached);
      final round = data['survey_round'];
      return round == null ? null : (round['round_id'] as num).toInt();
    } catch (_) {
      return null;
    }
  }

  Future<void> rehydrateFromDb(String userId, int roundId) async {
    final dao = await PriceRecordDao.getInstance();
    final records = await dao.getRecordsForRound(userId, roundId);
    final pendingRecords =
        records.where((r) => r.syncStatus == SyncStatus.pending).toList();

    // Pass 1: Apply pending DB records to existing ShopItems.
    // Synced data is already in the API response (current_period_price, is_na).
    // Do NOT set previousPeriodPrice from DB — let the API value stand.
    _applyPendingRecordsToItems(pendingRecords, AppData.markets);

    // Pass 2: Reconstruct substitute shops for all NA items
    // (both API-sourced synced NA and DB-sourced pending NA).
    SubstituteShopService.reconstructSubstituteShops(AppData.markets);

    // Pass 3: Re-apply pending records to newly-created substitute ShopItems.
    // These didn't exist during Pass 1.
    _applyPendingRecordsToItems(pendingRecords, AppData.markets);

    // Persist the reconstructed state (with substitute shops) to cache.
    await updateCache();
  }

  void _applyPendingRecordsToItems(
      List<PriceRecord> records, List<Market> markets) {
    for (final record in records) {
      for (final market in markets) {
        for (final shop in market.shops) {
          for (final item in shop.items) {
            if (item.marketItemId == record.marketItemId) {
              if (record.currentPeriodPrice != null) {
                item.currentPrice = record.currentPeriodPrice;
                item.isCollected = true;
              }
              if (record.isNa) {
                item.isNa = true;
                item.isCollected = true;
              }
              if (record.isNotApplicable) {
                item.isNotApplicable = true;
                item.isCollected = true;
              }
              item.remark = record.remark;
            }
          }
        }
      }
    }
  }

  Future<void> updateCache() async {
    final prefs = await SharedPreferences.getInstance();
    final rawJson = json.encode({
      'survey_round': AppData.surveyRound?.toJson(),
      'markets': AppData.markets.map((m) => _marketToJson(m)).toList(),
    });
    await prefs.setString(_cacheKey, rawJson);
  }

  Map<String, dynamic> _marketToJson(Market m) => {
        'market_id': m.marketId,
        'market_code': m.marketCode,
        'selected_market': m.selectedMarket,
        'domain': m.domain,
        'district_name': m.districtName,
        'district_code': m.districtCode,
        'village_town': m.villageTown,
        'address': m.address,
        'review_remark': m.reviewRemark,
        'shops': m.shops.map((s) => _shopToJson(s)).toList(),
      };

  Map<String, dynamic> _shopToJson(Shop s) => {
        'shop_id': s.shopId,
        'shop_serial_no': s.shopSerialNo,
        'shop_name': s.shopName,
        'shop_phone_number': s.shopPhoneNumber,
        'shop_description_and_location': s.shopDescriptionAndLocation,
        'general_description_of_items_sold': s.generalDescriptionOfItemsSold,
        'items': s.items.map((i) => _itemToJson(i)).toList(),
      };

  Map<String, dynamic> _itemToJson(ShopItem i) => {
        'item_price_collection_shop_setup_id': i.itemPriceCollectionShopSetupId,
        'item_id': i.itemId,
        'item_code': i.itemCode,
        'item_name': i.itemName,
        'market_item_description': i.marketItemDescription,
        'item_availability_code': i.itemAvailabilityCode,
        'market_item_id': i.marketItemId,
        'product_specification': i.productSpecification,
        'unit_of_sale': i.unitOfSale,
        'previous_period_price': i.previousPeriodPrice,
        'stored_previous_period_price': i.storedPreviousPeriodPrice,
        'current_period_price': i.currentPrice,
        'is_na': i.isNa,
        'is_not_applicable': i.isNotApplicable,
        'is_forwarded': i.isForwarded,
        'remark': i.remark,
        'ds_remark': i.dsRemark,
        'substitute_shop_1': i.substituteShop1 != null
            ? _substituteToJson(i.substituteShop1!)
            : null,
        'substitute_shop_2': i.substituteShop2 != null
            ? _substituteToJson(i.substituteShop2!)
            : null,
      };

  Map<String, dynamic> _substituteToJson(SubstituteShop s) => {
        'item_price_collection_shop_setup_id': s.itemPriceCollectionShopSetupId,
        'shop_id': s.shopId,
        'shop_serial_no': s.shopSerialNo,
        'shop_name': s.shopName,
        'shop_description_and_location': s.shopDescriptionAndLocation,
        'market_item_id': s.marketItemId,
        'market_item_description': s.marketItemDescription,
        'previous_period_price': s.previousPeriodPrice,
        'stored_previous_period_price': s.storedPreviousPeriodPrice,
        'current_period_price': s.currentPeriodPrice,
        'is_na': s.isNa,
        'is_not_applicable': s.isNotApplicable,
        'remark': s.remark,
        'ds_remark': s.dsRemark,
      };

  /// Submit collected data. Pass [marketId] to submit that market alone; omit it
  /// to submit every assigned market at once (legacy whole-round behaviour).
  Future<SubmissionResponse> submitRound({int? marketId}) async {
    final body = <String, dynamic>{'round_id': AppData.surveyRound?.roundId};
    if (marketId != null) body['market_id'] = marketId;

    final response = await _apiClient.post(
      '/sync/submit',
      body: body,
      tryRefresh: true,
    );

    if (response.statusCode == 401) throw SessionExpiredException();

    if (response.statusCode == 409) throw SubmitAlreadySubmittedException();

    // The market is no longer assigned to this surveyor (reassigned since the
    // last sync), or the id is unknown to the server.
    if (response.statusCode == 404) throw SubmitMarketNotAssignedException();

    if (response.statusCode == 422) {
      final body = json.decode(response.body);
      final detail = body['detail'];
      final message = detail is Map ? detail['detail'] : detail.toString();
      final rawItems =
          detail is Map ? (detail['missing_items'] as List?) ?? [] : [];
      final items = rawItems
          .map((e) => MissingPriceItem.fromJson(e as Map<String, dynamic>))
          .toList();
      throw SubmitIncompleteException(message, items);
    }

    if (response.statusCode != 200) {
      throw SyncException(
        'Submission failed (${response.statusCode})',
        response.statusCode,
      );
    }

    return SubmissionResponse.fromJson(json.decode(response.body));
  }
}

enum SyncOutcome { synced, noActiveRound }

class SyncResult {
  final SyncOutcome outcome;

  /// Records dropped this sync because their round was closed/unknown (409/404).
  final int rejectedCount;

  SyncResult(this.outcome, this.rejectedCount);
}

class SyncException implements Exception {
  final String message;
  final int statusCode;

  SyncException(this.message, this.statusCode);

  @override
  String toString() => message;
}

class SessionExpiredException implements Exception {
  @override
  String toString() => 'Session expired. Please log in again.';
}

class SubmitAlreadySubmittedException implements Exception {
  @override
  String toString() => 'Already submitted for this round.';
}

class SubmitMarketNotAssignedException implements Exception {
  @override
  String toString() =>
      'This market is no longer assigned to you. Sync to refresh.';
}

class SubmitIncompleteException implements Exception {
  final String message;
  final List<MissingPriceItem> missingItems;

  SubmitIncompleteException(this.message, this.missingItems);

  @override
  String toString() => message;
}
