// Sentry — Edge runtime (middleware, edge route handlers, OG images).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV ?? "production",
    release: process.env.SENTRY_RELEASE ?? undefined,
    // Edge runtime can't use the same profiling integration; default
    // sample rate is fine.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
  });
}
