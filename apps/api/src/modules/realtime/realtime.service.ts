import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { Response } from "express";
import Redis from "ioredis";

/**
 * SSE fanout, Redis-backed for cross-process broadcast.
 *
 * Each API worker keeps its own in-memory map of locally-attached SSE
 * streams (indexed by customerId for per-user events, plus a Set for
 * global anonymous streams). When `publish(customerId, scope)` is called
 * we:
 *   1. Push to all locally-attached streams in this process (zero
 *      latency, no Redis round-trip for self-publishes).
 *   2. PUBLISH the same envelope to a Redis channel so every other
 *      worker process picks it up via its SUBSCRIBE handler and pushes
 *      the line to ITS locally-attached streams.
 *
 * Single-process deployments keep working unchanged — Redis is just an
 * extra fan-out hop that becomes a no-op when no other workers are
 * subscribed.
 *
 * Heartbeat: every 25 s we emit a comment line per stream (ignored by
 * clients but kept-alive at the nginx / cellular-NAT layer; default idle
 * timeout is 60 s).
 */
export type Scope =
  | "cart" | "wishlist" | "goins" | "orders" | "profile"
  | "products" | "categories" | "collections" | "customizer"
  | "banners"  | "announcements" | "settings"   | "homepage" | "testimonials"
  | "presence";

interface Stream {
  res: Response;
  ping: NodeJS.Timeout;
}

const CHANNEL_USER   = "rt:user";
const CHANNEL_GLOBAL = "rt:global";

interface UserEnvelope   { customerId: string; scope: Scope; extra?: Record<string, unknown>; from: string }
interface GlobalEnvelope { scope: Scope; extra?: Record<string, unknown>; from: string }

@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(RealtimeService.name);
  private readonly streams = new Map<string, Set<Stream>>();
  private readonly globalStreams = new Set<Stream>();

  // Workers identify themselves so we don't double-fan-out a self-publish
  // (we already wrote to local streams BEFORE publishing to Redis).
  private readonly workerId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

  // Two clients: one for PUBLISH (and any future Redis ops), one for
  // SUBSCRIBE (ioredis dedicates a connection to subscriptions).
  private pub: Redis | null = null;
  private sub: Redis | null = null;
  private redisOk = false;

  private presenceSupplier: (() => Record<string, unknown>[]) | null = null;

  setPresenceSnapshotSupplier(fn: () => Record<string, unknown>[]) {
    this.presenceSupplier = fn;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async onModuleInit() {
    const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
    try {
      this.pub = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
      this.sub = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
      await Promise.all([this.pub.connect(), this.sub.connect()]);
      await this.sub.subscribe(CHANNEL_USER, CHANNEL_GLOBAL);
      this.sub.on("message", (channel: string, raw: string) => this.onRedisMessage(channel, raw));
      this.redisOk = true;
      this.log.log(`Redis connected, worker=${this.workerId}`);
    } catch (err) {
      // Redis is optional — single-process deployments still work via
      // in-memory fanout. Just log loud so ops sees the degradation.
      this.log.error(`Redis init failed (${(err as Error).message}) — falling back to in-memory only`);
      this.redisOk = false;
      this.pub = null;
      this.sub = null;
    }
  }

  async onModuleDestroy() {
    try { await this.sub?.quit(); } catch { /* ignore */ }
    try { await this.pub?.quit(); } catch { /* ignore */ }
  }

  private onRedisMessage(channel: string, raw: string) {
    try {
      const env = JSON.parse(raw);
      // Skip messages we ourselves published — already fanned out locally.
      if (env?.from === this.workerId) return;
      if (channel === CHANNEL_USER) {
        const e = env as UserEnvelope;
        this.fanoutLocalUser(e.customerId, e.scope, e.extra);
      } else if (channel === CHANNEL_GLOBAL) {
        const e = env as GlobalEnvelope;
        this.fanoutLocalGlobal(e.scope, e.extra);
      }
    } catch (err) {
      this.log.warn(`bad redis message on ${channel}: ${(err as Error).message}`);
    }
  }

  // ── Per-customer streams ───────────────────────────────────────────────

  attach(customerId: string, res: Response): () => void {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    res.write(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);

    const ping = setInterval(() => {
      try { res.write(`: ping ${Date.now()}\n\n`); } catch { /* closing */ }
    }, 25_000);

    const stream: Stream = { res, ping };
    let bucket = this.streams.get(customerId);
    if (!bucket) { bucket = new Set(); this.streams.set(customerId, bucket); }
    bucket.add(stream);
    this.log.log(`[sse-user OPEN] cid=${customerId.slice(0, 8)}… active=${bucket.size} worker=${this.workerId}`);

    return () => {
      clearInterval(ping);
      const b = this.streams.get(customerId);
      if (b) {
        b.delete(stream);
        const remaining = b.size;
        if (remaining === 0) this.streams.delete(customerId);
        this.log.log(`[sse-user CLOSE] cid=${customerId.slice(0, 8)}… active=${remaining}`);
      }
      try { res.end(); } catch { /* already ended */ }
    };
  }

  /**
   * Push an `invalidate` event to every active stream for `customerId`.
   * Local streams get the line synchronously; remote workers get it via
   * Redis pub/sub.
   */
  publish(customerId: string | null | undefined, scope: Scope, extra?: Record<string, unknown>) {
    if (!customerId) return;
    const localSubs = this.fanoutLocalUser(customerId, scope, extra);
    if (this.redisOk && this.pub) {
      const env: UserEnvelope = { customerId, scope, extra, from: this.workerId };
      this.pub.publish(CHANNEL_USER, JSON.stringify(env)).catch((err: unknown) => {
        this.log.warn(`publish to redis failed: ${(err as Error).message}`);
      });
    }
    this.log.log(`[publish] cid=${customerId.slice(0, 8)}… scope=${scope} local=${localSubs}`);
  }

  publishMany(customerId: string | null | undefined, scopes: Scope[]) {
    for (const s of scopes) this.publish(customerId, s);
  }

  /** Local-only fan-out, used both by direct publish and Redis subscribe. */
  private fanoutLocalUser(customerId: string, scope: Scope, extra?: Record<string, unknown>): number {
    const bucket = this.streams.get(customerId);
    const subs = bucket?.size ?? 0;
    if (!bucket || subs === 0) return 0;
    const payload = JSON.stringify({ scope, at: new Date().toISOString(), ...(extra ?? {}) });
    const line = `event: invalidate\ndata: ${payload}\n\n`;
    let dead = 0;
    for (const s of bucket) {
      try { s.res.write(line); } catch { dead++; }
    }
    if (dead > 0) this.log.warn(`[fanout] ${dead} dead sockets for cid=${customerId.slice(0, 8)}…`);
    return subs;
  }

  // ── Global anonymous streams ───────────────────────────────────────────

  attachGlobal(res: Response): () => void {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    res.write(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString(), public: true })}\n\n`);

    if (this.presenceSupplier) {
      try {
        const snap = this.presenceSupplier();
        for (const row of snap) {
          const payload = JSON.stringify({ scope: "presence", at: new Date().toISOString(), replay: true, ...row });
          res.write(`event: invalidate\ndata: ${payload}\n\n`);
        }
      } catch (err) {
        this.log.warn(`presence snapshot replay failed: ${(err as Error).message}`);
      }
    }
    const ping = setInterval(() => {
      try { res.write(`: ping ${Date.now()}\n\n`); } catch { /* closing */ }
    }, 25_000);
    const stream: Stream = { res, ping };
    this.globalStreams.add(stream);
    return () => {
      clearInterval(ping);
      this.globalStreams.delete(stream);
      try { res.end(); } catch { /* already ended */ }
    };
  }

  publishGlobal(scope: Scope, extra?: Record<string, unknown>) {
    this.fanoutLocalGlobal(scope, extra);
    if (this.redisOk && this.pub) {
      const env: GlobalEnvelope = { scope, extra, from: this.workerId };
      this.pub.publish(CHANNEL_GLOBAL, JSON.stringify(env)).catch((err: unknown) => {
        this.log.warn(`publishGlobal to redis failed: ${(err as Error).message}`);
      });
    }
  }

  private fanoutLocalGlobal(scope: Scope, extra?: Record<string, unknown>) {
    const payload = JSON.stringify({ scope, at: new Date().toISOString(), global: true, ...(extra ?? {}) });
    const line = `event: invalidate\ndata: ${payload}\n\n`;
    for (const s of this.globalStreams) {
      try { s.res.write(line); } catch { /* dead */ }
    }
    // Also fan out to per-customer streams so a logged-in user gets the
    // event whether they're on the global or per-user channel.
    for (const bucket of this.streams.values()) {
      for (const s of bucket) {
        try { s.res.write(line); } catch { /* dead */ }
      }
    }
  }
}
