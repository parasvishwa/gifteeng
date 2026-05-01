// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'biometric_service.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

String _$biometricServiceHash() => r'51ac852c4c43a4fb54e785cf2c4edb1c487ec173';

/// Wraps `local_auth` — call `authenticate()` to prompt Face ID / fingerprint.
/// Returns true on success, false on failure/cancel.
///
/// Copied from [biometricService].
@ProviderFor(biometricService)
final biometricServiceProvider = AutoDisposeProvider<BiometricService>.internal(
  biometricService,
  name: r'biometricServiceProvider',
  debugGetCreateSourceHash: const bool.fromEnvironment('dart.vm.product')
      ? null
      : _$biometricServiceHash,
  dependencies: null,
  allTransitiveDependencies: null,
);

@Deprecated('Will be removed in 3.0. Use Ref instead')
// ignore: unused_element
typedef BiometricServiceRef = AutoDisposeProviderRef<BiometricService>;
// ignore_for_file: type=lint
// ignore_for_file: subtype_of_sealed_class, invalid_use_of_internal_member, invalid_use_of_visible_for_testing_member, deprecated_member_use_from_same_package
