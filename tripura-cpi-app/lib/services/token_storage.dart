import 'package:shared_preferences/shared_preferences.dart';

class TokenStorage {
  static TokenStorage? _instance;
  late final SharedPreferences _prefs;

  TokenStorage._(this._prefs);

  static Future<TokenStorage> getInstance() async {
    if (_instance != null) return _instance!;
    final prefs = await SharedPreferences.getInstance();
    _instance = TokenStorage._(prefs);
    return _instance!;
  }

  // Keys
  static const _keyAccessToken = 'access_token';
  static const _keyRefreshToken = 'refresh_token';
  static const _keyUserId = 'user_id';
  static const _keyFullName = 'full_name';
  static const _keyRole = 'role';
  static const _keyPhone = 'phone';
  static const _keyDesignation = 'designation';
  static const _keyDistrict = 'district';

  // Token operations
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _prefs.setString(_keyAccessToken, accessToken);
    await _prefs.setString(_keyRefreshToken, refreshToken);
  }

  Future<void> saveUserProfile({
    required String userId,
    required String fullName,
    required String role,
    required String phone,
    String designation = '',
    String district = '',
  }) async {
    await _prefs.setString(_keyUserId, userId);
    await _prefs.setString(_keyFullName, fullName);
    await _prefs.setString(_keyRole, role);
    await _prefs.setString(_keyPhone, phone);
    await _prefs.setString(_keyDesignation, designation);
    await _prefs.setString(_keyDistrict, district);
  }

  Future<void> clearAll() async {
    await _prefs.clear();
  }

  // Sync getters
  String? get accessToken => _prefs.getString(_keyAccessToken);
  String? get refreshToken => _prefs.getString(_keyRefreshToken);
  String? get userId => _prefs.getString(_keyUserId);
  String? get fullName => _prefs.getString(_keyFullName);
  String? get role => _prefs.getString(_keyRole);
  String? get phone => _prefs.getString(_keyPhone);
  String? get designation => _prefs.getString(_keyDesignation);
  String? get district => _prefs.getString(_keyDistrict);

  bool get hasTokens => accessToken != null && refreshToken != null;
}
