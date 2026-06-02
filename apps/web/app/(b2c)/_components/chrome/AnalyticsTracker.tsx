"use client";

/**
 * AnalyticsTracker — fires every page view + provides a global track() API
 * for one-off events (add_to_cart, purchase, error, etc).
 *
 * Always uses same-origin /api (Next.js rewrites proxy to backend), so it
 * works in any environment without CORS surprises.
 *
 * Logged-in customers: reads JWT from localStorage and sends in
 * Authorization header — the API decodes `sub` and attributes events.
 *
 * Other code can fire events via `window.gifteengTrack(event, props)` —
 * the global is set up here so any component can use it without imports.
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

declare global {
  interface Window {
    gifteengTrack?: (event: string, props?: Record<string, unknown>) => void;
  }
}

function getSessionId(): string {
  const key = "gifteeng.sid";
  try {
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch { return "anon"; }
}

function getB2cToken(): string | null {
  try { return localStorage.getItem("gifteeng.b2c.token"); }
  catch { return null; }
}

function track(event: string | null, props: Record<string, unknown> | undefined, path: string) {
  // Always relative — Next.js rewrites /api/* to the API server, so this is
  // same-origin and works without CORS regardless of environment.
  const url = "/api/analytics/track";
  const token = getB2cToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  fetch(url, {
    method:    "POST",
    headers,
    keepalive: true,
    body: JSON.stringify({
      sessionId: getSessionId(),
      path,
      event,
      props,
      platform:  "web",
      referrer:  typeof document !== "undefined" ? document.referrer || undefined : undefined,
    }),
  }).catch(() => {});
}

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const prevPath = useRef("");

  // Page-view tracker — fires every time the path changes.
  useEffect(() => {
    if (pathname === prevPath.current) return;
    prevPath.current = pathname;
    track(null, undefined, pathname);
  }, [pathname]);

  // Expose a global track() so any component can fire custom events.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.gifteengTrack = (event: string, props?: Record<string, unknown>) => {
      track(event, props, window.location.pathname);
    };
  }, []);

  // ── Global error tracker — every uncaught fetch/JS error reaches here.
  //
  // Noise we explicitly drop (these are not bugs in OUR code):
  //   - MetaMask / Phantom / Coinbase / Rabby / Trust / Brave-shield —
  //     wallet extensions inject content scripts on every page and
  //     error out when a site doesn't request them. Pollutes the feed.
  //   - "ResizeObserver loop limit exceeded" — benign Chromium quirk.
  //   - "Script error." — cross-origin exceptions whose message is
  //     stripped by the browser. Useless without a stack.
  //   - React minified errors fired from extension-injected code (we
  //     keep ours by checking the path in the message).
  const isExtensionNoise = (msg: string): boolean => {
    const m = msg.toLowerCase();
    return (
      m.includes("metamask") ||
      m.includes("phantom") ||
      m.includes("coinbase") ||
      m.includes("trust wallet") ||
      m.includes("rabby") ||
      m.includes("ethereum") && m.includes("provider") ||
      m.includes("resizeobserver loop") ||
      m === "script error." ||
      m.startsWith("uncaught (in promise) o") || // common minified extension throw
      // Chrome / Firefox / Safari extension scheme strings appearing in stacks
      m.includes("chrome-extension://") ||
      m.includes("moz-extension://") ||
      m.includes("safari-web-extension://")
    );
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onError = (e: ErrorEvent) => {
      const msg = (e.message ?? "").slice(0, 200);
      const sourceFile = (e.filename ?? "").toLowerCase();
      // Skip if the error came from an extension's injected script,
      // OR if the message itself smells like extension noise.
      if (sourceFile.startsWith("chrome-extension:") ||
          sourceFile.startsWith("moz-extension:") ||
          sourceFile.startsWith("safari-web-extension:") ||
          isExtensionNoise(msg)) {
        return;
      }
      track("error", { type: "js", message: msg, path: window.location.pathname },
            window.location.pathname);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason instanceof Error ? e.reason.message : String(e.reason ?? "");
      const trimmed = reason.slice(0, 200);
      if (isExtensionNoise(trimmed)) return;
      track("error", { type: "promise", message: trimmed, path: window.location.pathname },
            window.location.pathname);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // ── Fetch wrapper — auto-track ALL API errors, including those handled
  // by component try/catch (e.g. "Failed to fetch" alerts). Without this,
  // forms that show their own error messages never bubble up to the feed.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as unknown as { __gifteengFetchWrapped?: boolean }).__gifteengFetchWrapped) return;
    (window as unknown as { __gifteengFetchWrapped?: boolean }).__gifteengFetchWrapped = true;

    const original = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL ? input.href
        : (input as Request).url;
      const method = (init?.method ?? (input as Request)?.method ?? "GET").toUpperCase();

      // Skip the analytics endpoint itself to avoid recursion
      if (url.includes("/analytics/")) return original(input as Request, init);

      try {
        const res = await original(input as Request, init);
        // 4xx/5xx — these are caught by component try/catch as "ok=false"
        // but rarely re-tracked. We log them automatically.
        if (!res.ok && url.includes("/api/")) {
          // Skip expected auth failures so the error feed isn't filled
          // with noise every time a logged-out user hits a guarded
          // route. 401/403 on /api/admin/*, /api/me/*, and on SSE /events
          // are normal control flow — the page will redirect to login.
          const path = (() => {
            try { return new URL(url, window.location.origin).pathname; }
            catch { return url; }
          })();
          const isAuthCheckEndpoint =
            path.startsWith("/api/admin/") ||
            path.startsWith("/api/me/") ||
            path.endsWith("/events");
          const isExpectedAuthFail =
            (res.status === 401 || res.status === 403) && isAuthCheckEndpoint;
          if (!isExpectedAuthFail) {
            let message = res.statusText || `HTTP ${res.status}`;
            try {
              const data = await res.clone().json();
              if (data?.message) message = String(data.message);
              else if (data?.error)   message = String(data.error);
            } catch { /* response wasn't JSON */ }
            track("error", {
              status:  res.status,
              method,
              path,
              message: message.slice(0, 200),
              type:    "http",
            }, window.location.pathname);
          }
        }
        return res;
      } catch (e) {
        // Skip user-initiated cancels (e.g. closed modal mid-request, route
        // change while polling). These aren't bugs — tracking them creates
        // noise in the feed and obscures real failures.
        const isAbort =
          e instanceof DOMException && e.name === "AbortError" ||
          (e as { name?: string })?.name === "AbortError";

        // Network failure / DNS / CORS / actual fetch crash
        // SSE endpoints intentionally close on logout / tab background /
        // network-flap and the RealtimeSync component reconnects — don't
        // pollute the error feed every time a stream drops.
        const path = (() => {
          try { return new URL(url, window.location.origin).pathname; }
          catch { return url; }
        })();
        const isSseEndpoint = path.endsWith("/events");

        // Endpoints that already render a graceful fallback when the
        // API is briefly unavailable (deploy windows, network blips).
        // Tracking them as "errors" creates noise in the activity feed
        // without surfacing anything actionable — the user sees the
        // fallback content with no awareness of the dropped request.
        // Real failures (cart, checkout, auth, payments) still track.
        const isFallbackOnFailEndpoint =
          path.startsWith("/api/settings/")     || // AnnouncementBar, marketing tags
          path.startsWith("/api/banners")       || // HeroSlider has fallback
          path.startsWith("/api/announcements") || // marquee bar
          path.startsWith("/api/testimonials")  || // home page strip
          path === "/api/health";                  // monitoring probe

        if (!isAbort && !isSseEndpoint && !isFallbackOnFailEndpoint && url.includes("/api/")) {
          const msg = e instanceof Error ? e.message : String(e ?? "");
          track("error", {
            status:  0,
            method,
            path,
            message: msg.slice(0, 200),
            type:    "network",
          }, window.location.pathname);
        }
        throw e; // preserve original behaviour for the caller's catch block
      }
    };
  }, []);

  return null;
}
