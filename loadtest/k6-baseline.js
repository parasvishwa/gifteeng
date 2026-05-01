// k6 baseline load test — simulates a realistic mix of traffic against
// the gifteeng API + web for capacity planning.
//
// Run from a workstation with k6 installed:
//   k6 run --env BASE=https://new-api.gifteeng.com loadtest/k6-baseline.js
//   k6 run --env BASE=http://217.216.59.87:4000   loadtest/k6-baseline.js   # bypass nginx
//
// Stages:
//   - 30 s ramp-up to 50 VUs       (gentle warm-up; cache fills)
//   - 2 min plateau at 200 VUs     (target operating load)
//   - 1 min spike to 500 VUs       (peak burst — Diwali-sale class)
//   - 1 min cool-down to 0
//
// Each VU loops through a realistic browse → product detail → cart
// add flow with random think-time. Customer auth is simulated by
// re-using a small pool of session keys for the guest cart so the
// load matches what a real visitor mix looks like (~95 % anonymous).
//
// Pass/fail thresholds (see `thresholds` below):
//   - p95 latency < 800 ms
//   - p99 latency < 2 s
//   - error rate  < 1 %
//
// k6 prints a results summary at the end. Capture stdout to a file so
// we can diff regressions across deploys:
//   k6 run loadtest/k6-baseline.js > runs/$(date +%F-%H%M).txt

import http from "k6/http";
import { sleep, check } from "k6";
import { Trend, Rate } from "k6/metrics";
import { randomIntBetween } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

const BASE = __ENV.BASE || "http://127.0.0.1:4000";

// Custom metrics so we can see per-endpoint regressions, not just an
// aggregate average that hides which path slowed down.
const productListLatency  = new Trend("custom_product_list_ms",  true);
const productDetailLatency = new Trend("custom_product_detail_ms", true);
const cartAddLatency      = new Trend("custom_cart_add_ms",      true);
const cartGetLatency      = new Trend("custom_cart_get_ms",      true);
const errorRate           = new Rate ("custom_error_rate");

export const options = {
  stages: [
    { duration: "30s", target: 50  },
    { duration: "2m",  target: 200 },
    { duration: "1m",  target: 500 },
    { duration: "1m",  target: 0   },
  ],
  thresholds: {
    "http_req_duration":         ["p(95)<800",  "p(99)<2000"],
    "http_req_failed":           ["rate<0.01"],
    "custom_error_rate":         ["rate<0.01"],
    "custom_product_list_ms":    ["p(95)<400"],
    "custom_product_detail_ms":  ["p(95)<400"],
    "custom_cart_add_ms":        ["p(95)<800"],
  },
  // Resource hints — k6 tells the OS up-front how many TCP slots it
  // wants, so test ramp-up doesn't fight ulimit.
  noConnectionReuse: false,
  discardResponseBodies: false,
};

// 200-key session pool — keeps guest carts realistic without
// hammering one cart row.
const SESSION_KEYS = Array.from({ length: 200 }, (_, i) => `k6-session-${i.toString().padStart(3, "0")}`);
function pickSession() { return SESSION_KEYS[randomIntBetween(0, SESSION_KEYS.length - 1)]; }

const PRODUCT_SLUGS = [
  // Hot products — replace with real slugs from your catalog. For now
  // we let the list endpoint hand us live slugs at the start of each
  // VU iteration.
];

function defaultHeaders(sessionKey) {
  return {
    "Content-Type": "application/json",
    "X-Audience": "b2c",
    "X-Cart-Session": sessionKey,
    "User-Agent": "k6-gifteeng-loadtest/1.0",
  };
}

export default function () {
  const sessionKey = pickSession();
  const headers = defaultHeaders(sessionKey);

  // Step 1: GET /api/products?page=1&pageSize=24 (cached)
  const listRes = http.get(`${BASE}/api/products?page=1&pageSize=24`, { headers });
  productListLatency.add(listRes.timings.duration);
  errorRate.add(listRes.status >= 400);
  check(listRes, { "list 200": (r) => r.status === 200 }) || console.warn(`list ${listRes.status}`);
  let slug = null;
  try {
    const items = JSON.parse(listRes.body)?.items ?? [];
    if (items.length > 0) {
      slug = items[randomIntBetween(0, Math.min(items.length, 12) - 1)].slug;
    }
  } catch { /* ignore */ }
  if (!slug) slug = PRODUCT_SLUGS[randomIntBetween(0, PRODUCT_SLUGS.length - 1)];
  sleep(randomIntBetween(1, 3));

  // Step 2: GET /api/products/<slug> (cached per slug)
  if (slug) {
    const detailRes = http.get(`${BASE}/api/products/${slug}`, { headers });
    productDetailLatency.add(detailRes.timings.duration);
    errorRate.add(detailRes.status >= 400);
    check(detailRes, { "detail 200": (r) => r.status === 200 });
  }
  sleep(randomIntBetween(2, 6));

  // Step 3: 30 % of users add to cart, 70 % bounce.
  if (Math.random() < 0.3 && slug) {
    // Need productId — re-fetch detail (already cached)
    let productId = null;
    try {
      const r = http.get(`${BASE}/api/products/${slug}`, { headers });
      productId = JSON.parse(r.body)?.id ?? null;
    } catch { /* ignore */ }
    if (productId) {
      const addRes = http.post(
        `${BASE}/api/cart/guest/items`,
        JSON.stringify({ productId, qty: 1 }),
        { headers },
      );
      cartAddLatency.add(addRes.timings.duration);
      errorRate.add(addRes.status >= 400);
      check(addRes, { "cart add 2xx": (r) => r.status >= 200 && r.status < 300 });

      sleep(randomIntBetween(1, 3));
      const cartRes = http.get(`${BASE}/api/cart/guest`, { headers });
      cartGetLatency.add(cartRes.timings.duration);
      errorRate.add(cartRes.status >= 400);
    }
  }

  // Random think between iterations — avoids synthetic lock-step.
  sleep(randomIntBetween(2, 8));
}
