// Quick k6 smoke — 90 seconds at the 200-VU operating load.
// Skips the spike/cooldown stages of the full baseline so we get
// representative numbers in a fraction of the time.
import http from "k6/http";
import { sleep, check } from "k6";
import { Trend, Rate } from "k6/metrics";
import { randomIntBetween } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

const BASE = __ENV.BASE || "http://127.0.0.1:4000";

const listLat   = new Trend("custom_product_list_ms",   true);
const detailLat = new Trend("custom_product_detail_ms", true);
const cartAdd   = new Trend("custom_cart_add_ms",       true);
const errRate   = new Rate("custom_error_rate");

export const options = {
  stages: [
    { duration: "20s", target: 100 },
    { duration: "60s", target: 200 },
    { duration: "10s", target: 0   },
  ],
  thresholds: {
    "http_req_duration":         ["p(95)<800",  "p(99)<2000"],
    "http_req_failed":           ["rate<0.02"],
    "custom_product_list_ms":    ["p(95)<400"],
    "custom_product_detail_ms":  ["p(95)<400"],
  },
  noConnectionReuse: false,
  discardResponseBodies: false,
};

const SESSIONS = Array.from({ length: 200 }, (_, i) => `k6-${i.toString().padStart(3, "0")}`);

export default function () {
  const sessionKey = SESSIONS[randomIntBetween(0, SESSIONS.length - 1)];
  const headers = {
    "Content-Type": "application/json",
    "X-Audience": "b2c",
    "X-Cart-Session": sessionKey,
    "User-Agent": "k6-quick/1.0",
  };

  const r1 = http.get(`${BASE}/api/products?page=1&pageSize=24`, { headers });
  listLat.add(r1.timings.duration);
  errRate.add(r1.status >= 400);

  let slug = null;
  try {
    const items = JSON.parse(r1.body)?.items ?? [];
    if (items.length > 0) slug = items[randomIntBetween(0, Math.min(items.length, 12) - 1)].slug;
  } catch { /* */ }

  sleep(randomIntBetween(1, 2));

  if (slug) {
    const r2 = http.get(`${BASE}/api/products/${slug}`, { headers });
    detailLat.add(r2.timings.duration);
    errRate.add(r2.status >= 400);

    if (Math.random() < 0.3) {
      try {
        const productId = JSON.parse(r2.body)?.id;
        if (productId) {
          const r3 = http.post(
            `${BASE}/api/cart/guest/items`,
            JSON.stringify({ productId, qty: 1 }),
            { headers },
          );
          cartAdd.add(r3.timings.duration);
          errRate.add(r3.status >= 400);
        }
      } catch { /* */ }
    }
  }

  sleep(randomIntBetween(1, 3));
}
