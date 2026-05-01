// Sentry — browser side. Active only when NEXT_PUBLIC_SENTRY_DSN is set
// (zero bundle overhead in dev / when the env is empty, because Sentry's
// SDK is import-on-demand from Next when withSentryConfig is wired
// in next.config.mjs — but for an MVP wiring without source-map upload
// we simply gate Sentry.init on the env flag).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV ?? "production",
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? undefined,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    // Replays are heavy on quota — disabled by default. Flip to >0 if
    // you specifically want to see customer journeys for crashes.
    replaysSessionSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_REPLAY_SAMPLE_RATE ?? "0"),
    replaysOnErrorSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE ?? "0"),
  });
}
