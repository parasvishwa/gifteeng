import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_client.dart';

class AuthRepository {
  AuthRepository(this._dio, this._storage);

  final Dio _dio;
  final FlutterSecureStorage _storage;

  Future<void> requestOtp(String phone) async {
    await _dio.post('/auth/b2c/otp/request', data: {'phone': phone});
  }

  Future<void> verifyOtp(String phone, String code) async {
    final res = await _dio.post(
      '/auth/b2c/otp/verify',
      data: {'phone': phone, 'code': code},
    );
    final token = res.data is Map ? res.data['accessToken'] as String? : null;
    if (token == null) {
      throw Exception('Missing accessToken in response');
    }
    await _storage.write(key: kTokenKey, value: token);
  }

  Future<void> logout() => _storage.delete(key: kTokenKey);

  Future<String?> currentToken() => _storage.read(key: kTokenKey);
}

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    ref.watch(apiClientProvider),
    ref.watch(secureStorageProvider),
  );
});
