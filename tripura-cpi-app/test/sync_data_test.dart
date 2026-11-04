import 'package:flutter_test/flutter_test.dart';
import 'package:surveyor_app/models/models.dart';

void main() {
  group('SyncData.fromJson', () {
    test('parses a "No active round" response without throwing', () {
      final data = SyncData.fromJson({
        'survey_round': null,
        'markets': [],
        'message': 'No active round',
      });

      expect(data.surveyRound, isNull);
      expect(data.markets, isEmpty);
      expect(data.message, 'No active round');
    });

    test('tolerates a missing markets key', () {
      final data = SyncData.fromJson({'survey_round': null});

      expect(data.surveyRound, isNull);
      expect(data.markets, isEmpty);
    });

    test('parses an active round normally', () {
      final data = SyncData.fromJson({
        'survey_round': {
          'round_id': 15,
          'round_number': 4,
          'round_name': 'May 2026',
          'round_start_date': '2026-05-01',
          'round_end_date': '2026-05-31',
        },
        'markets': [],
      });

      expect(data.surveyRound, isNotNull);
      expect(data.surveyRound!.roundId, 15);
      expect(data.surveyRound!.roundName, 'May 2026');
    });
  });
}
