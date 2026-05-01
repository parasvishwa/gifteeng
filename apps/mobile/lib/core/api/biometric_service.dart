import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'biometric_service.g.dart';

/// Wraps `local_auth` — call `authenticate()` to prompt Face ID / fingerprint.
/// Returns true on success, false on failure/cancel.
@riverpod
BiometricService biometricService(Ref ref) => BiometricService();

class BiometricService {
  final _auth = LocalAuthentication();

  /// Returns true if the device supports biometrics AND has at least one
  /// enrolled method (fingerprint / Face ID / iris).
  Future<bool> get isAvailable async {
    try {
      final canCheck = await _auth.canCheckBiometrics;
      if (!canCheck) return false;
      final types = await _auth.getAvailableBiometrics();
      return types.isNotEmpty;
    } on PlatformException {
      return false;
    }
  }

  /// Returns the best label to show on the biometric button.
  Future<String> get biometricLabel async {
    try {
      final types = await _auth.getAvailableBiometrics();
      if (types.contains(BiometricType.face))        return 'Face ID';
      if (types.contains(BiometricType.fingerprint)) return 'Fingerprint';
      if (types.contains(BiometricType.iris))        return 'Iris scan';
    } on PlatformException {
      // fall through
    }
    return 'Biometrics';
  }

  /// Prompt the user. Returns true on success.
  Future<bool> authenticate({String reason = 'Sign in to Gifteeng'}) async {
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          biometricOnly: true,
          stickyAuth: true,
        ),
      );
    } on PlatformException {
      return false;
    }
  }
}
