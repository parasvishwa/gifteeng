import { createApiClient, type ApiClient, ApiError } from "@gifteeng/shared";

// Browser → same-origin (Next.js rewrites proxy /api/* to the internal API server).
// Server  → direct internal call to the API process.
export const API_BASE_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000");

const SESSION_STORAGE_KEY = "gifteeng.cart.session";
const B2C_TOKEN_KEY = "gifteeng.b2c.token";

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readToken(key: string): string | null {
  return readStorage(key);
}

export function ensureCartSessionKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing && existing.length > 0) return existing;
    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.localStorage.setItem(SESSION_STORAGE_KEY, generated);
    return generated;
  } catch {
    return "";
  }
}

export function getCartSessionKey(): string | null {
  return readStorage(SESSION_STORAGE_KEY);
}

export function getB2cToken(): string | null {
  return readStorage(B2C_TOKEN_KEY);
}

/**
 * Standard authenticated B2C client. Callers that need to forward a cart
 * session header (e.g. cart add/remove while logged in) should pass the
 * header via the raw `request` helper or use `cartFetch` below.
 */
export function apiB2c(): ApiClient {
  return createApiClient({
    baseUrl: API_BASE_URL,
    audience: "b2c",
    getToken: () => readToken(B2C_TOKEN_KEY),
  });
}

/**
 * Guest B2C client — never sends Authorization, always sends X-Cart-Session.
 * Because the shared client doesn't expose per-request extra headers, we use
 * `cartFetch` directly from the store for cart mutations.
 */
export function apiB2cGuest(): ApiClient {
  return createApiClient({
    baseUrl: API_BASE_URL,
    audience: "b2c",
    getToken: () => null,
  });
}

export function apiB2b(): ApiClient {
  return createApiClient({
    baseUrl: API_BASE_URL,
    audience: "b2b",
    getToken: () => readToken("gifteeng.b2b.token"),
  });
}

/**
 * Low-level fetch for cart endpoints. Always sets X-Cart-Session (ensuring
 * one exists), and conditionally attaches the B2C bearer token when present.
 */
export async function cartFetch<T>(
  path: string,
  init?: RequestInit & { authed?: boolean },
): Promise<T> {
  const sessionKey = ensureCartSessionKey();
  const token = init?.authed ? getB2cToken() : null;
  // NestJS is mounted under the global /api prefix. Browser fetches go via
  // Next.js rewrites at /api/*, and server-side direct calls also hit /api/*.
  const fullPath = path.startsWith("/api/") || path.startsWith("api/")
    ? path
    : `/api${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(new URL(fullPath, API_BASE_URL).toString(), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Audience": "b2c",
      "X-Cart-Session": sessionKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}
