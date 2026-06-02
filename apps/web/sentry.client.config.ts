// Sentry — browser side. Active only when NEXT_PUBLIC_SENTRY_DSN is set
// (zero bundle overhead in dev / when the env is empty, because Sentry's
// SDK is import-on-demand from Next when withSentryConfig is wired
// in next.config.mjs — but for an MVP wiring without source-map upload
// we simply gate Sentry.init on the env flag).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// ─── PII scrub list (mirrors apps/mobile/.../sentry_setup.dart) ────────────
// Anything whose key contains one of these substrings gets [redacted]'d
// before the event leaves the browser. See docs/SECURITY_AUDIT.md L-5.
const SENSITIVE_KEY_FRAGMENTS = [
  // Credentials / auth
  "otp", "password", "temppassword", "temp_password", "pin",
  "token", "accesstoken", "access_token", "refreshtoken", "refresh_token",
  "invite_token", "invitetoken", "invite_url", "inviteurl",
  "apikey", "api_key", "authorization", "authentication",
  // Payment
  "razorpay_signature", "cvv", "cardnumber", "card_number", "card", "upi",
  // Secrets / config
  "secret", "private", "session",
  // PII
  "aadhaar", "pan", "gstin", "ifsc",
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_FRAGMENTS.some((frag) => lower.includes(frag));
}

function scrubObject(o: unknown): unknown {
  if (o == null) return o;
  if (Array.isArray(o)) return o.map(scrubObject);
  if (typeof o === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
        out[k] = "[redacted]";
      } else if (typeof v === "string" && v.length > 500) {
        // Long strings are usually request/response bodies — truncate so
        // payment-page HTML / API JSON doesn't ride along.
        out[k] = `${v.slice(0, 500)}…[truncated]`;
      } else {
        out[k] = scrubObject(v);
      }
    }
    return out;
  }
  return o;
}

function scrubUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url, "http://x");
    let touched = false;
    for (const key of [...u.searchParams.keys()]) {
      if (isSensitiveKey(key)) {
        u.searchParams.set(key, "[redacted]");
        touched = true;
      }
    }
    return touched ? u.toString().replace(/^http:\/\/x/, "") : url;
  } catch {
    return url;
  }
}

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
    sendDefaultPii: false,
    beforeSend: (event) => {
      try {
        // Scrub Authorization / Cookie headers from the request envelope.
        if (event.request) {
          if (event.request.headers) {
            const cleaned: Record<string, string> = {};
            for (const [k, v] of Object.entries(event.request.headers)) {
              const lk = k.toLowerCase();
              if (lk === "authorization" || lk === "cookie" || lk === "set-cookie") {
                continue;
              }
              cleaned[k] = typeof v === "string" ? v : String(v ?? "");
            }
            event.request.headers = cleaned;
          }
          if (event.request.url) {
            event.request.url = scrubUrl(event.request.url);
          }
          if (event.request.data) {
            event.request.data = scrubObject(event.request.data);
          }
        }
        // Scrub extra/contexts blobs which often carry the original
        // fetch body or response JSON.
        if (event.extra) event.extra = scrubObject(event.extra) as typeof event.extra;
        if (event.contexts) {
          event.contexts = scrubObject(event.contexts) as typeof event.contexts;
        }
        // Sentry's user object — strip email/ip if they accidentally got set.
        if (event.user) {
          delete event.user.email;
          delete event.user.ip_address;
        }
      } catch { /* never block error reporting on a scrub failure */ }
      return event;
    },
    beforeBreadcrumb: (crumb) => {
      try {
        if (crumb.data) crumb.data = scrubObject(crumb.data) as typeof crumb.data;
        if (typeof (crumb as { message?: string }).message === "string") {
          // localStorage tokens sometimes land inside breadcrumb messages —
          // scrub anything that looks like a JWT.
          (crumb as { message?: string }).message = (crumb as { message?: string })
            .message!.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]");
        }
      } catch { /* ignore */ }
      return crumb;
    },
  });
}
