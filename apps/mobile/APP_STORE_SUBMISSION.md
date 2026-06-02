# App Store + Play Store Submission Guide — Gifteeng

This is the single source of truth for everything you need to launch the
Gifteeng Flutter app on both stores. Work through it in order.

**Brand:** Gifteeng (Imazyn Ecommerce Pvt Ltd)
**Backend:** `https://www.gifteeng.com/api`
**Mobile codebase:** `apps/mobile/` (Flutter)

---

## 1. Pre-flight checklist (one-time)

### 1.1 External accounts

| Item | Status | Action |
|---|---|---|
| D-U-N-S number | ⏳ pending (40 days) | Required for Apple Developer org account |
| Apple Developer Program | ⏳ blocked on D-U-N-S | $99/yr, sign up after D-U-N-S issued |
| Google Play Console | ☐ | $25 one-time, sign up any time |
| Firebase project | ☐ | Free, needed for FCM push |
| Mac with Xcode 15+ | ☐ | Required for iOS build (or Codemagic / EAS) |

### 1.2 Bundle ID — **align both platforms**

Currently the project has different bundle IDs on each platform:

| Platform | Current value | Issue |
|---|---|---|
| Android | `com.gifteeng.gifteeng_app` | snake_case is non-standard |
| iOS | `com.gifteeng.gifteengApp` | camelCase, doesn't match Android |

**Recommendation:** unify to `com.gifteeng.app`. Steps:

**Android** — `apps/mobile/android/app/build.gradle.kts`:
```kotlin
namespace = "com.gifteeng.app"
applicationId = "com.gifteeng.app"
```
Also rename the Kotlin source folder:
```bash
mv android/app/src/main/kotlin/com/gifteeng/gifteeng_app android/app/src/main/kotlin/com/gifteeng/app
```
Update `MainActivity.kt`'s `package` line.

**iOS** — Xcode → Runner target → Signing & Capabilities → Bundle Identifier
= `com.gifteeng.app`. Update `RunnerTests` target the same way.

⚠️ **Bundle ID is permanent on the App Store.** Lock this in *before* the
first TestFlight build.

---

## 2. Apple App Store

### 2.1 Required artifacts

| Asset | Spec | Status |
|---|---|---|
| App icon | 1024×1024 PNG, no alpha, no rounded corners | ✅ `assets/icon/icon.png` exists |
| Screenshots — 6.7" | 1290×2796 (iPhone 15 Pro Max), 3-10 images | ☐ |
| Screenshots — 6.5" | 1242×2688 (iPhone 11 Pro Max), 3-10 images | ☐ |
| Screenshots — 5.5" | 1242×2208 (iPhone 8 Plus), 3-10 images | ☐ |
| Screenshots — iPad 12.9" | 2048×2732 (only if iPad supported) | optional |
| App preview video | 15-30s, .mov / .m4v / .mp4, per-size | optional, +30% conversion |
| Privacy Manifest | `ios/Runner/PrivacyInfo.xcprivacy` | ✅ written |
| Privacy Policy URL | `https://www.gifteeng.com/privacy` | ✅ live |
| Account Deletion URL | `https://www.gifteeng.com/account-deletion` | ✅ live |
| Terms URL | `https://www.gifteeng.com/terms` | ✅ live |
| Support URL | `https://www.gifteeng.com/contact` | ✅ live |
| Marketing URL | `https://www.gifteeng.com` | ✅ live |

### 2.2 Listing copy

**App name:** `Gifteeng`

**Subtitle (30 chars):**
`Personalised gifts. Made with love.`

**Promotional text (170 chars, can update without resubmit):**
`India's smartest personalised gifting app. Photo gifts, custom mugs, return gifts, and corporate orders — all delivered with love. Free shipping on first order.`

**Description (4000 chars):**
```
Make every gift feel like you made it yourself.

Gifteeng is India's home for personalised, handcrafted gifts — photo frames, customised mugs, magnets, name tags, return gifts, and corporate hampers. Every product is made-to-order, quality-checked, and delivered across India.

WHAT YOU CAN DO

• Customise any product — upload a photo, add a name, write a message, pick a layout. Most products are personalised in under a minute.
• AI-driven gift ideas — tell us the occasion and the person, and Gifteeng suggests the most thoughtful options.
• Earn Goins on every purchase — our loyalty rewards you can spin, win, and redeem for discounts.
• Bulk corporate orders — special pricing on 50+ pieces for return gifts, weddings, and corporate events.
• Track every step — order updates, dispatch alerts, and live delivery tracking via push.

WHY GIFTEENG

• 1 lakh+ happy customers
• 4.9★ average rating
• 500+ unique gift designs
• Starting at ₹99
• Free delivery on first order
• 7-day returns

PERFECT FOR

• Birthdays, anniversaries, weddings, baby showers
• Valentine's Day, Mother's Day, Father's Day, Diwali, Raksha Bandhan
• Return gifts (events, weddings, corporate)
• Friendship Day, teacher's day, retirement
• Just-because surprises

PERSONALISATION DONE RIGHT

Every photo, every name, every line of text is checked manually before printing. We use the highest-quality printing and durable materials so your gift looks beautiful for years.

PAY HOW YOU LIKE

UPI, debit cards, credit cards, net banking, COD — all secured by Razorpay. Earn Goins back on every order to redeem on your next gift.

DELIVERED ACROSS INDIA

Pan-India delivery via Delhivery, Bluedart, and Shiprocket. Most orders dispatch within 24-48 hours.

PRIVACY & DATA CONTROL

Your data, your rules. Tap into Privacy & Data Controls under Account to:
• See exactly what we collect and why
• Toggle consent per category (analytics, marketing, AI personalisation)
• Download a JSON of everything we hold about you
• Delete your account at any time (30-day grace window)

Read the full privacy policy: gifteeng.com/privacy

Operated by Imazyn Ecommerce Pvt Ltd, Mumbai.
Need help? Email support@gifteeng.com or WhatsApp +91 80700 11777.
```

**Keywords (100 chars total, comma-separated):**
`personalised gifts,custom mug,photo frame,return gift,wedding gift,corporate gift,bulk gift,goins`

**What's New (release notes for v1.0):**
`First release! Personalise any gift in seconds, earn Goins on every order, and get free shipping on your first purchase.`

**Category:**
- Primary: `Shopping`
- Secondary: `Lifestyle`

**Age rating:** 4+ (no objectionable content)

**Demo account for review:**
- Phone: `+919999999999`
- OTP: `000000`
- (These are configured via `TEST_PHONE` / `TEST_OTP` env vars on the API in non-prod, but Apple reviews against prod — set up a real test account before submitting.)

### 2.3 App Privacy form (App Store Connect)

Mirrors the `PrivacyInfo.xcprivacy` you ship in the app. Declare:

- **Contact Info:** Name, Email, Phone (linked to user, not used for tracking)
- **Identifiers:** User ID (linked, not tracking)
- **Purchases:** Purchase history (linked, app functionality + analytics)
- **User Content:** Photos/videos, customer support, other user content (linked)
- **Usage Data:** Product interaction (linked, analytics + app functionality)
- **Diagnostics:** Crash data, performance data (NOT linked, app functionality)
- **Sensitive Info:** None
- **Health & Fitness:** None
- **Financial Info:** None (Razorpay handles payment data, you don't see it)

Tracking: **No** (you don't link any Apple-defined tracking SDK).

### 2.4 iOS gotchas to avoid rejection

1. **Sign in with Apple** — required *only* if you offer Google/Facebook
   social login. The app currently uses phone OTP only, so SIWA is not
   required yet. The backend endpoint (`POST /api/auth/b2c/apple/verify`)
   is wired and ready if you add it later.
2. **Razorpay for physical goods** — fine. Don't sell digital goods or
   "buy 100 Goins for ₹50" through the app, that triggers Apple IAP rules.
   Goins as loyalty (earned, not bought) is fine.
3. **App Tracking Transparency** — only required if you load Meta Pixel /
   Google Ads / similar tracking SDKs natively. The current app has none,
   so no ATT prompt needed.
4. **Web wrapper rejection** — N/A. This is a native Flutter app.
5. **Push notifications** — request permission *contextually* (e.g. after
   first order placed), not on app launch.

---

## 3. Google Play Store

### 3.1 Required artifacts

| Asset | Spec | Status |
|---|---|---|
| App icon | 512×512 PNG | ✅ generated by `flutter_launcher_icons` |
| Feature graphic | 1024×500 PNG/JPG | ☐ |
| Phone screenshots | 16:9 or 9:16, 320-3840px, 2-8 images | ☐ |
| 7" tablet screenshots | optional | ☐ |
| 10" tablet screenshots | optional | ☐ |
| Promo video | YouTube URL, optional | ☐ |
| Signed AAB | `flutter build appbundle --release` | ✅ keystore in place |

### 3.2 Listing copy

**App title (30 chars):** `Gifteeng — Personalised Gifts`

**Short description (80 chars):**
`Personalised gifts, custom mugs, photo frames & return gifts — delivered free.`

**Full description (4000 chars):** *Same as App Store — Play accepts identical copy.*

**Category:** Shopping
**Tags:** Shopping · Lifestyle · Personalisation

**Content rating:** Use the IARC questionnaire — should land at **Everyone**.

### 3.3 Data Safety form (Play Console)

Declare what's collected and shared:

| Data type | Collected | Shared | Optional | Why |
|---|---|---|---|---|
| Name | ✓ | ✗ | ✓ | App functionality |
| Email | ✓ | ✗ | ✓ | App functionality, account |
| Phone number | ✓ | ✗ | ✗ | Account, OTP login |
| Address | ✓ | Logistics partners | ✗ | Order delivery |
| Purchase history | ✓ | ✗ | ✗ | App functionality, analytics |
| Photos | ✓ | ✗ | ✓ | Product customisation |
| User-generated content | ✓ | ✗ | ✓ | Reviews |
| Crash logs | ✓ | Sentry | ✓ | Diagnostics |
| Diagnostics | ✓ | Sentry | ✓ | Diagnostics |
| Product interactions | ✓ | ✗ | ✓ | Analytics |
| Device or other IDs | ✓ | Firebase | ✗ | Push notifications |

Encrypted in transit: **Yes** (HTTPS).
Account deletion supported: **Yes** — link to `https://www.gifteeng.com/account-deletion`.

### 3.4 Play gotchas

1. **Target SDK 34** required for new submissions (Flutter handles this).
2. **Submit as App Bundle (.aab)**, not APK. `flutter build appbundle --release`.
3. **Internal testing first** — fastest review path for early bugs.
4. **First production rollout**: start at 10-20%, ramp up over a week.

---

## 4. Firebase / Push Notifications setup

The Flutter app already has `firebase_core` + `firebase_messaging` wired.
You just need to plug in credentials.

### 4.1 Firebase Console steps

1. Create project at `console.firebase.google.com` → name it `Gifteeng`.
2. Add Android app with package `com.gifteeng.app` → download
   `google-services.json` → drop in `apps/mobile/android/app/`.
3. Add iOS app with bundle ID `com.gifteeng.app` → download
   `GoogleService-Info.plist` → drop in `apps/mobile/ios/Runner/` via
   Xcode (so the project file picks it up).

### 4.2 APNs key (for iOS push delivery)

1. Apple Developer Portal → Keys → `+` → check **Apple Push Notifications
   Service** → download the `.p8` (you can only download once — store safely).
2. Firebase Console → Project Settings → Cloud Messaging → iOS app
   configuration → upload the `.p8` + Team ID + Key ID.

After this step, FCM forwards iOS pushes through APNs automatically.

### 4.3 Verify

```dart
// apps/mobile/lib/core/notifications/push_service.dart already calls
//   FirebaseMessaging.instance.getToken()
// and POSTs the token to /me/device-tokens. Once google-services.json /
// GoogleService-Info.plist are in place, getToken() returns a real token
// and pushes from the server start landing.
```

---

## 5. What I (Claude) have done in this prep

✅ **Backend (deployed to prod, May 2026):**
- Privacy policy refreshed with mobile-app section (camera, push, ATT, IAP)
- New public `https://www.gifteeng.com/account-deletion` page
- `POST /api/auth/b2c/apple/verify` endpoint (ready when SIWA is needed)
- `Customer.appleId` column added

✅ **Mobile repo (this PR, not yet built/run):**
- `lib/features/account/presentation/screens/privacy_screen.dart` — full
  consent + deletion + export-link screen
- Route `/privacy` registered in `app_router.dart`
- "Privacy & Data" menu item added to account screen
- `ios/Runner/PrivacyInfo.xcprivacy` — Apple privacy manifest
- This document

⏳ **Still needed from you / blocked externally:**
- D-U-N-S issued (40 days)
- Apple Developer + Play Console accounts created
- Firebase project created + credential files dropped in
- Bundle ID alignment (one-time decision: `com.gifteeng.app`)
- App icon final, screenshots, feature graphic (designer)
- Mac access for `pod install` + first iOS build

---

## 6. Pre-submission test pass

Before you click "Submit for Review" on either store:

- [ ] Login with phone OTP works on a real Android device
- [ ] Login works on a real iPhone via TestFlight build
- [ ] Customise → Add to cart → Checkout → COD works end-to-end
- [ ] Razorpay UPI flow succeeds on real device
- [ ] Push notification arrives after FCM credentials wired
- [ ] Account → Privacy & Data → all three sections work:
  - [ ] Toggle a consent off/on, refresh, value persists
  - [ ] "Open data export" launches the browser to gifteeng.com
  - [ ] "Schedule deletion" sets the future date, then "Cancel deletion"
        clears it
- [ ] Sentry captures a synthetic crash (test build with intentional
      `throw Exception('test')` button)
- [ ] App icon shows correctly on home screen
- [ ] App name shows as `Gifteeng` (not `gifteeng_app`)
- [ ] Splash screen shows brand colour (#EF3752)
- [ ] No runtime errors on Android API 34
- [ ] No runtime errors on iOS 17

---

## 7. Submission day

**Order of operations (assuming both stores submitted same week):**

**Tuesday morning (10 AM IST recommended):**

1. Build signed Android AAB:
   ```bash
   cd apps/mobile
   flutter build appbundle --release
   ```
2. Upload to Play Console → Internal testing → promote to Closed Testing →
   then to Production. Google reviews are typically faster.

3. Build iOS archive (on Mac):
   ```bash
   cd apps/mobile
   flutter build ipa --release
   open build/ios/archive/Runner.xcarchive
   ```
   Xcode → Distribute App → App Store Connect → Upload.

4. App Store Connect → fill all metadata + screenshots + privacy form →
   Submit for Review.

5. Apple typical turnaround: 24-48 hours. Plan for 1-2 rejection cycles.

**During review:**

- Don't change the build. Don't switch metadata mid-review.
- Have the demo account credentials ready in App Store Connect
  → "App Review Information".
- Add a note: *"Phone OTP login: use +919999999999 / OTP 000000 for testing.
  All other features available without account."*

---

## 8. Post-launch (week 1)

- Monitor Sentry crash dashboard daily.
- Watch Play Console pre-launch report for ANRs.
- Track install→signup→first-purchase conversion in your analytics.
- First 7 days = highest crash density. Be ready to push a 1.0.1 fast.
- If any user reports an account-deletion bug, treat it as P0 — both stores
  audit account-deletion paths post-launch.

---

## 9. Common rejection reasons (sorted by likelihood)

| Reason | Mitigation |
|---|---|
| Demo account doesn't work for reviewer | Test it 30 min before submitting; verify against prod |
| Crash on first launch on a fresh device | Test on a freshly-restored simulator/device |
| Privacy declarations don't match `PrivacyInfo.xcprivacy` | Keep the App Store Connect form in sync with the manifest |
| "Insufficient differentiation from web" (Apple) | Showcase native features in screenshots: push, customiser, biometric |
| "Account deletion path unclear" | Privacy & Data screen is now in place; reviewer will find it |
| "Razorpay branding visible during checkout" | Required disclosure — fine, leave it |
| "Outdated SDK" warning | Run `flutter pub upgrade` before each annual review |

---

## 10. After launch — keep this doc updated

When you ship a new version:

1. Bump `version: 1.0.0+4017` → `1.0.1+4018` in `pubspec.yaml`.
2. Update "What's New" copy in this doc + paste into both stores.
3. If you add a new SDK or new data type → update the Privacy Manifest
   AND the App Store Privacy form AND the Play Data Safety form.
4. If you add Google login → wire Sign in with Apple (the backend
   endpoint is already there) and re-submit.

---

*Last updated: May 2026 — kept in repo at `apps/mobile/APP_STORE_SUBMISSION.md`*
