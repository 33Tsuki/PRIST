import 'dart:convert';

import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:http/http.dart' as http;

import 'token_storage.dart';

class ApiClient {
  static ApiClient? _instance;
  late final TokenStorage _tokenStorage;

  ApiClient._(this._tokenStorage);

  static Future<ApiClient> getInstance() async {
    if (_instance != null) return _instance!;
    final tokenStorage = await TokenStorage.getInstance();
    _instance = ApiClient._(tokenStorage);
    return _instance!;
  }

  String get _baseUrl => dotenv.env['API_BASE_URL'] ?? 'http://10.0.2.2:8000';

  Map<String, String> _headers({bool withAuth = true}) {
    final headers = <String, String>{
      'Content-Type': 'application/json',
    };
    if (withAuth && _tokenStorage.accessToken != null) {
      headers['Authorization'] = 'Bearer ${_tokenStorage.accessToken}';
    }
    return headers;
  }

  Future<http.Response> get(
    String path, {
    bool withAuth = true,
    bool tryRefresh = false,
  }) async {
    final response = await http.get(
      Uri.parse('$_baseUrl$path'),
      headers: _headers(withAuth: withAuth),
    );

    if (response.statusCode == 401 && withAuth && tryRefresh) {
      final refreshed = await _tryRefresh();
      if (refreshed) {
        return http.get(
          Uri.parse('$_baseUrl$path'),
          headers: _headers(),
        );
      }
    }

    return response;
  }

  Future<http.Response> post(
    String path, {
    Map<String, dynamic>? body,
    bool withAuth = true,
    bool tryRefresh = false,
  }) async {
    final response = await http.post(
      Uri.parse('$_baseUrl$path'),
      headers: _headers(withAuth: withAuth),
      body: body != null ? json.encode(body) : null,
    );

    if (response.statusCode == 401 && withAuth && tryRefresh) {
      final refreshed = await _tryRefresh();
      if (refreshed) {
        return http.post(
          Uri.parse('$_baseUrl$path'),
          headers: _headers(),
          body: body != null ? json.encode(body) : null,
        );
      }
    }

    return response;
  }

  Future<bool> _tryRefresh() async {
    final refreshToken = _tokenStorage.refreshToken;
    if (refreshToken == null) return false;

    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/auth/refresh'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'refresh_token': refreshToken}),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        await _tokenStorage.saveTokens(
          accessToken: data['access_token'],
          refreshToken: data['refresh_token'] ?? refreshToken,
        );
        return true;
      }
    } catch (_) {}

    return false;
  }
}
