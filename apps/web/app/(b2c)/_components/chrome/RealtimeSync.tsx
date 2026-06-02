"use client";

// Realtime cross-device sync (#50).
//
// Opens an SSE connection to /api/me/events for the logged-in customer
// and re-broadcasts every `invalidate` event as a window CustomEvent
// `gifteeng:invalidate` with `{ scope }` in the detail. Other components
// (cart, wishlist, orders, goins) listen for this event and refetch.
//
// Also handles document-visibility / focus changes — when the tab returns
// to focus, force a full refresh in case SSE was suspended in background.

import { useEffect } from "react";
import { getB2cToken } from "@/lib/api";
import { onB2cLogin } from "@/lib/stores/cart";

type Scope =
  | "cart" | "wishlist" | "goins" | "orders" | "profile"
  | "products" | "categories" | "collections" | "customizer"
  | "banners"  | "announcements" | "settings"   | "homepage" | "testimonials";

function broadcast(scope: Scope) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("gifteeng:invalidate", { detail: { scope } }),
  );
  // Direct integrations — pull the canonical state from the server for
  // the consumers that don't have a useEffect listener (Zustand stores,
  // server-rendered pages that need a router.refresh()).
  if (scope === "cart") {
    // Only reconcile when the user is actually logged in — calling the
    // cart API without a token just spams 401s in the console.
    if (getB2cToken()) {
      onB2cLogin().catch(() => {});
    }
  }
}

export default function RealtimeSync() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let esUser:   EventSource | null = null;
    let esPublic: EventSource | null = null;
    let stopped = false;
    let backoffUser   = 1500;
    let backoffPublic = 1500;

    const wireListeners = (es: EventSource, kind: "user" | "public") => {
      es.addEventListener("ready", () => {
        if (kind === "user")  backoffUser   = 1500;
        else                  backoffPublic = 1500;
      });
      es.addEventListener("invalidate", (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data ?? "{}");
          const scope = data?.scope as Scope | undefined;
          if (scope) broadcast(scope);
        } catch { /* ignore parse error */ }
      });
    };

    const connectUser = () => {
      if (stopped) return;
      const token = getB2cToken();
      if (!token) {
        // No login → re-check in a minute (the public stream still runs).
        setTimeout(connectUser, 60_000);
        return;
      }
      // EventSource can't set headers — our /api/me/events route reads
      // the token from a ?token= query param fallback.
      esUser = new EventSource(`/api/me/events?token=${encodeURIComponent(token)}`);
      wireListeners(esUser, "user");
      esUser.onerror = () => {
        esUser?.close();
        if (stopped) return;
        setTimeout(connectUser, backoffUser);
        backoffUser = Math.min(backoffUser * 2, 30_000);
      };
    };

    const connectPublic = () => {
      if (stopped) return;
      // Public broadcast stream — anonymous, no auth. Picks up
      // catalog / banner / announcement / testimonial / customizer
      // edits made by admin in real time.
      esPublic = new EventSource(`/api/public/events`);
      wireListeners(esPublic, "public");
      esPublic.onerror = () => {
        esPublic?.close();
        if (stopped) return;
        setTimeout(connectPublic, backoffPublic);
        backoffPublic = Math.min(backoffPublic * 2, 30_000);
      };
    };

    connectUser();
    connectPublic();

    // Focus-pull fallback — when the tab regains visibility, force-refresh
    // every scope in case the SSE stream was suspended (mobile background,
    // sleep, network change). Also re-opens any closed stream.
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      ([
        "cart", "wishlist", "goins", "orders",
        "products", "categories", "collections", "banners",
        "announcements", "testimonials", "homepage",
        // "settings" intentionally omitted — it maps to /api/admin/settings
        // which requires B2B auth; broadcasting it on every tab-focus causes
        // 401 spam on the B2C frontend for anonymous visitors.
      ] as Scope[]).forEach(broadcast);
      if (!esUser   || esUser.readyState   === 2)   { esUser?.close();   connectUser();   }
      if (!esPublic || esPublic.readyState === 2)   { esPublic?.close(); connectPublic(); }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);

    return () => {
      stopped = true;
      esUser?.close();
      esPublic?.close();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, []);

  return null;
}
