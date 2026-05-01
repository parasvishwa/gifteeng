# Gifteeng

Personalised gifting platform — Next.js b2c + b2b admin, NestJS API, Prisma/Postgres,
Flutter mobile app. Hosted on a single Contabo VPS with nginx + Redis + pgbouncer.

## Quick start (new machine setup)

### 1. Prerequisites

| Tool | Why | Install |
|---|---|---|
| Node.js 20+ | Runs Next.js + Nest | https://nodejs.org |
| pnpm 10+ | Workspace package manager | `npm install -g pnpm` |
| PostgreSQL 16 *(optional locally)* | Local dev DB | https://www.postgresql.org |
| Flutter 3.4+ *(mobile only)* | Builds the app | https://docs.flutter.dev/get-started/install |
| Android Studio + JDK 17+ *(APK builds)* | For signed release APK | https://developer.android.com/studio |
| Git + SSH client | Standard | comes with Linux/Mac; Windows: install Git for Windows |

### 2. Clone the repo

```bash
git clone <YOUR_REPO_URL> gifteeng
cd gifteeng
pnpm install
```

### 3. Bring over the secrets (out-of-band, NEVER via git/email/chat)

These three files are the entire production identity. Put them all in your
password manager so they're never lost:

| File | Source | What it does |
|---|---|---|
| `.env` | `pnpm sync:env` (pulls from VPS) — or copy from 1Password | Razorpay/JWT/MSG91/OpenAI/Anthropic keys |
| `apps/mobile/android/app/upload-keystore.jks` | Password-manager attachment | Signs Android release builds. **Lose it = can never update the same Play Store app again.** |
| `apps/mobile/android/key.properties` | Password-manager note | Keystore credentials |

For local dev without VPS access, copy `.env.example` → `.env` and fill in
`CHANGEME` placeholders with development values. Generate JWT secrets with
`openssl rand -hex 32`.

### 4. Generate the Prisma client

```bash
pnpm db:generate
```

### 5. Run

```bash
pnpm dev               # everything (api + web)
pnpm dev:api           # just the Nest API on :4000
pnpm dev:web           # just the Next.js web on :3000
pnpm dev:mobile        # Flutter app on connected device / emulator
```

## Deploy

The deploy pipeline lives in `scripts/deploy.sh`. It handles the
tarball + scp + ssh + remote build + health-check loop.

```bash
# Deploy specific files under a session name
pnpm deploy <session_name> apps/api/src/x.ts apps/web/y.ts

# Deploy everything that changed since the last deploy-* git tag
pnpm deploy:changed <session_name>
```

A matching `deploy/deploy-<session_name>.sh` is auto-generated if you
don't write one — it `tar xzf`'s the patch, runs `prisma migrate deploy`
if migrations changed, builds api+web, restarts the systemd services,
health-checks, prints `DEPLOY_OK`.

When you need a custom deploy step (e.g. nginx reload, env-var bump,
pgbouncer restart), write `deploy/deploy-<name>.sh` by hand and the
runner will use yours instead of the default.

After every successful deploy, tag the commit:

```bash
git tag deploy-<session_name>
git push --tags
```

This makes `pnpm deploy:changed` smart for the next deploy.

## Useful one-liners

```bash
pnpm vps:logs          # tail journalctl on the VPS
pnpm vps:health        # ping /api/health
pnpm vps:psql          # interactive psql shell against prod DB
pnpm vps:redis         # interactive redis-cli
pnpm vps:k6            # quick k6 smoke against API
pnpm vps:backup        # trigger an extra backup right now
```

## Project layout

```
apps/
  api/          NestJS API (TypeScript, Prisma)
  web/          Next.js 15 b2c + b2b admin
  mobile/       Flutter app (Riverpod, go_router)
packages/
  db/           Prisma schema + generated client
  shared/       Zod schemas + types shared between api/web/mobile
  ui/           shadcn-style React components used by web
deploy/         Per-session deploy scripts (generated)
docs/           Architectural notes
  SENTRY-SETUP.md       — wire Sentry by setting env vars
  DPDP-COMPLIANCE.md    — data-protection rights implementation
  KEYSTORE-README.md    — Android keystore custody + backup
loadtest/       k6 baseline + quick smoke
scripts/
  deploy.sh         core deploy runner
  deploy-changed.sh git-diff-driven deploy
  sync-env.sh       pull .env from VPS
```

## Production infrastructure

- **VPS**: 217.216.59.87 (Contabo, Ubuntu, 6 vCPU / 11 GiB RAM)
- **API**: `gifteeng-api` systemd service, 4-worker Node cluster
- **Web**: `gifteeng-web` systemd service (`next start`)
- **Postgres** 16 + **pgbouncer** (transaction pooling, port 6432)
- **Redis** (256 MB cap, allkeys-lru) — cache + SSE pub/sub
- **nginx** reverse proxy + TLS
- **Daily encrypted backups** via `/etc/cron.daily/gifteeng-pg-backup`
  (passphrase in `/root/.gifteeng-backup-passphrase` — back this up!)
- **Firewall**: UFW, only 22/80/443 exposed
- **Cluster cron leader**: AI targeting + cart-abandonment + DPDP
  deletion sweep + export expiry

## What's NOT in git (and why)

- `.env` — has live secrets
- `apps/mobile/android/app/upload-keystore.jks` + `key.properties` —
  Play Store identity. See `apps/mobile/android/KEYSTORE-README.md`.
- `node_modules`, `.next`, `dist`, `apps/mobile/build/` — regenerate
  via `pnpm install` + builds.
- `patch_*.tar.gz` — deploy artefacts.

Each new contributor needs the secrets transferred manually (encrypted
USB / 1Password attachment) — never via chat / email / git.

## Where things are documented

- `docs/SENTRY-SETUP.md` — turn on error monitoring
- `docs/DPDP-COMPLIANCE.md` — privacy rights / consent / erasure
- `apps/mobile/android/KEYSTORE-README.md` — Android signing key custody
- `loadtest/README.md` — how to run the k6 baseline
- `deploy/*.sh` — every shipped deploy is preserved here as
  the per-session script that ran in production. Best changelog
  the project has.
