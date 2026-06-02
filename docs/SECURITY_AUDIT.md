# Gifteeng Security Audit

**Scope:** `apps/api` (NestJS), `apps/web` (Next.js 14), `apps/mobile` (Flutter).
**Method:** static review of authentication, authorization, input handling, secret management, rate-limiting, file-upload, payment, and client-side storage code paths.
**Outcome legend:** 🟥 critical · 🟧 high · 🟨 medium · 🟦 low · ✅ already mitigated.

> Findings are listed in severity-ranked order. Each finding cites the file/line and gives a concrete fix sketch. None of these are theoretical — they are present in code on `main` as of today.

---

## 🟥 Critical

### C-1. B2B login has no rate limiting → password brute-force is free
**File:** `apps/api/src/modules/auth-b2b/auth-b2b.controller.ts:58-61`

```ts
@Post("login")
login(@Body(...) body: { email: string; password: string }) {
  return this.service.login(body.email, body.password);
}
```

The OTP endpoints (`/auth/b2c/otp/request`, `…/verify`) carry `@Throttle()`, but `/auth/b2b/login`, `/auth/b2b/set-password`, and `/auth/b2b/bootstrap` do not. There is no `APP_GUARD` registration for `ThrottlerGuard` in `app.module.ts` either — so even where `@Throttle()` *is* applied, it is currently a no-op (see C-2).

**Risk:** attacker can submit unlimited password attempts against any known admin email. With a single super-admin row on day-one deploys, a 6-char dictionary password falls in minutes.

**Fix:**

1. Register the throttler guard globally in `app.module.ts`:

   ```ts
   import { APP_GUARD } from "@nestjs/core";
   import { ThrottlerGuard } from "@nestjs/throttler";
   …
   providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
   ```

2. Add tight per-IP throttles to every credential-handling endpoint:

   ```ts
   @Throttle({ default: { ttl: 60_000, limit: 5 } })  @Post("login")
   @Throttle({ default: { ttl: 60_000, limit: 3 } })  @Post("set-password")
   @Throttle({ default: { ttl: 3600_000, limit: 1 } }) @Post("bootstrap")
   ```

3. Add a per-account lockout counter — five failed `login` attempts inside 15 min should freeze that account row for an hour and surface a banner on next legitimate login.

---

### C-2. Global `ThrottlerGuard` not wired — every `@Throttle()` decorator is dead code
**File:** `apps/api/src/app.module.ts:69`

```ts
ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
```

The module is imported but no `APP_GUARD` provider binds `ThrottlerGuard` globally, and no controller `@UseGuards(ThrottlerGuard)`. Per the `@nestjs/throttler` docs the decorators only take effect once the guard is registered. **All current rate-limit annotations on OTP request / verify are non-functional.**

**Risk:** OTP request can be hit unlimited times per IP → SMS-credit drain attack via MSG91 (note: each SMS costs money). Brute-force on `otp/verify` (10⁶ keyspace) is technically rate-limited only by the service-layer fail counter (which I could not locate — see verification step in Action Items).

**Fix:** add `APP_GUARD` provider as in C-1 step 1. Verify by trying the endpoint twice over the limit and observing `HTTP 429`.

---

### C-3. `/auth/b2b/set-password` lets anyone claim an invited account
**File:** `apps/api/src/modules/auth-b2b/auth-b2b.service.ts:45-52`

```ts
async setPassword(email: string, password: string) {
  const user = await this.prisma.companyUser.findFirst({ where: { email } });
  if (!user) throw new UnauthorizedException("User not found");
  if (user.passwordHash) throw new ConflictException("Password already set. …");
  …
}
```

Anyone who guesses an invited user's email — and gets there before the invitee — sets the password and gains the role assigned to that row. No invite token, no email confirmation, no rate-limit.

**Risk:** account takeover of newly-invited team members. Particularly dangerous because `team.service.ts:invite()` now creates the row with `passwordHash` pre-populated by a random temp password — but the **old** `invite()` flow in `auth-b2b.service.ts:96-114` still creates rows with `passwordHash = null`, which makes those rows vulnerable to set-password takeover. Both flows coexist.

**Fix:**

1. Decommission `auth-b2b.service.ts:invite()` — it's a stub (TODO note still in code) and no longer used by the new `/b2b/team` flow.
2. Replace `setPassword` with a token-based flow:
   - At invite time, generate a single-use `inviteToken` (`crypto.randomBytes(32)`) with 7-day TTL, store it on the row, return it to the inviter via the same banner.
   - Set-password endpoint accepts `{ token, password }` and the lookup is on `inviteToken` not `email`.
   - Apply the same throttle as login.

---

### C-4. Disabled team members keep authenticating
**File:** `apps/api/src/modules/auth-b2b/jwt-b2b.strategy.ts:42-54`

```ts
const row = await this.prisma.companyUser.findUnique({
  where: { id: payload.sub },
  select: { permissions: true, isActive: true, role: true },
});
return {
  …
  permissions: row?.isActive === false ? [] : (row?.permissions ?? []),
  …
};
```

When `isActive === false` the strategy strips permissions but still resolves a valid `req.user`. Endpoints guarded only by `JwtB2bGuard` (no further permission check) will accept the request. The `/auth/b2b/me` endpoint in particular does no permission check and will return profile data + role + permissions list for a deactivated user.

**Fix:**

```ts
if (!row || row.isActive === false) {
  throw new UnauthorizedException("Account disabled");
}
```

Place this before the return.

---

## 🟧 High

### H-1. Stored XSS via admin-supplied HTML rendered with `dangerouslySetInnerHTML`
**Files:**

- `apps/web/app/b2c/_components/sections/HomepageBlocks.tsx:294-295` — renders `html` + `css` from a homepage-section block.
- `apps/web/app/b2c/products/[slug]/ProductTabs.tsx:79` — renders `product.description` raw.
- `apps/web/app/b2b/super-admin/pages/page.tsx:223` — admin preview of `editing.html_content`.
- `apps/web/app/b2b/super-admin/_components/admin/ProductEditPage.tsx:444` — admin edit preview of description.

These render strings that a `content_editor` (or any user with `products.edit` / `homepage.edit`) can set. After RBAC rollout you have multiple non-super-admin roles with edit permission on these fields.

**Risk:** a malicious or compromised content editor injects `<script>` that runs in every customer's browser session — token theft, payment-flow takeover, account drain. The Razorpay popup also runs inside the same origin.

**Fix:**

1. Sanitize server-side on write using `isomorphic-dompurify` or `sanitize-html` before persisting the field. Whitelist a tight tag set (`p strong em ul li a img br h1-h4`).
2. Tighten CSP to drop `'unsafe-inline'` from `script-src` (see M-3) — this kills inline-script injection entirely even if sanitizer is bypassed.
3. Consider switching admin description from raw HTML to Markdown (rendered through `marked` + DOMPurify) — narrower attack surface and easier to validate.

---

### H-2. `/api/auth/b2b/bootstrap` is publicly callable and returns a long-lived token
**File:** `apps/api/src/modules/auth-b2b/auth-b2b.service.ts:58-94`

The endpoint creates the first super-admin if none exists, returning a 7-day access token. Anyone who hits the deployed instance before you do owns the platform.

**Risk:** the bootstrap window between `pnpm migrate` and the operator's first call is wide open. Even after closure, a future DB rollback / dev migration that wipes super-admin re-opens it.

**Fix:**

1. Require an env-only secret in the body: `if (req.bootstrapSecret !== process.env.BOOTSTRAP_SECRET) throw new ForbiddenException()`. The env var lives only on your machine, gets unset post-bootstrap.
2. Restrict by source IP at the nginx layer (`location = /api/auth/b2b/bootstrap { allow <your-ip>; deny all; }`) or remove the route entirely after first use.
3. Add throttle: `@Throttle({ default: { ttl: 3600_000, limit: 1 } })`.

---

### H-3. Temp password returned in API response body
**File:** `apps/api/src/modules/auth-b2b/team.service.ts:84-103`

```ts
return { id: created.id, tempPassword };
```

The plaintext temp password transits the API → web reverse proxy → browser, then renders inside a yellow banner. It will appear in:

- nginx access logs (response body usually isn't logged, but request body of `POST /api/b2b/team/invite` may contain `permissions[]` — confirm nginx config).
- Sentry breadcrumbs if `beforeSend` doesn't strip request bodies (the Sentry client config doesn't show a body filter).
- Browser memory + extension snapshots.
- Inviter's clipboard once they copy it (lower risk).

**Risk:** secret leakage. Even though it's single-use, a temp password sitting in Sentry for 30 days is a usable forgery key.

**Fix:**

1. Switch to invite-token flow (see C-3). The token is single-use and tied to a specific row, so leakage is bounded.
2. If you keep the temp-password flow short-term: add `tempPassword` to the Sentry `beforeSend` scrubber, and configure nginx `access_log` to never log POST bodies.

---

### H-4. `JWT_B2B_SECRET` has a hardcoded fallback in the JWT strategy
**File:** `apps/api/src/modules/auth-b2b/jwt-b2b.strategy.ts:35`

```ts
secretOrKey: process.env.JWT_B2B_SECRET ?? "dev-b2b",
```

`main.ts:assertProductionSecrets()` already fails startup if the env var is missing in prod, **but** that check is skipped when `NODE_ENV === "development"` — a typo (`developement`, `produciton`) causes `NODE_ENV` to fall through to the default branch and the strategy quietly accepts tokens signed with `"dev-b2b"`. Anyone running `JWT_B2C_SECRET=dev-b2b` locally can forge prod admin tokens.

**Fix:** remove the fallback entirely; let it crash at first use rather than silently sign with a known-bad key.

```ts
secretOrKey: process.env.JWT_B2B_SECRET,  // throws on undefined when used
```

Apply the same edit to `JwtB2cStrategy`.

---

### H-5. SSRF via `/api/files/upload-from-url`
**File:** `apps/api/src/modules/files/files.service.ts:61-74`

```ts
async uploadFromUrl(url: string, ownerType = "product") {
  if (!/^https?:\/\//i.test(url)) throw new Error("Invalid URL");
  const resp = await fetch(url);
  …
}
```

Admin-only (good), but only protocol-validated — no IP filter. An admin (or a compromised admin token) can supply `http://169.254.169.254/latest/meta-data/iam/security-credentials/` (AWS metadata service) or `http://127.0.0.1:4000/api/admin/stats` (loopback) and exfiltrate the response.

**Fix:**

```ts
import { URL } from "node:url";
import dns from "node:dns/promises";

const u = new URL(url);
if (u.protocol !== "https:") throw new BadRequestException("HTTPS only");

const lookup = await dns.lookup(u.hostname, { all: true });
const blocked = lookup.some(({ address }) =>
  address.startsWith("127.") ||
  address.startsWith("10.") ||
  address.startsWith("192.168.") ||
  address.startsWith("169.254.") ||
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(address) ||
  address === "::1" ||
  address.startsWith("fc") || address.startsWith("fd"),
);
if (blocked) throw new BadRequestException("Private IP not allowed");
```

Also enforce a max response size (e.g. 25 MB) — currently the entire response body is buffered without a cap.

---

## 🟨 Medium

### M-1. Quota-fillable guest uploads
**File:** `apps/api/src/modules/files/files.controller.ts:190-215`

The `hasAnyAuth` helper accepts **any** `X-Cart-Session` string between 8 and 128 chars — there is no DB lookup verifying the cart exists. A bot can rotate UUIDs and upload 25 MB images indefinitely.

**Fix:**

1. Require the cart-session to map to a real `cart` row (`cart.findUnique({ sessionKey })`).
2. Enforce a per-cart-session daily byte budget (e.g. 100 MB / 24h) in Redis.
3. Add IP-level throttle: `@Throttle({ default: { ttl: 3600_000, limit: 50 } })` on upload.

---

### M-2. Body size limit 200 MB enables POST-based DoS
**File:** `apps/api/src/main.ts:127-128`

```ts
app.use(json({ limit: "200mb" }));
app.use(urlencoded({ limit: "200mb", extended: true }));
```

200 MB JSON bodies tie up an entire worker for the duration of parsing (lib `body-parser` is synchronous CPU-bound on validation). At 4 workers, 8 attackers can sustain a soft DoS.

**Fix:** raise the limit only on the specific routes that need it (canvas-design save, etc.) using route-level multer or a per-route body parser. Default everywhere else to 1 MB.

```ts
// in main.ts
app.use(json({ limit: "1mb" }));
app.use("/api/orders", json({ limit: "50mb" }));   // canvas designs
app.use(urlencoded({ limit: "1mb", extended: true }));
```

---

### M-3. CSP retains `unsafe-eval` + `unsafe-inline`
**File:** `apps/web/next.config.mjs:82`

```
script-src 'self' 'unsafe-inline' 'unsafe-eval' …
```

`unsafe-eval` is required by GTM in legacy mode but newer GTM (`gtag` only) does not need it. `unsafe-inline` defeats most of the script-src protection — any HTML injection (H-1) becomes script execution.

**Fix:**

1. Switch to nonce-based CSP: generate a per-request nonce in middleware, set `Content-Security-Policy: …; script-src 'self' 'nonce-xxx'`, render the GTM bootstrap with `<script nonce={nonce}>`. Eliminates both `unsafe-inline` and `unsafe-eval`.
2. Audit GTM container — if no custom-HTML tags need eval, drop `unsafe-eval`.

---

### M-4. Razorpay live key hardcoded in Flutter
**File:** `apps/mobile/lib/features/cart/presentation/screens/checkout_screen.dart:91`

```dart
'razorpay_key_id': 'rzp_live_RdKEIds1IVzjoU',
```

Razorpay key-IDs are not secret (they're sent to every checkout iframe anyway), so this is bad hygiene rather than a compromise. But:

- It defeats the `/super-admin/settings` admin flow that *is* supposed to manage this key on the web side.
- A key rotation requires an app update + 7-day Apple review, not a settings tweak.

**Fix:** read it from `/api/settings/public` like the web does. Keep the current literal only as a fallback if the network call fails.

---

### M-5. `auth-b2b` email lookups are case-sensitive
**Files:** `apps/api/src/modules/auth-b2b/auth-b2b.service.ts:15, 46, 59`

```ts
this.prisma.companyUser.findFirst({ where: { email, isActive: true } });
```

`team.service.ts:invite()` already lowercases on write (`.trim().toLowerCase()`) but `bootstrap()`, `login()`, and `setPassword()` do not. A user invited as `parashar@x.com` cannot log in as `Parashar@x.com`. Worse, an attacker can register `Admin@x.com` after `admin@x.com` exists, bypassing duplicate-protection in `team.service` (compound key `companyId_email` is case-sensitive).

**Fix:** normalize on every read and write:

```ts
const email = body.email.trim().toLowerCase();
```

Add a Postgres unique index on `LOWER(email)` for defence-in-depth.

---

### M-6. No CSRF protection on state-changing endpoints
**Files:** API-wide. The B2C and B2B JWTs are sent as `Authorization: Bearer …`, which is sourced from `localStorage`. That model is not vulnerable to classic CSRF (cookies aren't sent automatically) — but if anyone migrates to httpOnly cookies later (recommended for XSS protection), CSRF becomes wide open. Document the current trade-off.

**Note:** the current `localStorage` token storage is vulnerable to XSS exfiltration (any of H-1's injection points would let an attacker read `localStorage.getItem('gifteeng.b2b.token')`). Until H-1 is fully sanitized, even one minor XSS = total account compromise.

**Fix later:**

- Move B2B token to `Secure; HttpOnly; SameSite=Strict` cookie.
- Add `XSRF-TOKEN` double-submit token check on state-changing routes.

---

### M-7. `crypto.timingSafeEqual` Buffer-length mismatch
**File:** `apps/api/src/modules/files/files.service.ts:38`

```ts
return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
```

If `mac` and `expected` are different lengths (which can happen if the URL is mangled), `timingSafeEqual` throws a `RangeError`. The exception propagates as a 500.

**Fix:** length-check first:

```ts
const macBuf = Buffer.from(mac, "hex");
const expBuf = Buffer.from(expected, "hex");
if (macBuf.length !== expBuf.length) return false;
return crypto.timingSafeEqual(macBuf, expBuf);
```

The Razorpay webhook handler in `checkout.service.ts:427-432` does this correctly already — apply the same pattern here.

---

### M-8. `bootstrap` reuses the global `Company` row
**File:** `apps/api/src/modules/auth-b2b/auth-b2b.service.ts:63-68`

```ts
let company = await this.prisma.company.findFirst();
if (!company) { /* create */ }
```

`findFirst()` with no `where` will attach the new super-admin to whatever the first company row is — fine on day 1 (zero rows) but unsafe if anyone seeded a row from a fixture. Use `findFirst({ where: { isInternal: true } })` or require `companyId` in the bootstrap body.

---

## 🟦 Low / informational

### L-1. CORS allows credentials with `chrome-extension://` wildcard
**File:** `apps/api/src/main.ts:96-98`

```ts
if (origin.startsWith("chrome-extension://")) return cb(null, true);
```

Any Chrome extension installed on a user's machine can now hit the API with credentials. Used intentionally by the Gifteeng Review Grabber extension. Risk is constrained to authenticated users running malicious extensions — low, but document this in `docs/SECURITY_THREATS.md`.

### L-2. JWT TTL is 7 days with no refresh-token flow
**Files:** `auth-b2c.service.ts`, `auth-b2b.service.ts`

Tokens live 7 days; a stolen token is usable for a week. There is no revocation list and no refresh-token rotation. Acceptable for now since:
- Permissions are re-fetched on every request (good, see jwt-b2b.strategy.ts).
- B2B nav reflects permission changes within 30s.

Consider dropping B2B TTL to 1 hour + adding refresh tokens.

### L-3. `process.env.JWT_EXPIRES_IN` defaults vary
The default `"7d"` is reasonable but is referenced from three places (`auth-b2c.service.ts` × 3, `auth-b2b.service.ts` × 1). Centralize in a constant so all token issuers stay in sync if you change it.

### L-4. `productionBrowserSourceMaps: false` ✅
Already set. Good.

### L-5. `Sentry` PII scrub in mobile ✅
`apps/mobile/lib/core/monitoring/sentry_setup.dart:107` filters keys containing `secret`. Confirm it also filters `password`, `accessToken`, `tempPassword`. Add explicit list.

### L-6. `flutter_secure_storage` for auth tokens ✅
`apps/mobile/lib/core/auth_repository.dart` uses keychain on iOS, EncryptedSharedPreferences on Android. Good.

### L-7. Security headers in `next.config.mjs` ✅
HSTS preload, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy all set. CSP needs nonce upgrade (M-3) but baseline is in place.

### L-8. `productionBrowserSourceMaps`, `poweredByHeader` off ✅
Both set in `next.config.mjs`.

### L-9. `crypto.timingSafeEqual` on Razorpay webhook ✅
`checkout.service.ts:427-433` does length-check + constant-time compare. Good.

### L-10. `queryRawUnsafe` in milestone-rewards uses code-controlled identifier
`apps/api/src/modules/milestone-rewards/milestone-rewards.service.ts:111` interpolates `counterField` into SQL. The value is one of `"webCounter"` / `"appCounter"` from a literal `if/else`, not user input. Safe but worth a comment.

### L-11. ValidationPipe double-runs with Zod pipes
Global `ValidationPipe({ whitelist, transform, forbidNonWhitelisted })` plus per-route `ZodValidationPipe` — both fire. Consistent but redundant; standardize on Zod and remove the global class-validator pipe to reduce attack surface from class-validator vulnerabilities.

---

## Already mitigated (no action)

- ✅ `assertProductionSecrets()` in `main.ts:52-81` fails startup on missing/weak `JWT_*_SECRET`, `FILES_SIGNING_SECRET`, `DATABASE_URL`.
- ✅ Argon2id password hashing throughout (`team.service.ts`, `auth-b2b.service.ts`).
- ✅ HMAC-signed file URLs with TTL (`files.service.ts`).
- ✅ MIME-type whitelist + 25 MB size cap on uploads (`files.controller.ts:37-63`).
- ✅ Razorpay signature verification on payment capture **and** webhook with constant-time compare.
- ✅ Apple Sign-In token verification via JWKS lookup (`auth-b2c.service.ts:175-291`).
- ✅ Phone-OTP code is hashed at rest (`crypto.createHash("sha256")`) and consumed atomically.
- ✅ Strict CORS allowlist; chrome-extension scheme explicitly opted-in for the review-grabber.
- ✅ SQL: 99% Prisma typed queries; only one `$queryRawUnsafe` and its interpolated value is code-controlled.
- ✅ Flutter token in keychain / EncryptedSharedPreferences (`flutter_secure_storage`).
- ✅ App-store-ready: HTTPS-only `App Transport Security` (Apple) + `usesCleartextTraffic=false` (Android) — confirm in `Info.plist` / `AndroidManifest.xml` before submission.

---

## Action items, prioritized

| # | Severity | Item | Status |
|---|---|---|---|
| 1 | 🟥 | Register `ThrottlerGuard` globally; add `@Throttle()` to `/auth/b2b/login`, `/set-password`, `/bootstrap`. | ✅ done |
| 2 | 🟥 | Reject deactivated users in `jwt-b2b.strategy.ts:validate()`. | ✅ done |
| 3 | 🟥 | Replace `setPassword(email,password)` with invite-token flow. Delete the legacy `auth-b2b.service.invite()`. | ✅ done |
| 4 | 🟥 | Move bootstrap behind `BOOTSTRAP_SECRET` env var + per-hour throttle. | ✅ done |
| 5 | 🟧 | Wrap every `dangerouslySetInnerHTML` of admin-supplied content in `isomorphic-dompurify`. Sanitize server-side on write too. | ✅ done |
| 6 | 🟧 | Remove the `?? "dev-b2b"` / `?? "dev-b2c"` fallbacks in JWT strategies. | ✅ done |
| 7 | 🟧 | Add private-IP/SSRF filter to `files.service.ts:uploadFromUrl`. | ✅ done |
| 8 | 🟧 | Strip `tempPassword` from Sentry breadcrumbs; switch to invite-token. | ✅ done |
| 9 | 🟨 | Tighten body-parser limit to 1 MB default, with per-route overrides. | ✅ done |
| 10 | 🟨 | Normalize email lowercase on every auth-b2b read; add `LOWER(email)` unique index. | ✅ done (read-side; DB index TODO) |
| 11 | 🟨 | Bind X-Cart-Session uploads to a real cart row + per-session daily byte budget. | ✅ done |
| 12 | 🟨 | Length-check buffers before `timingSafeEqual` in `files.service.ts:verify`. | ✅ done |
| 13 | 🟨 | Migrate CSP to nonce-based; drop `unsafe-inline` / `unsafe-eval`. | ✅ done (nonce + strict-dynamic) |
| 14 | 🟨 | Load Razorpay key-ID from `/api/settings/public` in Flutter. | ✅ done |
| 15 | 🟦 | Tighten Sentry PII scrubber (mobile) — add `password`, `tempPassword`, `accessToken`. | ✅ done |
| 16 | 🟦 | Document trade-off / plan for migrating tokens from `localStorage` → httpOnly cookies. | open (low priority) |
| 17 | 🟦 | Audit Apple ATS + Android `usesCleartextTraffic` before submission. | open (release-time check) |

All 🟥/🟧/🟨 items closed in this branch. Remaining 🟦 items are documentation /
release-time checks rather than code changes.

---

## Verification checklist

After fixes land, run through these one-by-one before signing off:

- [ ] `curl -X POST /api/auth/b2b/login` 12× from one IP → expect `429` after 5.
- [ ] `curl -X POST /api/auth/b2b/bootstrap` without `BOOTSTRAP_SECRET` → expect `403`.
- [ ] Deactivate a team member, then call `/api/auth/b2b/me` with their token → expect `401`.
- [ ] Inject `<img src=x onerror=alert(1)>` into a product description as a low-privilege admin → render the product page; nothing fires (sanitized).
- [ ] `curl -d '{"url":"http://169.254.169.254/"}' /api/files/upload-from-url -H 'Authorization: Bearer …'` → expect `400`.
- [ ] In dev console: `localStorage.getItem('gifteeng.b2b.token')` after a content-editor login → token visible (current state). Document for httpOnly migration.
- [ ] Hit `/api/auth/b2c/otp/request` 10× from one IP → expect `429` after 5.
- [ ] Upload a 26 MB image → expect `413`.
- [ ] Upload `index.html` → expect `400 File type not allowed`.
- [ ] Submit a forged Razorpay signature → expect `401 Invalid signature`.

---

## Threat-model summary

The platform's biggest residual exposure is **stored-XSS → admin-account takeover**:
content editors edit HTML, which renders raw to every customer, and **all** tokens are in `localStorage`. Closing finding H-1 is the single largest risk-reduction.

Second-biggest is **B2B brute-force** — fixed cheaply by C-1 + C-2.

Third is **invite-flow account takeover** (C-3) — fixed by switching to a token-based invite. Already partially mitigated because the new flow seeds a temp password, but the legacy unguarded `setPassword` route is still exposed.

Once those three are closed the platform's security posture is industry-standard for an e-commerce stack of this size.
