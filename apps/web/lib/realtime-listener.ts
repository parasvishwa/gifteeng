"use client";

// Shared hook for components that want to refetch when a particular
// realtime scope is invalidated. RealtimeSync (mounted in the b2c layout)
// dispatches `gifteeng:invalidate` window events with `{ scope }` whenever
// the SSE stream reports a change. Page components subscribe via this hook:
//
//   useRealtimeRefresh("cart", () => loadCart());
//
// The callback also fires on tab focus (RealtimeSync re-broadcasts every
// scope on visibility change), so SSE-suspended sessions catch up too.

import { useEffect } from "react";

export type RealtimeScope =
  | "cart"
  | "wishlist"
  | "goins"
  | "orders"
  | "profile";

export function useRealtimeRefresh(
  scope: RealtimeScope | RealtimeScope[],
  refetch: () => void,
) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const scopes = Array.isArray(scope) ? scope : [scope];
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.scope && scopes.includes(detail.scope)) refetch();
    };
    window.addEventListener("gifteeng:invalidate", handler as EventListener);
    return () => window.removeEventListener("gifteeng:invalidate", handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(scope) ? scope.join(",") : scope]);
}
