# Gifteeng Android signing keystore

## What this is

`android/app/upload-keystore.jks` (gitignored) is the **production
release signing key** for the Gifteeng Android app. Every APK shipped
to a customer or uploaded to the Play Store must be signed with this
key. Debug-signed APKs trigger Google Play Protect's "App blocked to
protect your device" warning on every fresh install — that's the
exact bug we just fixed.

## Credentials

Stored in `android/key.properties` (also gitignored):

```
storePassword=gifteeng2026
keyPassword=gifteeng2026
keyAlias=upload
storeFile=upload-keystore.jks
```

The keystore certificate fingerprint:

```
keytool -list -v -keystore android/app/upload-keystore.jks -storepass gifteeng2026
```

Run the command above to print the SHA-1 / SHA-256 fingerprints. Save
these in your password manager — you'll need them when you set up
Firebase, Razorpay live keys, or Google Sign-In.

## CRITICAL — back this up NOW

Losing this keystore means **you can never push an update to the same
app on Play Store again** — Google requires the same signing key for
every update of a given application ID. Users would have to uninstall
the old app and install a new one with a different package name.

Do all of these:

1. **Copy the file off the dev machine** to at least 2 other places
   (encrypted USB, password manager attachment, encrypted cloud drive).
2. **Store the password in a password manager**. Don't memorise; you
   _will_ forget.
3. **Don't commit the .jks or key.properties to git**. Both are listed
   in `apps/mobile/.gitignore`.

## How signing is wired

`apps/mobile/android/app/build.gradle.kts` reads `key.properties` at
build time. If present, the release build is signed with the upload
key. If absent, it falls back to the debug key (so other developers
who don't have the production keystore can still run
`flutter run --release` locally without errors).

## Building a signed APK

```bash
cd apps/mobile
flutter build apk --release
# → build/app/outputs/flutter-apk/app-release.apk  (signed with upload key)
```

Verify the signature:

```bash
apksigner verify --print-certs build/app/outputs/flutter-apk/app-release.apk | head -5
```

You should see `CN=Gifteeng, OU=Mobile, O=Gifteeng, …` not the default
debug-signing identity.

## Play Store upload

Once you create a Play Console account and upload the first release,
**enrol in Play App Signing**. Google will hold the key Google uses
to sign APKs delivered to users; you keep the upload key (this one)
and re-sign new uploads with it. This is the modern best practice and
it's what App Bundle (.aab) builds expect.

## Rotating the key (if compromised)

If the upload key ever leaks:
1. Generate a new key with `keytool -genkeypair …` (different alias).
2. Open a Play Console support ticket — you can change the upload key
   on Play App Signing. They'll guide you through certificate
   rotation; existing users continue to get updates.
