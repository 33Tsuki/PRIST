import 'package:sqflite/sqflite.dart';

import '../models/price_record.dart';
import 'database_helper.dart';

class PriceRecordDao {
  static PriceRecordDao? _instance;

  PriceRecordDao._();

  static Future<PriceRecordDao> getInstance() async {
    if (_instance != null) return _instance!;
    // Ensure DB is initialized
    await DatabaseHelper.getInstance();
    _instance = PriceRecordDao._();
    return _instance!;
  }

  Future<Database> get _db async =>
      (await DatabaseHelper.getInstance()).database;

  Future<void> upsertRecord(PriceRecord record) async {
    final db = await _db;
    await db.insert(
      'price_records',
      record.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<PriceRecord>> getRecordsForRound(
      String userId, int roundId) async {
    final db = await _db;
    final maps = await db.query(
      'price_records',
      where: 'user_id = ? AND round_id = ?',
      whereArgs: [userId, roundId],
    );
    return maps.map((m) => PriceRecord.fromMap(m)).toList();
  }

  Future<List<PriceRecord>> getPendingRecords(
      String userId, int roundId) async {
    final db = await _db;
    final maps = await db.query(
      'price_records',
      where: 'user_id = ? AND round_id = ? AND sync_status = ?',
      whereArgs: [userId, roundId, 'pending'],
    );
    return maps.map((m) => PriceRecord.fromMap(m)).toList();
  }

  /// Distinct round ids that currently have pending records for this user.
  /// Used to flush every round with pending data, not just the in-memory one.
  Future<List<int>> getPendingRoundIds(String userId) async {
    final db = await _db;
    final maps = await db.query(
      'price_records',
      distinct: true,
      columns: ['round_id'],
      where: 'user_id = ? AND sync_status = ?',
      whereArgs: [userId, 'pending'],
    );
    return maps.map((m) => m['round_id'] as int).toList();
  }

  Future<void> markRecordsSynced(List<String> clientIds) async {
    await _setSyncStatus(clientIds, 'synced');
  }

  /// Mark records as terminally failed (e.g. round closed — server rejected
  /// with 409/404). These are not retried on subsequent syncs.
  Future<void> markRecordsFailed(List<String> clientIds) async {
    await _setSyncStatus(clientIds, 'failed');
  }

  Future<void> _setSyncStatus(List<String> clientIds, String status) async {
    if (clientIds.isEmpty) return;
    final db = await _db;
    final placeholders = List.filled(clientIds.length, '?').join(', ');
    await db.rawUpdate(
      'UPDATE price_records SET sync_status = ?, updated_at = ? '
      'WHERE client_id IN ($placeholders)',
      [status, DateTime.now().toIso8601String(), ...clientIds],
    );
  }

  Future<PriceRecord?> getRecordForItem(
      String userId, int roundId, int marketItemId) async {
    final db = await _db;
    final maps = await db.query(
      'price_records',
      where: 'user_id = ? AND round_id = ? AND market_item_id = ?',
      whereArgs: [userId, roundId, marketItemId],
      limit: 1,
    );
    if (maps.isEmpty) return null;
    return PriceRecord.fromMap(maps.first);
  }

  Future<void> deleteRecord(String clientId) async {
    final db = await _db;
    await db.delete(
      'price_records',
      where: 'client_id = ?',
      whereArgs: [clientId],
    );
  }

  Future<void> deleteAllRecords() async {
    final db = await _db;
    await db.delete('price_records');
  }
}
