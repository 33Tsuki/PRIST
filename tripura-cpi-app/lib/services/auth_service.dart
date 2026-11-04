import 'dart:convert';

import '../data/app_data.dart';
import 'api_client.dart';
import 'price_record_dao.dart';
import 'token_storage.dart';

class DistrictOption {
  final int id;
  final String name;
  final String code;

  DistrictOption({required this.id, required this.name, required this.code});

  factory DistrictOption.fromJson(Map<String, dynamic> json) {
    return DistrictOption(
      id: (json['district_id'] as num).toInt(),
      name: json['name']?.toString() ?? '',
      code: json['code']?.toString() ?? '',
    );
  }

  String get label => '$name ($code)';
}

class SurveyorOption {
  final int userId;
  final String username;
  final String fullName;

  SurveyorOption({
    required this.userId,
    required this.username,
    required this.fullName,
  });

  factory SurveyorOption.fromJson(Map<String, dynamic> json) {
    return SurveyorOption(
      userId: (json['user_id'] as num).toInt(),
      username: json['username']?.toString() ?? '',
      fullName: json['full_name']?.toString() ?? '',
    );
  }

  String get label => '$username — $fullName';
}

class AuthService {
  static AuthService? _instance;
  late final ApiClient _apiClient;
  late final TokenStorage _tokenStorage;

  AuthService._(this._apiClient, this._tokenStorage);

  static Future<AuthService> getInstance() async {
    if (_instance != null) return _instance!;
    final apiClient = await ApiClient.getInstance();
    final tokenStorage = await TokenStorage.getInstance();
    _instance = AuthService._(apiClient, tokenStorage);
    return _instance!;
  }

  /// Fetch all districts (public endpoint, no auth required).
  Future<List<DistrictOption>> listDistricts() async {
    final response = await _apiClient.get(
      '/master-data/districts',
      withAuth: false,
    );

    if (response.statusCode != 200) {
      throw AuthException(
        'Failed to load districts (${response.statusCode})',
        response.statusCode,
      );
    }

    final data = json.decode(response.body) as List;
    return data
        .map((d) => DistrictOption.fromJson(d as Map<String, dynamic>))
        .toList();
  }

  /// Fetch active surveyors with a set password for the given district.
  Future<List<SurveyorOption>> listSurveyors(int districtId) async {
    final response = await _apiClient.get(
      '/auth/surveyors/public?district_id=$districtId',
      withAuth: false,
    );

    if (response.statusCode != 200) {
      throw AuthException(
        'Failed to load surveyors (${response.statusCode})',
        response.statusCode,
      );
    }

    final data = json.decode(response.body) as List;
    return data
        .map((s) => SurveyorOption.fromJson(s as Map<String, dynamic>))
        .toList();
  }

  /// Log in with username + password.
  /// On success, stores tokens and updates AppData.surveyor.
  Future<void> login({
    required String username,
    required String password,
  }) async {
    final response = await _apiClient.post(
      '/auth/surveyor/login',
      body: {'username': username, 'password': password},
      withAuth: false,
    );

    final data = json.decode(response.body);

    if (response.statusCode != 200) {
      throw AuthException(
        data['detail'] ?? data['message'] ?? 'Login failed',
        response.statusCode,
      );
    }

    await _tokenStorage.saveTokens(
      accessToken: data['access_token'],
      refreshToken: data['refresh_token'],
    );

    final userId = (data['user_id'] ?? '').toString();
    final fullName = data['full_name']?.toString() ?? '';
    final phone = data['phone']?.toString() ?? '';
    final district = data['district_name']?.toString() ?? '';

    await _tokenStorage.saveUserProfile(
      userId: userId,
      fullName: fullName,
      role: data['role']?.toString() ?? 'PRICE_COLLECTOR',
      phone: phone,
      district: district,
    );

    AppData.surveyor = Surveyor(
      id: userId,
      name: fullName,
      designation: '',
      district: district,
      phone: phone,
    );
  }

  /// Change the logged-in surveyor's password.
  /// Throws [AuthException] on failure (403 = wrong current password).
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final response = await _apiClient.post(
      '/auth/me/password',
      body: {
        'current_password': currentPassword,
        'new_password': newPassword,
      },
      tryRefresh: true,
    );

    if (response.statusCode != 200) {
      String message = 'Failed to update password';
      try {
        final data = json.decode(response.body);
        message = data['detail'] ?? data['message'] ?? message;
      } catch (_) {}
      throw AuthException(message, response.statusCode);
    }
  }

  /// Check if there's a valid session (offline-safe).
  /// Restores the surveyor from stored profile without any network call.
  Future<bool> checkSession() async {
    if (!_tokenStorage.hasTokens || _tokenStorage.userId == null) return false;

    AppData.surveyor = Surveyor(
      id: _tokenStorage.userId!,
      name: _tokenStorage.fullName ?? '',
      designation: _tokenStorage.designation ?? '',
      district: _tokenStorage.district ?? '',
      phone: _tokenStorage.phone ?? '',
    );
    return true;
  }

  /// Logout: call backend, clear local state.
  Future<void> logout() async {
    try {
      await _apiClient.post('/auth/logout');
    } catch (_) {}

    await _tokenStorage.clearAll();
    final dao = await PriceRecordDao.getInstance();
    await dao.deleteAllRecords();
    AppData.clearSession();
  }
}

class AuthException implements Exception {
  final String message;
  final int statusCode;

  AuthException(this.message, this.statusCode);

  @override
  String toString() => message;
}
