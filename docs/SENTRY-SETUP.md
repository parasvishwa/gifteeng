# Sentry — error monitoring setup

The SDKs are wired into both apps. Errors will start flowing the moment
you set the DSN env vars and restart. Until then the SDK is silent
(zero overhead — `Sentry.init` is gated on the env flag).

## 1. Get a DSN

1. Sign up at https://sentry.io (free tier is 5k events/month — fine
   for our scale).
2. Create two projects:
   - `gifteeng-api` (platform: Node.js / Express)
   - `gifteeng-web` (platform: Next.js)
3. Copy each project's DSN. They look like
   `https://abc123@o12345.ingest.us.sentry.io/12345`.

## 2. Wire the env vars

On the VPS, add to `/srv/gifteeng/.env`:

```env
# API project DSN
SENTRY_DSN="https://...@...ingest.../...."

# Web project DSN — exposed to the browser, hence the NEXT_PUBLIC_ prefix
NEXT_PUBLIC_SENTRY_DSN="https://...@...ingest.../...."

# Both
SENTRY_ENV="production"        # or "staging" for non-prod boxes
SENTRY_TRACES_SAMPLE_RATE="0.1"   # 10% of requests; bump for debugging
SENTRY_PROFILES_SAMPLE_RATE="0.1" # CPU/event-loop profiles, API-only
```

Mobile (Flutter): we already use `sentry_flutter` in pubspec. The DSN
is read from the build args. Add to the `--dart-define` flags in your
`flutter build` command:

```sh
flutter build apk --release \
  --dart-define=SENTRY_DSN=https://...@...ingest.../....
```

## 3. Restart

```sh
systemctl restart gifteeng-api
systemctl restart gifteeng-web
```

Verify within a minute by triggering a deliberate test error from the
admin panel, then checking the Sentry dashboard. You should see the
event within a few seconds.

## 4. Optional: source maps

For unminified stack traces in the Web project, run
`npx @sentry/wizard@latest -i nextjs` once. This wires source-map
upload into the Next build via `withSentryConfig`. Skipped here
because it needs an Sentry auth token — set it up when you decide
to take Sentry seriously.

## What's already wired

- **API** (`apps/api/src/main.ts`): `Sentry.init` runs before Nest
  bootstrap, profiling integration enabled, Express error handler
  installed via `setupExpressErrorHandler` after routes are loaded.
- **Web client** (`apps/web/sentry.client.config.ts`): browser-side
  init, replay disabled by default (heavy on quota), env-gated.
- **Web server** (`apps/web/sentry.server.config.ts`): Next.js RSC
  + route handler errors, env-gated.
- **Web edge** (`apps/web/sentry.edge.config.ts`): middleware + edge
  runtime errors, env-gated.

All four files are no-ops when the corresponding DSN env var is absent,
so the deploy already works without Sentry — you just don't see errors
flow until you flip the env switch.
