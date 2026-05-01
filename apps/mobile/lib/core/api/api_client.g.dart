// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'api_client.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

String _$secureStorageHash() => r'd236803f715ed93447aac62dad02fd72721571b1';

/// See also [secureStorage].
@ProviderFor(secureStorage)
final secureStorageProvider =
    AutoDisposeProvider<FlutterSecureStorage>.internal(
  secureStorage,
  name: r'secureStorageProvider',
  debugGetCreateSourceHash: const bool.fromEnvironment('dart.vm.product')
      ? null
      : _$secureStorageHash,
  dependencies: null,
  allTransitiveDependencies: null,
);

@Deprecated('Will be removed in 3.0. Use Ref instead')
// ignore: unused_element
typedef SecureStorageRef = AutoDisposeProviderRef<FlutterSecureStorage>;
String _$dioHash() => r'65d093d571e84b453c3987045ae8981ad5a91573';

/// See also [dio].
@ProviderFor(dio)
final dioProvider = AutoDisposeProvider<Dio>.internal(
  dio,
  name: r'dioProvider',
  debugGetCreateSourceHash:
      const bool.fromEnvironment('dart.vm.product') ? null : _$dioHash,
  dependencies: null,
  allTransitiveDependencies: null,
);

@Deprecated('Will be removed in 3.0. Use Ref instead')
// ignore: unused_element
typedef DioRef = AutoDisposeProviderRef<Dio>;
String _$authTokenNotifierHash() => r'1c3e63f717e2ec36f27a77bbdf8d25a68db6d197';

/// See also [AuthTokenNotifier].
@ProviderFor(AuthTokenNotifier)
final authTokenNotifierProvider =
    AutoDisposeAsyncNotifierProvider<AuthTokenNotifier, String?>.internal(
  AuthTokenNotifier.new,
  name: r'authTokenNotifierProvider',
  debugGetCreateSourceHash: const bool.fromEnvironment('dart.vm.product')
      ? null
      : _$authTokenNotifierHash,
  dependencies: null,
  allTransitiveDependencies: null,
);

typedef _$AuthTokenNotifier = AutoDisposeAsyncNotifier<String?>;
String _$biometricPrefNotifierHash() =>
    r'acadcaf132e105a55ed243da4fff46c23fecf567';

/// Whether the USER has explicitly turned on biometric sign-in.
///
/// Copied from [BiometricPrefNotifier].
@ProviderFor(BiometricPrefNotifier)
final biometricPrefNotifierProvider =
    AutoDisposeAsyncNotifierProvider<BiometricPrefNotifier, bool>.internal(
  BiometricPrefNotifier.new,
  name: r'biometricPrefNotifierProvider',
  debugGetCreateSourceHash: const bool.fromEnvironment('dart.vm.product')
      ? null
      : _$biometricPrefNotifierHash,
  dependencies: null,
  allTransitiveDependencies: null,
);

typedef _$BiometricPrefNotifier = AutoDisposeAsyncNotifier<bool>;
// ignore_for_file: type=lint
// ignore_for_file: subtype_of_sealed_class, invalid_use_of_internal_member, invalid_use_of_visible_for_testing_member, deprecated_member_use_from_same_package
