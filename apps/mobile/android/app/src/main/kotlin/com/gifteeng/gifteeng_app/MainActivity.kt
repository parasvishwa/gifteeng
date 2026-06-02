package com.gifteeng.gifteeng_app

// IMPORTANT: must be FlutterFragmentActivity (NOT FlutterActivity) because
// the `local_auth` plugin uses BiometricPrompt, which requires a host that
// extends FragmentActivity. With the previous FlutterActivity, every call
// to `LocalAuthentication.authenticate(...)` returned false silently — the
// OS biometric sheet never even rendered. See:
//   https://pub.dev/packages/local_auth#android-integration
import io.flutter.embedding.android.FlutterFragmentActivity

class MainActivity : FlutterFragmentActivity()
