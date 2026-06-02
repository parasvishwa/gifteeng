# Gifteeng — macOS Setup Guide

Continue development on a Mac without losing anything. All code is on GitHub;
only secrets are hand-carried (they are git-ignored on purpose).

## 0. Carry these from the old machine

Unzip `gifteeng-secrets.tar.gz` (created on the Windows box at `E:\Gifteeng\gifteeng-secrets.tar.gz`)
into a folder named `secrets` next to the cloned repo. It contains:

| File | Restores to | Notes |
|------|-------------|-------|
| `root.env` | `./.env` | local dev env |
| `web.env.local` | `./apps/web/.env.local` | |
| `key.properties` | `./apps/mobile/android/key.properties` | |
| `upload-keystore.jks` | `./apps/mobile/android/app/upload-keystore.jks` | **CRITICAL — Play Store signing. Back up forever.** |
| `google-services.json` | `./apps/mobile/android/app/google-services.json` | Firebase |
| `ssh/id_ed25519(.pub)` | `~/.ssh/` | server access to `root@217.216.59.87` |

## 1. Toolchain

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node git
npm install -g pnpm
brew install --cask flutter zulu17 android-studio
xcode-select --install            # enables iOS builds (new capability on Mac)
```

## 2. Clone + install

```bash
git clone https://github.com/parasvishwa/gifteeng.git
cd gifteeng
pnpm install
```

## 3. Restore secrets (with the unzipped `secrets/` folder inside the repo)

```bash
cp secrets/root.env .env
cp secrets/web.env.local apps/web/.env.local
cp secrets/key.properties apps/mobile/android/key.properties
cp secrets/upload-keystore.jks apps/mobile/android/app/upload-keystore.jks
cp secrets/google-services.json apps/mobile/android/app/google-services.json
mkdir -p ~/.ssh && cp secrets/ssh/id_ed25519* ~/.ssh/ && chmod 600 ~/.ssh/id_ed25519
rm -rf secrets        # don't leave secrets in the repo tree
```

## 4. Verify

```bash
flutter doctor
flutter doctor --android-licenses          # accept all
cd apps/mobile && flutter pub get && flutter build appbundle --release
ssh root@217.216.59.87 "echo server-ok"
```

## Project facts

- **Stack**: NestJS 10 (`apps/api`, port 4000) + Next.js 15 (`apps/web`, port 3000), pnpm workspaces, Prisma + PostgreSQL.
- **Mobile**: Flutter (`apps/mobile`), package `com.gifteeng.gifteeng_app`, current version bumped per release in `pubspec.yaml`.
- **Server**: `root@217.216.59.87`, code at `/srv/gifteeng`, systemd units `gifteeng-web` / `gifteeng-api`, env at `/srv/gifteeng/.env`.
- **Domains**: `www.gifteeng.com` (B2C) + `gifteeng.com` (redirects to www), behind Cloudflare (SSL mode: Full). `admin.gifteeng.com` = B2B. API served same-origin at `/api`.
- **Play Store**: app live on Internal Testing track. Build with `flutter build appbundle --release`, upload the `.aab` to a new release.

## Android release build (Mac)

```bash
cd apps/mobile
flutter build appbundle --release
# -> build/app/outputs/bundle/release/app-release.aab  (upload to Play Console)
```

Bump `version:` in `apps/mobile/pubspec.yaml` (e.g. `1.0.3+4020` -> `1.0.4+4021`) before each Play Store upload.
