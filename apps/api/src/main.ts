import "reflect-metadata";

// ── Sentry — MUST be first so it captures bootstrap-time errors ───────────
// Activates only when SENTRY_DSN is set (zero overhead in dev / when
// the env is left blank). Tracesample 0.1 keeps the quota footprint
// tiny on the free tier; bump to 1.0 in pre-prod when investigating.
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
const SENTRY_DSN = process.env.SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV ?? "production",
    release: process.env.SENTRY_RELEASE ?? process.env.GIT_SHA ?? undefined,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    profilesSampleRate: Number(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? "0.1"),
  });
}

import cluster from "node:cluster";
import os from "node:os";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { json, urlencoded, static as expressStatic } from "express";

const ALLOWED_ORIGINS = [
  // production domains
  "https://www.gifteeng.com",
  "https://gifteeng.com",
  "https://new.gifteeng.com",
  "https://new-business.gifteeng.com",
  "https://admin.gifteeng.com",
  // dev / staging fallbacks
  "http://localhost:3000",
  "http://localhost:3001",
  "http://217.216.59.87",
  "http://217.216.59.87:3000",
  "http://217.216.59.87:8080",
];

/**
 * Refuse to start if any production-critical secret is missing or weak.
 *
 * Prior to this guard, missing JWT_*_SECRET silently fell back to the
 * literal string "dev-b2c" / "dev-b2b" inside the auth services, which
 * meant a deploy with a broken .env would happily issue forgeable
 * tokens signed with a known constant. Fail loud + early instead.
 *
 * Skipped only when NODE_ENV === 'development' (local dev convenience).
 */
function assertProductionSecrets(): void {
  if (process.env.NODE_ENV === "development") return;

  const required: Array<{ name: string; minLength: number }> = [
    { name: "JWT_B2C_SECRET",       minLength: 32 },
    { name: "JWT_B2B_SECRET",       minLength: 32 },
    { name: "FILES_SIGNING_SECRET", minLength: 32 },
    { name: "DATABASE_URL",         minLength: 20 },
  ];
  const failures: string[] = [];
  for (const { name, minLength } of required) {
    const v = process.env[name];
    if (!v) {
      failures.push(`${name} is missing`);
    } else if (v.length < minLength) {
      failures.push(`${name} is too short (${v.length} chars; need >= ${minLength})`);
    } else if (/^dev[-_]/i.test(v) || v === "changeme" || v === "secret") {
      failures.push(`${name} looks like a placeholder value`);
    }
  }
  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      "\n[startup] FATAL — production secrets missing or weak:\n  - " +
        failures.join("\n  - ") +
        "\nSet NODE_ENV=development locally to bypass this check.\n",
    );
    process.exit(1);
  }
}

async function bootstrap() {
  assertProductionSecrets();
  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // we register our own with higher limits below
    cors: {
      origin: (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
        // allow server-to-server / curl (no origin header)
        if (!origin) return cb(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        // Allow Chrome / Edge / Firefox extensions — the Gifteeng Review
        // Grabber posts to /api/admin/external-reviews/bulk-import from
        // chrome-extension://<random-id>. Extension IDs change per browser
        // install so we whitelist the entire scheme.
        if (origin.startsWith("chrome-extension://"))     return cb(null, true);
        if (origin.startsWith("moz-extension://"))        return cb(null, true);
        if (origin.startsWith("safari-web-extension://")) return cb(null, true);
        // CORS rejection MUST NOT throw — that surfaces as a 500. Reject
        // by returning {allow: false} so the browser sees a clean 403.
        cb(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Cart-Session",
        "X-Requested-With",
      ],
    },
    rawBody: true,
  });

  // Serve uploaded product images directly.
  // Route: /uploads/** → UPLOAD_DIR on disk (bypasses the API global prefix).
  // This makes  http://localhost:4000/uploads/product/xxx.jpg  work, which is
  // what the Next.js /uploads/* rewrite proxy expects.
  const uploadDir = process.env.UPLOAD_DIR ?? "/var/gifteeng/uploads";
  app.use("/uploads", expressStatic(uploadDir, {
    maxAge: "30d",
    immutable: false,
    fallthrough: false,
  }));

  // Body-parser limits.
  //
  // Default for the whole API is 1 MB — plenty for typical JSON payloads
  // (login, cart, etc.) and small enough that a single attacker can't pin
  // a worker on JSON parsing alone. Only specific routes that legitimately
  // need large bodies (canvas customizer payloads with embedded base64
  // images, bulk import endpoints, file-upload metadata blobs) get a
  // larger ceiling. See docs/SECURITY_AUDIT.md M-2.
  const LARGE_BODY_ROUTES = [
    "/api/orders",                  // canvas designs at checkout
    "/api/cart",                    // cart items can carry base64 customizer designs
    "/api/checkout",                // same — designs travel with the order
    "/api/admin/products",          // bulk product import / mockup template payloads
    "/api/admin/homepage-config",   // homepage-builder save: many block configs
    "/api/admin/settings",          // marketing pixels, theme JSON, navigation tree
    "/api/admin/external-reviews",  // bulk import from the Chrome extension
    "/api/files",                   // file metadata + small body uploads
    "/api/imports",                 // CSV/JSON import jobs
    "/api/shopify-migrate",         // Shopify CSV imports
    "/api/design-templates",        // customizer template payloads
  ];
  const BIG = "50mb";
  const SMALL = "1mb";

  app.use(json({ limit: SMALL }));
  app.use(urlencoded({ limit: SMALL, extended: true }));
  for (const route of LARGE_BODY_ROUTES) {
    app.use(route, json({ limit: BIG }));
    app.use(route, urlencoded({ limit: BIG, extended: true }));
  }

  // Sentry HTTP error handler — registered AFTER routes (Nest's @nestjs/core
  // sets up routing during NestFactory.create). When SENTRY_DSN isn't set,
  // setupExpressErrorHandler is a no-op so this stays cheap.
  if (SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app.getHttpAdapter().getInstance());
  }

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle("Gifteeng API")
    .setDescription("Unified B2C + B2B backend")
    .setVersion("0.0.1")
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, doc);

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  const wid = cluster.worker?.id ?? 0;
  Logger.log(
    `🚀 API ready on http://localhost:${port}/api${wid ? ` (worker ${wid}/${process.env.WEB_CONCURRENCY ?? 1})` : ""}`,
    "Bootstrap",
  );
}

// ── Multi-worker entry point ─────────────────────────────────────────────────
// `WEB_CONCURRENCY` controls how many Node worker processes to run, all
// listening on the same port via the OS-level round-robin (cluster module).
// Each worker is fully independent — Prisma client per worker (pgbouncer
// multiplexes onto a small backend pool), Redis pub/sub fans realtime
// events across workers, and singleton crons (AI targeting sweep) are
// gated to worker.id === 1 so they don't fire N times per cycle.
//
// `WEB_CONCURRENCY` unset or =1 → single process, no cluster. Identical
// behaviour to before. =2..N → primary forks that many workers.
const concurrency = Math.max(1, Math.min(
  Number(process.env.WEB_CONCURRENCY ?? 1),
  os.cpus().length,
));

if (concurrency > 1 && cluster.isPrimary) {
  Logger.log(`Forking ${concurrency} API workers (cluster.isPrimary)`, "Bootstrap");
  for (let i = 0; i < concurrency; i++) cluster.fork();
  cluster.on("exit", (worker, code, signal) => {
    Logger.warn(
      `Worker ${worker.process.pid} died (code=${code} signal=${signal}) — respawning`,
      "Bootstrap",
    );
    cluster.fork();
  });
} else {
  bootstrap();
}
