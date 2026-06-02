"use client";

// ── Seller portal API client ───────────────────────────────────────────────
// Same-origin: the Next.js rewrite proxies /api/* to the API server, so the
// seller portal works on any host without a baked base URL.

const TOKEN_KEY    = "gifteeng.seller.token";
const ONBOARD_KEY  = "gifteeng.seller.onboardToken";

export function getSellerToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setSellerToken(token: string): void {
  if (typeof window !== "undefined") window.localStorage.setItem(TOKEN_KEY, token);
}
export function clearSellerToken(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(ONBOARD_KEY);
  }
}
export function getOnboardToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ONBOARD_KEY);
}
export function setOnboardToken(token: string): void {
  if (typeof window !== "undefined") window.localStorage.setItem(ONBOARD_KEY, token);
}

interface SellerApiError { status: number; message: string }

async function request<T>(
  path: string,
  init: RequestInit & { auth?: "seller" | "onboard" | "none" } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const mode = init.auth ?? "seller";
  if (mode === "seller") {
    const t = getSellerToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  } else if (mode === "onboard") {
    const t = getOnboardToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(`/api${path}`, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err: SellerApiError = {
      status: res.status,
      message: (data?.message as string) ?? `Request failed (${res.status})`,
    };
    throw err;
  }
  return data as T;
}

export const sellerApi = {
  get:  <T>(p: string, auth: "seller" | "onboard" | "none" = "seller") =>
          request<T>(p, { method: "GET", auth }),
  post: <T>(p: string, body: unknown, auth: "seller" | "onboard" | "none" = "seller") =>
          request<T>(p, { method: "POST", body: JSON.stringify(body), auth }),
  patch:<T>(p: string, body: unknown, auth: "seller" | "onboard" | "none" = "seller") =>
          request<T>(p, { method: "PATCH", body: JSON.stringify(body), auth }),
  del:  <T>(p: string, auth: "seller" | "onboard" | "none" = "seller") =>
          request<T>(p, { method: "DELETE", auth }),
};
