class MissingPriceItem {
  final int itemId;
  final String itemCode;
  final String itemName;
  final int marketId;
  final String marketCode;
  final String selectedMarket;
  final String reason; // "missing_current_price"

  MissingPriceItem.fromJson(Map<String, dynamic> json)
      : itemId = json['item_id'],
        itemCode = json['item_code'],
        itemName = json['item_name'],
        marketId = json['market_id'],
        marketCode = json['market_code'],
        selectedMarket = json['selected_market'],
        reason = json['reason'];

  String get reasonLabel => 'No price entered';
}

class SubmissionResponse {
  final int roundId;
  final int surveyorId;
  final int marketsSubmitted;

  /// Only populated when a single market was submitted.
  final int? marketId;
  final String? status;
  final String? submittedAt;

  SubmissionResponse.fromJson(Map<String, dynamic> json)
      : roundId = json['round_id'],
        surveyorId = json['surveyor_id'],
        marketsSubmitted = json['markets_submitted'],
        marketId = json['market_id'] as int?,
        status = json['status'] as String?,
        submittedAt = json['submitted_at'] as String?;
}
