// lib/data/app_data.dart
import 'dart:convert';
import 'package:flutter/services.dart';
import '../models/models.dart';

class AppData {
  static List<Market> markets = [];
  static SurveyRound? surveyRound;

  /// True when the server's last /sync reported no active round (between rounds).
  /// Cached markets/surveyRound are intentionally kept when this is set.
  static bool noActiveRound = false;

  /// When /sync last completed. Mirrors the `last_sync_at` pref so screens can
  /// read it synchronously in build().
  static DateTime? lastSyncAt;

  /// Clears every static belonging to a signed-in session. Called from
  /// [AuthService.logout] — these are statics, so they outlive a logout unless
  /// explicitly reset, and would leak into the next surveyor's session.
  static void clearSession() {
    surveyor = null;
    markets = [];
    surveyRound = null;
    noActiveRound = false;
    lastSyncAt = null;
  }

  static Future<void> init() async {
    final String response =
        await rootBundle.loadString('assets/data/mock_data.json');
    final data = json.decode(response);
    final syncData = SyncData.fromJson(data);
    surveyRound = syncData.surveyRound;
    markets = syncData.markets;
  }

  static void loadFromJson(Map<String, dynamic> data) {
    final syncData = SyncData.fromJson(data);
    surveyRound = syncData.surveyRound;
    markets = syncData.markets;
  }

  static Shop? getShop(int marketId, int shopId) {
    try {
      final market = markets.firstWhere((m) => m.marketId == marketId);
      return market.shops.firstWhere((s) => s.shopId == shopId);
    } catch (_) {
      return null;
    }
  }

  static List<ShopItem> getShopItems(int marketId, int shopId) {
    return getShop(marketId, shopId)?.items ?? [];
  }

  static Surveyor? surveyor;
}

class Surveyor {
  final String id, name, designation, district, phone;
  Surveyor(
      {required this.id,
      required this.name,
      required this.designation,
      required this.district,
      required this.phone});

  factory Surveyor.fromApiResponse(Map<String, dynamic> json) {
    return Surveyor(
      id: (json['id'] ?? json['user_id'] ?? '').toString(),
      name: json['full_name'] ?? json['name'] ?? '',
      designation: json['designation'] ?? '',
      district: json['district'] ?? '',
      phone: json['phone'] ?? '',
    );
  }
}
