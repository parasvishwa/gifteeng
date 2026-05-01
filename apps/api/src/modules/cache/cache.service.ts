import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";

/**
 * Thin Redis-backed cache wrapper with a graceful in-memory fallback.
 *
 * Usage:
 *   await cache.getOrSet("products:list:b2c:0:24", 60, () =>
 *     prisma.product.findMany(...)
 *   );
 *
 * - `ttlSeconds` is required so we can never accidentally pin a key
 *   forever. Pass 0 for "no TTL" only if you really mean it.
 * - Failures (Redis down, JSON parse error) DEGRADE to the fetcher —
 *   never throw upward. The catalog always serves correct data; cache
 *   is purely an optimization.
 *
 * The eviction policy is set on the Redis instance to allkeys-lru with
 * a 256 MB maxmemory cap, so even a runaway cache key can't OOM the
 * VPS.
 *
 * Invalidation
 *   `del(prefix)`        — drop one key
 *   `delByPattern("products:*")` — drop a whole namespace using SCAN
 *
 *   We use SCAN instead of KEYS because KEYS blocks Redis on large
 *   datasets (and we'll grow into that). SCAN is cursor-based and
 *   non-blocking.
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CacheService.name);
  private client: Redis | null = null;
  private ok = false;
  // Tiny in-memory fallback for when Redis is down — avoids stampede
  // on the DB even in degraded mode. Capped to 256 entries.
  private memo = new Map<string, { v: unknown; expiresAt: number }>();
  private readonly MEMO_MAX = 256;

  async onModuleInit() {
    const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
    try {
      this.client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
      await this.client.connect();
      this.ok = true;
      this.log.log("Redis cache connected");
    } catch (err) {
      this.log.error(`Redis cache init failed (${(err as Error).message}) — using in-memory only`);
      this.ok = false;
      this.client = null;
    }
  }

  async onModuleDestroy() {
    try { await this.client?.quit(); } catch { /* ignore */ }
  }

  // ── In-memory helpers (used when Redis is down) ──────────────────────

  private memoGet<T>(key: string): T | undefined {
    const e = this.memo.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) {
      this.memo.delete(key);
      return undefined;
    }
    return e.v as T;
  }

  private memoSet(key: string, v: unknown, ttlSeconds: number): void {
    if (this.memo.size >= this.MEMO_MAX) {
      const firstKey = this.memo.keys().next().value;
      if (firstKey) this.memo.delete(firstKey);
    }
    this.memo.set(key, { v, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  // ── Public API ───────────────────────────────────────────────────────

  async get<T>(key: string): Promise<T | undefined> {
    if (this.ok && this.client) {
      try {
        const raw = await this.client.get(key);
        if (raw === null) return undefined;
        return JSON.parse(raw) as T;
      } catch (err) {
        this.log.warn(`cache.get(${key}) failed: ${(err as Error).message}`);
      }
    }
    return this.memoGet<T>(key);
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const json = JSON.stringify(value);
    if (this.ok && this.client) {
      try {
        if (ttlSeconds > 0) {
          await this.client.set(key, json, "EX", ttlSeconds);
        } else {
          await this.client.set(key, json);
        }
        return;
      } catch (err) {
        this.log.warn(`cache.set(${key}) failed: ${(err as Error).message}`);
      }
    }
    this.memoSet(key, value, ttlSeconds || 60);
  }

  async del(key: string): Promise<void> {
    if (this.ok && this.client) {
      try { await this.client.del(key); } catch { /* ignore */ }
    }
    this.memo.delete(key);
  }

  /** Cursor-based delete — safe on big keyspaces. */
  async delByPattern(pattern: string): Promise<number> {
    let n = 0;
    if (this.ok && this.client) {
      try {
        let cursor = "0";
        do {
          const [next, keys] = await this.client.scan(cursor, "MATCH", pattern, "COUNT", 200);
          cursor = next;
          if (keys.length > 0) {
            await this.client.del(...keys);
            n += keys.length;
          }
        } while (cursor !== "0");
      } catch (err) {
        this.log.warn(`cache.delByPattern(${pattern}) failed: ${(err as Error).message}`);
      }
    }
    // In-memory cleanup with simple pattern: only "prefix*" supported.
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      for (const k of this.memo.keys()) if (k.startsWith(prefix)) this.memo.delete(k);
    } else {
      this.memo.delete(pattern);
    }
    return n;
  }

  /**
   * `await cache.getOrSet("k", 60, () => fetchFromDb())`
   * — a single keystroke for cache-aside. Coalesces nothing (no
   * stampede protection here), but for catalog reads at 60s TTL the
   * stampede is bounded and acceptable. Add SETNX-based locking later
   * if a hot key starts thrashing.
   */
  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== undefined) return hit;
    const fresh = await fetcher();
    // Best-effort cache; never block on the set.
    void this.set(key, fresh, ttlSeconds);
    return fresh;
  }
}
