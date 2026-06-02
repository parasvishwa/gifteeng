"use client";

/**
 * MultiVariantGrid — Amazon-style variant picker shown when a group has
 * many values (≥ 12). Renders a paginated thumbnail grid with price per tile.
 *
 * Modes:
 *   - single  : tap a tile to select the variant (same as existing pills)
 *   - multi   : each tile gets a qty stepper; "Add N items" bulk CTA
 *
 * Props:
 *   groupName       — the variant option name (e.g. "Design")
 *   options         — array of { value, image?, priceDelta?, images? }
 *   basePrice       — product base price
 *   currency        — e.g. "₹"
 *   selectedValue   — currently selected variant value (single mode)
 *   onSelect        — called when user selects in single mode
 *   onBulkAdd       — called with [{ value, qty }] when user confirms multi-select
 */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, ShoppingBag, Layers } from "lucide-react";
import { autoVariantThumb } from "./ProductDetailClient";

type Option = {
  value: string;
  image?: string;
  images?: string[];
  priceDelta?: number;
};

type Props = {
  groupName: string;
  options: Option[];
  basePrice: number;
  currency?: string;
  selectedValue?: string;
  onSelect: (value: string) => void;
  onBulkAdd?: (items: { value: string; qty: number }[]) => Promise<void> | void;
  /** When true, hide the multi-select toggle — customizable products use the customizer flow */
  isCustomizable?: boolean;
};

const PAGE_SIZE = 15; // 3 rows × 5 cols on desktop

export default function MultiVariantGrid({
  groupName,
  options,
  basePrice,
  currency = "₹",
  selectedValue,
  onSelect,
  onBulkAdd,
  isCustomizable = false,
}: Props) {
  const [page, setPage] = useState(0);
  const [multi, setMulti] = useState(false);
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const totalPages = Math.max(1, Math.ceil(options.length / PAGE_SIZE));
  const pageOpts = useMemo(
    () => options.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [options, page],
  );

  const totalQty = useMemo(
    () => Object.values(qtyMap).reduce((a, b) => a + b, 0),
    [qtyMap],
  );
  const totalPrice = useMemo(
    () =>
      Object.entries(qtyMap).reduce((sum, [val, q]) => {
        const opt = options.find((o) => o.value === val);
        return sum + q * (basePrice + (opt?.priceDelta ?? 0));
      }, 0),
    [qtyMap, options, basePrice],
  );

  const incQty = (val: string) =>
    setQtyMap((m) => ({ ...m, [val]: Math.min(99, (m[val] ?? 0) + 1) }));
  const decQty = (val: string) =>
    setQtyMap((m) => {
      const next = (m[val] ?? 0) - 1;
      const { [val]: _omit, ...rest } = m;
      return next <= 0 ? rest : { ...m, [val]: next };
    });

  const commitBulk = async () => {
    if (!onBulkAdd || totalQty === 0 || busy) return;
    setBusy(true);
    try {
      const items = Object.entries(qtyMap).map(([value, qty]) => ({ value, qty }));
      await onBulkAdd(items);
      setQtyMap({});
      setMulti(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Multi-select toggle banner — hidden for customizable products */}
      {!isCustomizable && <div
        className="flex items-center gap-3 rounded-md border border-border bg-card p-3"
      >
        <div className="w-9 h-9 rounded-md flex items-center justify-center bg-primary/10 text-primary shrink-0">
          <Layers className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground leading-tight">
            Buying multiple {groupName.toLowerCase()}s?
          </p>
          <p className="text-xs text-muted-foreground">
            Pick quantities for each and add all at once.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setMulti((m) => !m);
            if (multi) setQtyMap({});
          }}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap ${
            multi
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground hover:bg-muted/70"
          }`}
        >
          {multi ? "Cancel" : "Go to multi-select"}
        </button>
      </div>}

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm">
          <span className="font-bold text-foreground capitalize">{groupName}:</span>{" "}
          {!multi && selectedValue ? (
            <span className="text-foreground">{selectedValue}</span>
          ) : (
            <span className="text-muted-foreground">
              {multi ? `${totalQty} item${totalQty !== 1 ? "s" : ""} selected` : "Choose one"}
            </span>
          )}
        </p>
        <span className="text-xs text-muted-foreground tabular-nums">
          {options.length} {options.length === 1 ? "option" : "options"}
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {pageOpts.map((opt) => {
          const qty = qtyMap[opt.value] ?? 0;
          const isSelected = !multi && selectedValue === opt.value;
          const hasQty = multi && qty > 0;
          const thumb = opt.image ?? opt.images?.[0] ?? autoVariantThumb(opt.value);
          const price = basePrice + (opt.priceDelta ?? 0);
          return (
            <div
              key={opt.value}
              className={`relative rounded-md border overflow-hidden transition-all bg-card ${
                isSelected
                  ? "border-primary ring-2 ring-primary/40"
                  : hasQty
                  ? "border-primary/60"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              <button
                type="button"
                onClick={() => !multi && onSelect(opt.value)}
                disabled={multi}
                className="block w-full text-left disabled:cursor-default"
              >
                {/* Thumbnail */}
                <div className="relative aspect-square bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumb} alt={opt.value} className="h-full w-full object-cover" draggable={false} />
                  {hasQty && (
                    <div
                      className="absolute top-1 right-1 w-6 h-6 rounded-full text-white text-[10px] font-black flex items-center justify-center shadow-md"
                      style={{ background: "hsl(351 85% 58%)" }}
                    >
                      ×{qty}
                    </div>
                  )}
                </div>

                {/* Price + name */}
                <div className="px-2 py-1.5">
                  <p className="text-xs font-bold text-foreground tabular-nums">
                    {currency}{price.toFixed(0)}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">{opt.value}</p>
                </div>
              </button>

              {/* Multi-select qty controls */}
              {multi && (
                <div className="flex items-center justify-between px-2 pb-2">
                  <button
                    type="button"
                    onClick={() => decQty(opt.value)}
                    className="w-6 h-6 rounded-full bg-muted hover:bg-muted/70 flex items-center justify-center"
                    aria-label="Decrease"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-xs font-bold tabular-nums w-6 text-center">{qty}</span>
                  <button
                    type="button"
                    onClick={() => incQty(opt.value)}
                    className="w-6 h-6 rounded-full bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center"
                    aria-label="Increase"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="w-8 h-8 rounded-full border border-border flex items-center justify-center disabled:opacity-30 hover:bg-muted"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPage(i)}
              className={`w-8 h-8 rounded-full text-xs font-bold transition-colors ${
                i === page
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="w-8 h-8 rounded-full border border-border flex items-center justify-center disabled:opacity-30 hover:bg-muted"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bulk add CTA (sticky at bottom of grid when multi) */}
      {multi && totalQty > 0 && (
        <div
          className="sticky bottom-4 z-10 rounded-md shadow-xl p-3 flex items-center gap-3"
          style={{ background: "hsl(351 85% 58%)" }}
        >
          <div className="flex-1 min-w-0 text-white">
            <p className="text-xs opacity-80">Add to cart</p>
            <p className="font-black text-sm">
              {totalQty} item{totalQty !== 1 ? "s" : ""} · {currency}{totalPrice.toFixed(0)}
            </p>
          </div>
          <button
            type="button"
            onClick={commitBulk}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-[#c2185b] text-xs font-black disabled:opacity-60"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            {busy ? "Adding…" : `Add ${totalQty}`}
          </button>
        </div>
      )}
    </div>
  );
}
