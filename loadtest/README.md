# Load testing — k6

Capacity-planning baseline for the Gifteeng API + web. Run before/after
any change that touches a hot read path so we have apples-to-apples
numbers on what's getting faster (or slower).

## Install k6

- macOS:    `brew install k6`
- Linux:    `sudo apt install -y gnupg2 && curl -fsSL https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6.gpg && echo "deb [signed-by=/usr/share/keyrings/k6.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list && sudo apt update && sudo apt install -y k6`
- Windows:  `winget install k6` or `choco install k6`

## Run the baseline

```
k6 run --env BASE=http://127.0.0.1:4000 loadtest/k6-baseline.js
```

For a remote run against the live API (use sparingly, off-peak):

```
k6 run --env BASE=https://new-api.gifteeng.com loadtest/k6-baseline.js
```

## What the script does

- 200 concurrent virtual users, ramping to a 500-VU peak for 1 min.
- Each VU loops: list products → detail → maybe-add-to-cart → bounce.
- Hits the Redis cache + pgbouncer + (optionally clustered) API.
- Custom metrics break out per-endpoint p95 / p99 so a regression
  shows you _which_ path got slow, not just an average that hides it.

## Pass criteria (current targets)

| metric                         | threshold |
| ------------------------------ | --------- |
| `http_req_duration` p95        | < 800 ms  |
| `http_req_duration` p99        | < 2 s     |
| `http_req_failed` rate         | < 1 %     |
| `custom_product_list_ms` p95   | < 400 ms  |
| `custom_product_detail_ms` p95 | < 400 ms  |
| `custom_cart_add_ms` p95       | < 800 ms  |

A failed threshold exits k6 non-zero so CI catches regressions.

## Capturing baselines

```
mkdir -p loadtest/runs
k6 run loadtest/k6-baseline.js | tee loadtest/runs/$(date +%F-%H%M)-baseline.txt
```

Diff against last good run with `diff loadtest/runs/$LAST loadtest/runs/$NOW`.

## What it does NOT cover (yet)

- **Authenticated flows** — the script uses guest carts only. Auth
  involves Razorpay / OTP / JWT issuance; needs a separate fixture
  ("preload 50 customer accounts with cookies/tokens, replay") before
  we can stress the logged-in path.
- **Customizer save** — the heaviest single endpoint. Needs a fixture
  with a real canvas JSON. Add as `k6-customizer.js` once we have a
  representative payload.
- **WebSocket / SSE long-lived connections** — k6 supports SSE via
  `k6/experimental/sse` but it's its own scenario with different
  scaling characteristics. Add as `k6-sse-flood.js` for the realtime
  fan-out test.

## Where the bottlenecks usually surface

1. **Postgres connection pool** — pgbouncer transaction pooling caps
   us at `default_pool_size` real backends (currently 25). If
   `pg_stat_activity` shows queries queueing, bump that.
2. **Redis CPU** — `redis-cli info stats` → `instantaneous_ops_per_sec`
   should stay below 50 k. If it climbs, either keys are evicting too
   often or a cache key is too granular.
3. **Node event loop** — `nodejs_eventloop_lag_seconds` (Sentry profiler
   if wired) > 100 ms means the worker is starved. Add a worker.
4. **nginx upstream queue** — `client_max_body_size` only matters for
   uploads; for read-heavy load, the bottleneck is `worker_connections`
   and `worker_processes`. Default Ubuntu settings hold at ~2-3 k QPS.
