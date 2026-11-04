import 'package:flutter_test/flutter_test.dart';
import 'package:surveyor_app/data/app_data.dart';
import 'package:surveyor_app/models/models.dart';

void main() {
  test('clearSession clears every session-scoped static', () {
    AppData.surveyor = Surveyor(
      id: 'SRV-1',
      name: 'Ananya Dutta',
      designation: 'Field Surveyor',
      district: 'West Tripura',
      phone: '8000000000',
    );
    AppData.markets = [
      Market(
        marketId: 1,
        marketCode: 'UO0109',
        selectedMarket: 'Jirania',
        domain: 'Urban',
        districtName: 'West Tripura',
        districtCode: '01',
        villageTown: 'Bankimnagar',
        address: 'Bankimnagar',
        shops: const [],
      ),
    ];
    AppData.surveyRound = SurveyRound(
      roundId: 7,
      roundNumber: 7,
      roundName: 'August 2026',
      roundStartDate: '2026-08-01',
      roundEndDate: '2026-08-31',
    );
    AppData.noActiveRound = true;
    AppData.lastSyncAt = DateTime(2026, 8, 6, 15, 20);

    AppData.clearSession();

    expect(AppData.surveyor, isNull);
    expect(AppData.markets, isEmpty);
    expect(AppData.surveyRound, isNull);
    // These two are the ones that used to leak into the next session.
    expect(AppData.noActiveRound, isFalse);
    expect(AppData.lastSyncAt, isNull);
  });
}
