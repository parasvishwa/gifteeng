"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartItemInput } from "@gifteeng/shared";
import {
  cartFetch,
  ensureCartSessionKey,
  getB2cToken,
} from "@/lib/api";
import { deflateCustomization } from "@/lib/customization-deflate";

export type CartLine = {
  id?: string; // server-side CartItem id (present after sync)
  /**
   * Client-only marker for in-flight optimistic adds. While `_pending`
   * is set, the row hasn't been confirmed by the server yet — the
   * reconcile step preserves these rows so they don't disappear if an
   * SSE invalidate fires before the POST returns. Cleared when the
   * POST succeeds (id assigned) or removed entirely if it fails.
   */
  _pending?: string;
  productId: string;
  slug?: string; // product slug — needed for "Edit design" link back to /customize/<slug>
  title: string;
  priceLabel: string;
  quantity: number;
  image?: string; // first product image URL — shown as thumbnail in cart
  variantOptions?: Record<string, string>;
  customization?: unknown;
};

export type CartAddons = {
  giftWrap: boolean;
  giftWrapPrice: number; // loaded from admin settings
  thankYouMessage: string;
  thankYouTemplateId: string | null;
  coinsToRedeem: number;
  coinDiscountInr: number; // resolved from /api/coins/validate-redeem
};

type ServerVariantOption = {
  name: string;
  value: string;
  image?: string | null;
  images?: string[] | null;
  priceDelta?: string | number | null;
};

type ServerProduct = {
  slug?: string;
  title?: string;
  basePrice?: string | number;
  currency?: string;
  images?: Array<{ url?: string } | string> | null;
  variantOptions?: ServerVariantOption[] | null;
};

type ServerCartItem = {
  id: string;
  productId: string;
  qty: number;
  variantOptions?: Record<string, string> | null;
  customization?: unknown;
  product?: ServerProduct;
};

type ServerCart = {
  id: string;
  items: ServerCartItem[];
};

// ── Helpers: pick variant-aware display fields from a server cart row ────────
function pickServerImage(it: ServerCartItem, prevImage?: string): string | undefined {
  const opts = it.variantOptions ?? null;
  const variants = it.product?.variantOptions ?? [];
  if (opts && variants.length > 0) {
    for (const [k, v] of Object.entries(opts)) {
      const found = variants.find((pv) => pv.name === k && pv.value === v);
      const img = (found?.images && found.images[0]) || found?.image || null;
      if (img) return img;
    }
  }
  const first = it.product?.images && it.product.images[0];
  if (typeof first === "string") return first;
  if (first && typeof first === "object" && "url" in first && typeof first.url === "string") return first.url;
  return prevImage;
}

function pickServerPriceLabel(it: ServerCartItem, currency = "₹", prevLabel = ""): string {
  const opts = it.variantOptions ?? null;
  const variants = it.product?.variantOptions ?? [];
  if (opts && variants.length > 0) {
    for (const [k, v] of Object.entries(opts)) {
      const found = variants.find((pv) => pv.name === k && pv.value === v);
      const d = found?.priceDelta;
      if (d !== undefined && d !== null) {
        const n = typeof d === "string" ? parseFloat(d) : d;
        if (Number.isFinite(n) && n > 0) return `${currency}${n}`;
      }
    }
  }
  const base = it.product?.basePrice;
  if (base !== undefined && base !== null) {
    const n = typeof base === "string" ? parseFloat(base) : base;
    if (Number.isFinite(n) && n > 0) return `${currency}${n}`;
  }
  return prevLabel;
}

const defaultAddons: CartAddons = {
  giftWrap: false,
  giftWrapPrice: 49,
  thankYouMessage: "",
  thankYouTemplateId: null,
  coinsToRedeem: 0,
  coinDiscountInr: 0,
};

type CartState = {
  items: CartLine[];
  addons: CartAddons;
  sessionKey: string | null;
  ensureSession: () => string;
  addItem: (line: CartLine) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  removeItemAt: (idx: number) => Promise<void>; // removes by array index — safe for duplicate productIds
  clear: () => void;
  reconcileFromServer: (cart: ServerCart) => void;
  setAddon: <K extends keyof CartAddons>(key: K, value: CartAddons[K]) => void;
  resetAddons: () => void;
};

function isAuthed(): boolean {
  return !!getB2cToken();
}

// ── Customization preview is HUGE (a base64 PNG can be 2-5 MB) — keep it
// LOCAL only. Server-side customization just needs canvasJSON + zone defs
// for re-rendering at checkout. Stripping the previewDataUrl shrinks the
// posted payload from ~5 MB to a few KB and prevents /cart fetches on
// other devices from timing out / blowing past dio buffers.
//
// The client-side preview survives across reloads via the zustand persist
// middleware (localStorage). For items that arrived from another device
// (no previewDataUrl available), the cart UI falls back to the parent
// product image, which is fine — the user sees the right product, just
// not their personal preview thumbnail.
function stripPreviewForServer(c: unknown): unknown {
  if (!c || typeof c !== "object") return c;
  const src = c as Record<string, unknown>;
  const out: Record<string, unknown> = { ...src };
  if ("previewDataUrl" in out) delete out.previewDataUrl;
  if (Array.isArray(src.designs)) {
    out.designs = src.designs.map((d) => {
      if (!d || typeof d !== "object") return d;
      const dd = { ...(d as Record<string, unknown>) };
      if ("previewDataUrl" in dd) delete dd.previewDataUrl;
      return dd;
    });
  }
  return out;
}

function toCartItemInput(line: CartLine): CartItemInput {
  return {
    productId: line.productId,
    qty: line.quantity,
    variantOptions: line.variantOptions,
    customization: stripPreviewForServer(line.customization),
  };
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addons: defaultAddons,
      sessionKey: null,

      ensureSession: () => {
        const key = ensureCartSessionKey();
        if (key && get().sessionKey !== key) {
          set({ sessionKey: key });
        }
        return key;
      },

      setAddon: (key, value) => {
        set((state) => ({ addons: { ...state.addons, [key]: value } }));
      },

      resetAddons: () => {
        set({ addons: defaultAddons });
      },

      addItem: async (line) => {
        // Tag the optimistic row with a unique `_pending` key so we can
        // find it later by tag (immune to array-index shifts caused by
        // any reconcile that races with our POST). Reconcile preserves
        // rows with `_pending` set instead of wiping them when no
        // matching server row exists yet.
        const hasCustomization = line.customization != null;
        const pendingKey = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

        set((state) => {
          const existing = hasCustomization
            ? null
            : state.items.find(
                (i) =>
                  i.productId === line.productId &&
                  i.customization == null &&
                  JSON.stringify(i.variantOptions ?? null) ===
                    JSON.stringify(line.variantOptions ?? null),
              );
          if (existing) {
            // For mergeable plain items just bump quantity — no pending tag,
            // because the merged row's POST will fire below and either
            // succeeds (no-op locally) or fails (we revert the bump).
            return {
              items: state.items.map((i) =>
                i === existing ? { ...i, quantity: i.quantity + line.quantity } : i,
              ),
            };
          }
          return { items: [...state.items, { ...line, _pending: pendingKey }] };
        });

        try {
          // De-flate the customization first: hoist every embedded
          // `data:image/…` into /api/files and replace with a URL. This
          // turns multi-MB cart payloads into a few KB regardless of which
          // customizer path produced the design (Fabric canvas, simple
          // zones, clipboard paste, drag-drop). Idempotent for designs
          // that already reference URLs.
          const deflatedCustomization = hasCustomization
            ? await deflateCustomization(line.customization)
            : line.customization;
          const wireLine: CartLine = { ...line, customization: deflatedCustomization };
          const body = JSON.stringify(toCartItemInput(wireLine));
          const path = isAuthed() ? "/cart/items" : "/cart/guest/items";
          const row = await cartFetch<{ id?: string }>(path, {
            method: "POST",
            body,
            authed: isAuthed(),
          });
          // Patch the server-assigned id and clear the _pending flag.
          set((state) => ({
            items: state.items.map((i) =>
              i._pending === pendingKey
                ? { ...i, id: row?.id ?? i.id, _pending: undefined }
                : i,
            ),
          }));
        } catch (err) {
          // POST failed → roll back the optimistic add so the row doesn't
          // sit forever in a "pending" state and then vanish on the next
          // reconcile, which is the worst-of-both-worlds UX (looks added,
          // disappears later). Customer needs to retry.
          // eslint-disable-next-line no-console
          console.error("[cart] addItem failed", err);
          set((state) => ({
            items: state.items.filter((i) => i._pending !== pendingKey),
          }));
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("gifteeng:cart-error", {
                detail: { kind: "add", error: err },
              }),
            );
          }
          throw err;
        }
      },

      removeItem: async (productId) => {
        // removeItem removes by productId — only the FIRST match to avoid wiping
        // multiple customized items that share the same productId.
        const before = get().items;
        const targetIdx = before.findIndex((i) => i.productId === productId);
        if (targetIdx === -1) return;
        const target = before[targetIdx];
        set({ items: before.filter((_, i) => i !== targetIdx) });

        if (!target?.id) return;
        try {
          if (isAuthed()) {
            await cartFetch(`/cart/items/${target.id}`, { method: "DELETE", authed: true });
          } else {
            await cartFetch(`/cart/guest/items/${target.id}`, { method: "DELETE" });
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[cart] removeItem failed", err);
        }
      },

      removeItemAt: async (idx) => {
        // Remove by array index — the only safe way when multiple customized
        // items share the same productId.
        const before = get().items;
        const target = before[idx];
        if (!target) return;
        set({ items: before.filter((_, i) => i !== idx) });

        if (!target.id) return;
        try {
          if (isAuthed()) {
            await cartFetch(`/cart/items/${target.id}`, { method: "DELETE", authed: true });
          } else {
            await cartFetch(`/cart/guest/items/${target.id}`, { method: "DELETE" });
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[cart] removeItemAt failed", err);
        }
      },

      clear: () => {
        set({ items: [], addons: defaultAddons });
        // Fire-and-forget: also wipe the server cart so stale items can't
        // come back via reconcileFromServer on the next login.
        if (isAuthed()) {
          cartFetch("/cart/items", { method: "DELETE", authed: true }).catch(() => {});
        }
      },

      reconcileFromServer: (cart) => {
        // For LOGGED-IN customers, the server is the canonical truth — every
        // cross-device add/remove is mirrored back here via SSE. For GUESTS
        // (no token), the only authoritative cart is localStorage, so we
        // leave the local state alone unless the server has merged guest
        // items in (cart has items + we know we're authed).
        const authed = isAuthed();

        if (!authed) {
          // Guest path: only patch server-side IDs onto the existing local
          // items. Never pull rows from the server because there's no
          // sensible "merge" without auth.
          if (!cart.items || cart.items.length === 0) return;
          set((state) => ({
            items: state.items.map((li) => {
              const si = cart.items.find(
                (s) =>
                  s.productId === li.productId &&
                  JSON.stringify(s.variantOptions ?? null) ===
                    JSON.stringify(li.variantOptions ?? null),
              );
              return si ? { ...li, id: si.id } : li;
            }),
          }));
          return;
        }

        // Authed path: server is canonical for items that have an id.
        // Optimistic in-flight rows (`_pending` set) are PRESERVED so a
        // concurrent SSE invalidate doesn't wipe a row whose POST hasn't
        // landed yet. They re-merge on the next reconcile after the POST
        // returns and stamps the id.
        //
        // Matching priority for non-pending rows:
        //   1. by server id
        //   2. by productId + variantOptions + customization-shape
        //      (customised local rows never collide with non-customised
        //       server rows for the same product, and vice versa).
        set((state) => {
          const pending = state.items.filter((li) => li._pending);
          const settled = state.items.filter((li) => !li._pending);

          const byId = new Map<string, CartLine>();
          const byKey = new Map<string, CartLine[]>();
          const keyFor = (
            productId: string,
            variantOptions: unknown,
            customization: unknown,
          ) =>
            `${productId}::${JSON.stringify(variantOptions ?? null)}::${customization == null ? "0" : "1"}`;
          for (const li of settled) {
            if (li.id) byId.set(li.id, li);
            const k = keyFor(li.productId, li.variantOptions, li.customization);
            const arr = byKey.get(k) ?? [];
            arr.push(li);
            byKey.set(k, arr);
          }

          const reconciled: CartLine[] = cart.items.map((it) => {
            let prev = byId.get(it.id);
            if (!prev) {
              const k = keyFor(it.productId, it.variantOptions, it.customization);
              const arr = byKey.get(k);
              prev = arr?.shift();
            }
            const currency = it.product?.currency === "USD" ? "$" : "₹";
            // Prefer local customization when it has a previewDataUrl
            // we'd otherwise lose — server's stripped copy won't.
            const localCustHasPreview =
              prev?.customization &&
              typeof prev.customization === "object" &&
              ("previewDataUrl" in (prev.customization as Record<string, unknown>) ||
                Array.isArray((prev.customization as Record<string, unknown>).designs));
            return {
              id: it.id,
              productId: it.productId,
              slug: prev?.slug ?? it.product?.slug,
              title: prev?.title || (it.product?.title ?? ""),
              priceLabel: pickServerPriceLabel(it, currency, prev?.priceLabel ?? ""),
              image: pickServerImage(it, prev?.image),
              quantity: it.qty,
              variantOptions: (it.variantOptions ?? undefined) as Record<string, string> | undefined,
              customization: localCustHasPreview ? prev!.customization : it.customization,
            };
          });
          // Append still-pending optimistic rows to the end so they remain
          // visible while their POST is in flight.
          return { items: [...reconciled, ...pending] };
        });
      },
    }),
    {
      name: "gifteeng.cart",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items,
        sessionKey: state.sessionKey,
        addons: state.addons,
      }),
    },
  ),
);

export async function onB2cLogin(_sessionKey?: string): Promise<void> {
  try {
    const cart = await cartFetch<ServerCart>("/cart", {
      method: "GET",
      authed: true,
    });
    useCartStore.getState().reconcileFromServer(cart);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[cart] reconcile on login failed", err);
  }
}
