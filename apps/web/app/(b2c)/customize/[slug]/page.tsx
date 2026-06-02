"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Copy, Loader2, Check, ShoppingCart, Sparkles, Plus, Download, ChevronDown } from "lucide-react";
import { CanvasEditor, SimpleZoneCustomizer } from "@gifteeng/ui";
import type { CanvasEditorChange, CanvasEditorProduct, MockupTemplate, SimpleZone, SimpleMaskSlot } from "@gifteeng/ui";
import { useCartStore } from "@/lib/stores/cart";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Design {
  id: string;
  change: CanvasEditorChange | null;
  initialJSON: string | null;
}

interface FetchedProduct extends CanvasEditorProduct {
  slug?: string;
  basePrice?: number;
  priceLabel?: string;
  currency?: string;
  isCustomizable?: boolean;
  mockupTemplates?: MockupTemplate[];
  metadata?: Record<string, unknown>;
}

const API = "";

const INTERNAL_HOSTS = ["217.216.59.87", "localhost", "127.0.0.1"];
function normaliseUrl(u: string): string {
  if (!u) return u;
  try {
    const parsed = new URL(u);
    if (INTERNAL_HOSTS.some(h => parsed.hostname === h || parsed.hostname.startsWith(h + ":"))) {
      // Strip host → relative path → served via Next.js proxy (same-origin, no CORS)
      return parsed.pathname + (parsed.search ?? "");
    }
    return u;
  } catch {
    return u.replace(/^https?:\/\/localhost:\d+/i, "");
  }
}

function priceNum(label: string): number {
  const n = parseFloat((label ?? "0").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CustomizePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = (params?.slug as string) ?? "";

  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const removeItemAt = useCartStore((s) => s.removeItemAt);
  const cartItems = useCartStore((s) => s.items);

  const [product, setProduct] = useState<FetchedProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addOK, setAddOK] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);


  // Multi-design slots
  const [designs, setDesigns] = useState<Design[]>([
    { id: "d1", change: null, initialJSON: null },
  ]);
  const [activeIdx, setActiveIdx] = useState(0);

  // ── Editor mode detection ─────────────────────────────────────────────────
  // "simple" → zone-based customizer (admin pre-configures image/text slots).
  // Detected via (in priority order):
  //   1) ?mode=simple query param (from product detail page)
  //   2) cart item's variantOptions (when restoring via ?cartIdx=N)
  //   3) product.metadata.customizer.canvas.editor === "simple"
  const modeQuery = (searchParams.get("mode") || "").toLowerCase();
  const cartIdxStr = searchParams.get("cartIdx");
  const editOrderId = searchParams.get("editOrderId");
  const editItemId  = searchParams.get("editItemId");
  const cartItem =
    cartIdxStr !== null ? cartItems[parseInt(cartIdxStr, 10)] : undefined;
  const cartVariantSimple = Array.isArray((cartItem as any)?.variantOptions)
    ? (cartItem as any).variantOptions.some((v: { value?: string }) =>
        (v?.value ?? "").toLowerCase().includes("simple"),
      )
    : false;
  // Admin saves to metadata.customizer = { editor, imageZones, ... } (flat, current format).
  // Older products may have used metadata.customizer.canvas = { ... } (nested, legacy).
  // Support both: try .canvas sub-key first; if absent use .customizer directly.
  const productMetaCanvas = (() => {
    const m = (product?.metadata ?? {}) as {
      customizer?: Record<string, unknown>;
    };
    const cust = (m.customizer ?? {}) as Record<string, unknown>;
    // If a 'canvas' sub-key exists and is an object, use it (legacy format).
    const nested = cust["canvas"];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return nested as {
        editor?: string;
        useProductImageAsBase?: boolean;
        baseImage?: string;
        overlayImage?: string;
        imageZones?: SimpleZone[];
        textZones?: SimpleZone[];
        masks?: SimpleMaskSlot[];
      };
    }
    // Otherwise the customizer object IS the canvas config (current flat format).
    return cust as {
      editor?: string;
      useProductImageAsBase?: boolean;
      baseImage?: string;
      overlayImage?: string;
      imageZones?: SimpleZone[];
      textZones?: SimpleZone[];
      masks?: SimpleMaskSlot[];
    };
  })();
  const productMetaSimple =
    (productMetaCanvas.editor ?? "").toLowerCase() === "simple";
  const editorMode: "full" | "simple" =
    modeQuery === "simple" || cartVariantSimple || productMetaSimple
      ? "simple"
      : "full";

  // Zones + base image for Simple mode
  const simpleImageZones: SimpleZone[] = Array.isArray(productMetaCanvas.imageZones)
    ? (productMetaCanvas.imageZones as SimpleZone[])
    : [];
  const simpleTextZones: SimpleZone[] = Array.isArray(productMetaCanvas.textZones)
    ? (productMetaCanvas.textZones as SimpleZone[])
    : [];
  // Phase 1: masks saved in the unified Customiser (mode=simple) need to render
  // on the customer side too. The schema is shared with Flutter (do NOT mutate
  // it) — we just read .masks[] and pass it through to SimpleZoneCustomizer.
  const simpleMasks: SimpleMaskSlot[] = Array.isArray(productMetaCanvas.masks)
    ? (productMetaCanvas.masks as SimpleMaskSlot[])
    : [];
  const simpleBaseImage =
    (productMetaCanvas.useProductImageAsBase === false && productMetaCanvas.baseImage)
      ? productMetaCanvas.baseImage
      : (product?.imageUrl ?? product?.image ?? "");
  // Simple mode now supports an overlay ("Top") layer just like Full mode,
  // so pass the admin-configured overlayImage through if present.
  const _overlay = (productMetaCanvas as { overlayImage?: unknown })?.overlayImage;
  const simpleOverlayImage: string | null =
    typeof _overlay === "string" && _overlay ? _overlay : null;

  // ── Restore canvas from cart "Edit design" link ───────────────────────────
  // The new customization payload stores ALL design slots in `designs[]`.
  // We restore the full tray so the user sees every personalised copy.
  // Backward-compat: old payloads only had a top-level `canvasJSON` field.
  //
  // IMPORTANT: cartItems starts as [] on first render because Zustand
  // hydrates from localStorage asynchronously. We depend on `cartItems` so
  // this effect re-runs once hydration completes, then a ref guards against
  // running more than once.
  const cartRestored = useRef(false);
  useEffect(() => {
    if (cartRestored.current) return;
    const cartIdxStr = searchParams.get("cartIdx");
    if (cartIdxStr === null) return;
    const cartIdx = parseInt(cartIdxStr, 10);
    if (!Number.isFinite(cartIdx)) return;
    const cartItem = cartItems[cartIdx];
    if (!cartItem) return; // not hydrated yet — wait for next render
    cartRestored.current = true;
    const c = cartItem.customization as {
      designs?: { canvasJSON?: string | null; previewDataUrl?: string | null }[];
      canvasJSON?: string;
    } | null;

    if (c?.designs && c.designs.length > 0) {
      // Multi-design restore: rebuild all slots from saved canvasJSONs
      const restored = c.designs.map((d, i) => ({
        id: `d${i + 1}_r`,
        change: null,
        initialJSON: d.canvasJSON ?? null,
      }));
      setDesigns(restored);
      setActiveIdx(0);
    } else if (c?.canvasJSON) {
      // Legacy single-design (backward compat with pre-bundle cart items)
      setDesigns([{ id: "d1", change: null, initialJSON: c.canvasJSON }]);
    }
  // cartItems is intentionally included so this re-runs after Zustand hydrates
  }, [cartItems, searchParams]);

  // ── Restore canvas from order "Edit design" link ──────────────────────────
  // Fetches the order item's saved customization and pre-fills the design tray.
  useEffect(() => {
    if (!editOrderId || !editItemId) return;
    const token = typeof window !== "undefined"
      ? localStorage.getItem("gifteeng.b2c.token")
      : null;
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/orders/b2c/mine/${editOrderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const order = await res.json() as { items?: { id: string; customization?: unknown }[] };
        const item = (order.items ?? []).find((i) => i.id === editItemId);
        if (!item?.customization) return;
        const c = item.customization as {
          designs?: { canvasJSON?: string | null; previewDataUrl?: string | null }[];
          canvasJSON?: string | null;
        };
        if (c?.designs && c.designs.length > 0) {
          setDesigns(c.designs.map((d, i) => ({
            id: `d${i + 1}_r`,
            change: null,
            initialJSON: d.canvasJSON ?? null,
          })));
          setActiveIdx(0);
        } else if (c?.canvasJSON) {
          setDesigns([{ id: "d1", change: null, initialJSON: c.canvasJSON }]);
        }
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load product ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const r = await fetch(`${API}/api/products/${slug}`);
        if (!r.ok) {
          setLoadError(r.status === 404 ? "Product not found" : "Failed to load product — please try again");
          return;
        }
        const raw = await r.json();
        const imgs = Array.isArray(raw.images) ? raw.images : [];
        const imageUrls: string[] = imgs.map((i: { url: string }) => normaliseUrl(i.url));
        const firstImage = imageUrls[0];
        const priceLabel =
          raw.priceLabel ??
          (raw.basePrice !== undefined
            ? `${raw.currency === "INR" ? "₹" : (raw.currency ?? "₹")}${parseFloat(String(raw.basePrice)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
            : "");
        setProduct({
          ...raw,
          imageUrl: firstImage ?? normaliseUrl(raw.imageUrl ?? ""),
          image: firstImage ?? normaliseUrl(raw.image ?? ""),
          priceLabel,
        });
      } catch {
        setLoadError("Network error — please check your connection and try again");
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const activeDesign = designs[activeIdx];
  const unitPrice = priceNum(product?.priceLabel ?? "0");
  const totalPrice = unitPrice * designs.length;
  const currency = product?.priceLabel?.match(/^[^\d]+/)?.[0]?.trim() ?? "₹";

  // ── Design handlers ───────────────────────────────────────────────────────
  const handleDesignChange = useCallback((change: CanvasEditorChange) => {
    setDesigns(prev => prev.map((d, i) => i === activeIdx ? { ...d, change } : d));
  }, [activeIdx]);

  const copyDesign = useCallback((idx: number) => {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    requestAnimationFrame(() => {
      setDesigns(prev => {
        const src = prev[idx];
        if (!src) return prev;
        const newDesign: Design = {
          id: `d${Date.now()}`,
          change: null,
          // Inherit the source's latest canvasJSON so the copy is identical.
          initialJSON: src.change?.canvasJSON ?? src.initialJSON ?? null,
        };
        const next = [...prev];
        next.splice(idx + 1, 0, newDesign);
        setActiveIdx(idx + 1);
        return next;
      });
    });
  }, []);

  const removeDesign = useCallback((idx: number) => {
    if (designs.length === 1) return;
    const next = designs.filter((_, i) => i !== idx);
    setDesigns(next);
    setActiveIdx(Math.min(activeIdx, next.length - 1));
  }, [designs, activeIdx]);

  // Safe tab switch: blur any active Fabric text-editing before switching so
  // the canvas fires text:editing:exited → onChange → saves latest state.
  // A rAF delay lets Fabric's own blur handler flush before React unmounts.
  const switchDesign = useCallback((i: number) => {
    if (i === activeIdx) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    requestAnimationFrame(() => setActiveIdx(i));
  }, [activeIdx]);

  // Adds a brand-new blank canvas tab (qty +1, different design).
  // Blur any active text-editing first so the current design's latest state
  // is captured (text:editing:exited → onChange) before we remount. Without
  // this, switching to the new tab can drop the previously-typed text and
  // makes "Add another design" feel broken on slow devices.
  const addBlankDesign = useCallback(() => {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    requestAnimationFrame(() => {
      setDesigns(prev => {
        const blank: Design = { id: `d${Date.now()}`, change: null, initialJSON: null };
        const next = [...prev, blank];
        // Set activeIdx to the new last item using prev.length (avoids closure
        // staleness when called twice in the same render tick).
        setActiveIdx(prev.length);
        return next;
      });
    });
  }, []);

  // ── Export / download active design as PNG or PDF ────────────────────────
  const onExport = useCallback(async (format: "png" | "pdf") => {
    const canvasJson = activeDesign.change?.canvasJSON ?? activeDesign.initialJSON;
    if (!canvasJson) return;
    setExporting(true);
    setShowExportMenu(false);
    try {
      const token = typeof window !== "undefined"
        ? localStorage.getItem("gifteeng.b2c.token")
        : null;
      const res = await fetch("/api/customizer/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          canvasJson: JSON.parse(canvasJson),
          width: 2400,
          height: 2400,
          format,
          productTitle: product?.title ?? product?.name ?? "design",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any)?.message ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const slug2 = (product?.title ?? product?.name ?? "design")
        .replace(/[^a-z0-9]/gi, "-")
        .toLowerCase();
      a.href = url;
      a.download = `${slug2}-print.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      if (typeof window !== "undefined") alert(e?.message || "Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }, [activeDesign, product]);

  // ── Add all designs to cart ───────────────────────────────────────────────
  // All designs are bundled into ONE cart item with qty = designs.length.
  // This way the cart shows "1 × Product (qty 3)" instead of "3 × Product (qty 1)".
  // "Edit design" reopens the customizer with the full multi-design tray restored.
  //
  // If the user arrived from cart's "Edit design" link (?cartIdx=N), the old
  // cart item is removed first to avoid creating a duplicate.
  const onSave = useCallback(async () => {
    if (!product || adding || addOK) return;
    setAdding(true);
    try {
      // Bundle ALL design slots into a single payload
      const designPayloads = designs.map(d => ({
        canvasJSON: d.change?.canvasJSON ?? d.initialJSON ?? null,
        previewDataUrl: d.change?.previewDataUrl || null, // || so "" is treated as missing
      }));
      const customizationPayload = {
        canvasJSON: designPayloads[0]?.canvasJSON ?? null,
        previewDataUrl: designPayloads[0]?.previewDataUrl || null,
        designs: designPayloads,
      };

      // ── Order-edit mode: PATCH the order item, then go back to order page ──
      if (editOrderId && editItemId) {
        const token = typeof window !== "undefined"
          ? localStorage.getItem("gifteeng.b2c.token")
          : null;
        const res = await fetch(`/api/orders/b2c/mine/${editOrderId}/items/${editItemId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ customization: customizationPayload }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as any)?.message ?? `Save failed (${res.status})`);
        }
        setAddOK(true);
        setTimeout(() => router.push(`/orders/${editOrderId}`), 800);
        return;
      }

      // ── Cart mode (normal + cart-edit) ─────────────────────────────────────
      if (cartIdxStr !== null) {
        const idx = parseInt(cartIdxStr, 10);
        if (Number.isFinite(idx)) {
          // Use removeItemAt so only the specific slot is removed,
          // not ALL items sharing the same productId.
          await removeItemAt(idx);
        }
      }

      await addItem({
        productId: product.id,
        slug: product.slug ?? slug,
        title: product.title ?? product.name ?? "Product",
        priceLabel: product.priceLabel ?? `${currency}${unitPrice}`,
        quantity: designs.length,
        image: product.imageUrl ?? product.image,
        customization: customizationPayload,
      } as any);

      setAddOK(true);
      setTimeout(() => router.push("/cart"), 800);
    } catch (e: any) {
      // addItem now throws when the POST fails (e.g. payload too large
      // because the canvas embeds large base64 images). Surface the
      // error so the customer doesn't see the row vanish silently
      // after a refresh / cart reconcile.
      const status = e?.status ?? e?.response?.status;
      const msg = status === 413
        ? "Your design is too large to save. Try fewer or smaller images."
        : (e?.message || "Could not save your design. Please try again.");
      // eslint-disable-next-line no-console
      console.error("[customize] save failed", e);
      if (typeof window !== "undefined") alert(msg);
    } finally {
      setAdding(false);
    }
  }, [product, adding, addOK, designs, addItem, removeItem, cartItems, cartIdxStr, editOrderId, editItemId, router, slug, currency, unitPrice]);


  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-6">
        <div>
          <p className="text-lg font-semibold mb-1">{loadError ?? "Product not found"}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {loadError && loadError !== "Product not found"
              ? "We're having trouble reaching our servers."
              : "This product may have been removed or the link is incorrect."}
          </p>
          <button onClick={() => router.back()} className="mt-4 text-sm text-primary underline">Go back</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen pt-20 md:pt-24 pb-28"
      style={{
        // Force the browser into light-mode rendering for this entire subtree
        // (affects native form controls, scrollbars, and Tailwind dark: variants
        //  that rely on `prefers-color-scheme` propagation via CSS `color-scheme`).
        colorScheme: "light",
        color: "#1a1525",
        background: "#f8f7ff",
        // Override every CSS variable the UI components consume so dark-mode
        // values set on :root/.dark never bleed into this page.
        ["--background" as any]: "30 20% 98%",
        ["--foreground" as any]: "240 12% 10%",
        ["--card" as any]: "0 0% 100%",
        ["--card-foreground" as any]: "240 12% 10%",
        ["--popover" as any]: "0 0% 100%",
        ["--popover-foreground" as any]: "240 12% 10%",
        ["--primary" as any]: "351 85% 58%",
        ["--primary-foreground" as any]: "0 0% 100%",
        ["--secondary" as any]: "30 15% 94%",
        ["--secondary-foreground" as any]: "240 12% 10%",
        ["--muted" as any]: "30 15% 95%",
        ["--muted-foreground" as any]: "240 5% 42%",
        ["--accent" as any]: "351 85% 96%",
        ["--accent-foreground" as any]: "351 85% 48%",
        ["--destructive" as any]: "0 84% 60%",
        ["--destructive-foreground" as any]: "0 0% 100%",
        ["--border" as any]: "30 10% 90%",
        ["--input" as any]: "30 10% 90%",
        ["--ring" as any]: "351 85% 58%",
      }}
    >

      {/* ── Top bar (sticks below global navbar) ── */}
      <div className="sticky top-[94px] md:top-[96px] z-20 backdrop-blur border-b shadow-sm"
        style={{ background: "rgba(255,255,255,0.96)", borderColor: "#f0ede8" }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-800 truncate">{product.title ?? product.name}</p>
            <p className="text-xs text-gray-400">Customise your product</p>
          </div>
          <p className="text-sm font-bold shrink-0" style={{ color: "hsl(351 85% 58%)" }}>{product.priceLabel}</p>
        </div>
      </div>

      {/* ── Canvas area ── */}
      <div className="max-w-2xl mx-auto px-0 sm:px-4 pt-4">
        <div className="sm:rounded-2xl border-y sm:border border-gray-100 bg-white overflow-hidden shadow-sm">
          {editorMode === "simple" ? (
            <SimpleZoneCustomizer
              key={activeDesign.id}
              product={product as CanvasEditorProduct}
              baseImage={simpleBaseImage}
              overlayImage={simpleOverlayImage}
              imageZones={simpleImageZones}
              textZones={simpleTextZones}
              masks={simpleMasks}
              initialCanvasJSON={activeDesign.change?.canvasJSON ?? activeDesign.initialJSON}
              onChange={handleDesignChange}
              fileUploadUrl="/api/files/upload"
            />
          ) : (
            <CanvasEditor
              key={activeDesign.id}
              product={product as CanvasEditorProduct}
              initialCanvasJSON={activeDesign.change?.canvasJSON ?? activeDesign.initialJSON}
              onChange={handleDesignChange}
              mode={editorMode}
              fileUploadUrl="/api/files/upload"
            />
          )}
        </div>
      </div>

      {/* ── Designs tray ── */}
      <div className="max-w-2xl mx-auto px-4 mt-4">
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
              {designs.length} {designs.length === 1 ? "Design" : "Designs"} · {designs.length === 1 ? "1 item" : `${designs.length} items`}
            </p>
            <button
              onClick={addBlankDesign}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:opacity-80 transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" />
              Add another design
            </button>
          </div>

          {/* Thumbnails */}
          <div className="flex gap-3 p-3 overflow-x-auto" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
            {designs.map((d, i) => (
              <div key={d.id} className="shrink-0 flex flex-col items-center gap-1.5">
                {/* Thumb */}
                <button
                  onClick={() => switchDesign(i)}
                  className={`w-16 h-16 rounded-xl border-2 overflow-hidden transition-all ${
                    i === activeIdx
                      ? "border-primary shadow-sm"
                      : "border-border/50 hover:border-primary/40"
                  }`}
                >
                  {d.change?.previewDataUrl ? (
                    <img src={d.change.previewDataUrl} alt={`Design ${i + 1}`} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gray-50 flex items-center justify-center">
                      <span className="text-xs font-bold text-gray-300">#{i + 1}</span>
                    </div>
                  )}
                </button>

                {/* Label */}
                {i === activeIdx ? (
                  <span className="text-[10px] font-bold text-primary">Editing</span>
                ) : (
                  <button
                    onClick={() => copyDesign(i)}
                    className="flex items-center gap-0.5 text-[10px] font-medium text-gray-400 hover:text-pink-500 transition-colors"
                  >
                    <Copy className="w-2.5 h-2.5" /> Copy
                  </button>
                )}

                {/* Remove (only if >1 design) */}
                {designs.length > 1 && (
                  <button
                    onClick={() => removeDesign(i)}
                    className="text-[9px] text-muted-foreground/60 hover:text-destructive transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

        </div>

        {designs.length > 1 && (
          <p className="text-xs text-muted-foreground text-center mt-2 flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3 text-primary" />
            Each design is customised separately — tap a thumbnail to switch
          </p>
        )}
      </div>

      {/* ── Sticky bottom CTA ── */}
      <div className="fixed bottom-0 inset-x-0 z-30 backdrop-blur border-t p-4 safe-area-pb"
        style={{ background: "rgba(255,255,255,0.97)", borderColor: "#f0ede8" }}>
        <div className="max-w-2xl mx-auto flex flex-col gap-2">

          {/* Download button — only shown when there's a canvas design */}
          {!!(activeDesign.change?.canvasJSON ?? activeDesign.initialJSON) && (
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(v => !v)}
                disabled={exporting}
                className="w-full h-11 rounded-xl font-semibold text-sm border border-gray-200 bg-white hover:bg-gray-50 active:scale-[0.98] disabled:opacity-60 transition-all flex items-center justify-center gap-2 text-gray-700"
              >
                {exporting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Exporting…</>
                ) : (
                  <><Download className="w-4 h-4" /> Download Print File <ChevronDown className="w-3.5 h-3.5 ml-0.5" /></>
                )}
              </button>
              {showExportMenu && !exporting && (
                <div className="absolute bottom-full mb-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-40">
                  <button
                    onClick={() => onExport("png")}
                    className="w-full px-4 py-3 text-sm text-left font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4 text-gray-400" /> Download PNG (high-res)
                  </button>
                  <div className="border-t border-gray-100" />
                  <button
                    onClick={() => onExport("pdf")}
                    className="w-full px-4 py-3 text-sm text-left font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4 text-gray-400" /> Download PDF (print-ready)
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            onClick={onSave}
            disabled={adding || addOK}
            className="w-full h-14 rounded-xl font-bold text-sm text-white bg-[#EF3752] shadow-sm hover:opacity-90 active:scale-[0.98] disabled:opacity-60 transition-all flex items-center justify-center gap-2 relative overflow-hidden"
          >
            {addOK ? (
              <><Check className="w-5 h-5" /> {editOrderId ? "Order updated!" : "Added to cart!"}</>
            ) : adding ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {editOrderId ? "Saving…" : "Adding…"}</>
            ) : editOrderId ? (
              <>
                <Check className="w-5 h-5" />
                Update Order
              </>
            ) : (
              <>
                <ShoppingCart className="w-5 h-5" />
                Save &amp; Proceed · {currency}{totalPrice.toLocaleString("en-IN")}
              </>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}

