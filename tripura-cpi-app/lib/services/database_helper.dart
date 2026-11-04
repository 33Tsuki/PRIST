import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';

class DatabaseHelper {
  static DatabaseHelper? _instance;
  static Database? _database;

  DatabaseHelper._();

  static Future<DatabaseHelper> getInstance() async {
    _instance ??= DatabaseHelper._();
    if (_database == null || !_database!.isOpen) {
      _database = await _initDatabase();
    }
    return _instance!;
  }

  Database get database => _database!;

  static Future<Database> _initDatabase() async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, 'cpi_surveyor.db');

    return openDatabase(
      path,
      version: 2,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE price_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            round_id INTEGER NOT NULL,
            market_item_id INTEGER NOT NULL,
            item_price_collection_shop_setup_id INTEGER NOT NULL,
            previous_period_price REAL,
            current_period_price REAL,
            is_na INTEGER NOT NULL DEFAULT 0,
            is_not_applicable INTEGER NOT NULL DEFAULT 0,
            remark TEXT,
            price_recording_date TEXT NOT NULL,
            sync_status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        ''');

        await db.execute('''
          CREATE UNIQUE INDEX idx_price_records_unique
          ON price_records (user_id, round_id, market_item_id)
        ''');

        await db.execute('''
          CREATE INDEX idx_price_records_sync
          ON price_records (user_id, round_id, sync_status)
        ''');
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          await db.execute(
            'ALTER TABLE price_records '
            'ADD COLUMN is_not_applicable INTEGER NOT NULL DEFAULT 0',
          );
        }
      },
    );
  }
}
