# Gifteeng iOS Build — checklist for the Mac developer

The mobile app was developed on Windows, so iOS builds need a one-time macOS
setup pass. This file is the hand-off. After you complete everything below,
`flutter build ios --release` should produce a valid IPA ready for TestFlight.

---

## 1. Prerequisites

On the Mac:

- [ ] **Xcode 15+** installed via the Mac App Store
- [ ] `xcode-select --install` run once
- [ ] **CocoaPods** installed — `sudo gem install cocoapods` (or `brew install cocoapods`)
- [ ] Flutter SDK on PATH — `flutter doctor` should show **no red X's** for the iOS toolchain

---

## 2. First-time install

```bash
cd apps/mobile
flutter pub get
cd ios
pod install --repo-update
cd ..
```

`pod install` reads `ios/Podfile.lock` and pulls every native dependency
(Firebase, Razorpay, image_picker, local_auth, sentry, gallery_saver,
screenshot, url_launcher, share_plus, etc.). First run takes ~5 minutes.

---

## 3. Xcode configuration

Open `ios/Runner.xcworkspace` in Xcode (**not** `Runner.xcodeproj`).

### 3.1 Signing & Capabilities

- [ ] Runner target → **Signing & Capabilities** → set your **Team**
- [ ] Bundle Identifier: `com.gifteeng.app` (or your chosen reverse-DNS)
- [ ] Click `+ Capability` → add **Push Notifications**
- [ ] Click `+ Capability` → add **Background Modes** → check
      "Remote notifications" + "Background fetch"
- [ ] Click `+ Capability` → add **Sign in with Apple** (optional, future)

### 3.2 Firebase (push notifications)

- [ ] Firebase Console → your project → **iOS app** → download
      `GoogleService-Info.plist`
- [ ] Drag the file into Xcode under `Runner/Runner/` (copy if needed)
- [ ] Verify Target Membership ✓ Runner
- [ ] APNs Auth Key: Apple Developer → **Keys** → `+` → check Apple Push
      Notifications Service → upload the `.p8` to Firebase → Project
      Settings → Cloud Messaging → **iOS app configuration**

### 3.3 Razorpay (payments)

- [ ] Razorpay dashboard → **API Keys** → enable iOS
- [ ] No iOS-specific config files needed — the Flutter plugin handles
      init via a runtime call. Make sure the `RAZORPAY_KEY_ID` env var
      (or equivalent dart-define) is set at build time.

### 3.4 App icons & launch screen

Already configured via `flutter_launcher_icons`. If icons look off, run:

```bash
flutter pub run flutter_launcher_icons
```

For a branded launch screen (current one is plain white):
- `ios/Runner/Assets.xcassets/LaunchImage.imageset/` — replace the default
  image with the Gifteeng logo on a dark background (matches the app's
  splash). Use 1x/2x/3x sizes.

---

## 4. Permissions already declared in `Info.plist`

These were added during the Windows-side audit — do not remove:

- `NSPhotoLibraryUsageDescription` — image_picker gallery
- `NSCameraUsageDescription` — image_picker camera
- `NSPhotoLibraryAddUsageDescription` — gallery_saver_plus
- `NSFaceIDUsageDescription` — local_auth
- `UIBackgroundModes` = fetch + remote-notification (FCM delivery)
- `ITSAppUsesNonExemptEncryption` = false (skips TestFlight export prompt)

The App Store **rejects builds missing any of these strings** when the
referenced permission is requested — so keep them.

---

## 5. Build commands

### Debug on a connected iPhone
```bash
flutter run --release   # or --debug
```

### TestFlight / App Store archive
```bash
flutter build ipa --release \
  --dart-define=API_BASE_URL=https://new-api.gifteeng.com/api \
  --dart-define=SENTRY_DSN=<your-dsn> \
  --dart-define=SENTRY_ENV=production
```

The IPA lands at `build/ios/ipa/gifteeng.ipa`. Upload to App Store
Connect via Xcode → Organiser or `xcrun altool --upload-app`.

---

## 6. Known issues to watch for

| Symptom on iOS | Fix |
|---|---|
| `firebase_messaging` pod fails to build | Ensure Podfile `platform :ios, '13.0'` or higher. |
| Razorpay `WKWebView` crash on checkout | Make sure `NSAppTransportSecurity → NSAllowsArbitraryLoads` is `false` and you only whitelist specific Razorpay domains. Already done. |
| `image_picker` silent fail on iPhone | Double-check `NSPhotoLibraryUsageDescription` is present. |
| Push notifications not received | (1) APNs key uploaded to Firebase, (2) Background Modes capability enabled, (3) user granted permission, (4) backend `FIREBASE_SERVICE_ACCOUNT_JSON` env var is set. |
| Face ID prompt shows no reason | `NSFaceIDUsageDescription` present — already done. |
| Blurry launch screen | Replace `LaunchImage.imageset` with a higher-resolution Gifteeng logo. |

---

## 7. What's different from Android

- **Notification icon** — iOS uses the app icon; no separate notification
  icon asset needed (Android has one via `@mipmap/ic_launcher`).
- **App Store review notes** — when submitting, include test credentials
  for a demo customer account so Apple reviewers can place a test order.
- **Razorpay COD** — works on both. UPI / Card tokens do too.
- **Sharing** — `share_plus` uses the native iOS share sheet; no config.
- **Deep links** — future referral URLs (`https://gifteeng.com/r/<CODE>`)
  need Universal Links setup: apple-app-site-association file on the web
  domain + Associated Domains capability in Xcode. Follow-up work.

---

## 8. Release checklist

- [ ] `flutter analyze` passes on the whole repo
- [ ] `flutter test` passes (when test suite exists)
- [ ] Bundle ID matches App Store Connect record
- [ ] Version + build number bumped (`pubspec.yaml` → `version: x.y.z+N`)
- [ ] Screenshots captured for all required device sizes
- [ ] Privacy policy URL live at gifteeng.com/privacy
- [ ] Support URL live at gifteeng.com/support
- [ ] Test a real push notification end-to-end
- [ ] Test Razorpay live mode with a ₹1 test order
- [ ] Validate on iPhone SE (smallest screen) and iPhone 15 Pro Max
