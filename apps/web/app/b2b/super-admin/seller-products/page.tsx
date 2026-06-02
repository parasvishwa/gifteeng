"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Package, Loader2, CheckCircle2, XCircle, Clock, Search, X,
  Store, IndianRupee, Boxes, Tag, ExternalLink, Pencil,
} from "lucide-react";
import { safeGet, safePatch, adminToast } from "@/lib/admin-api";

type OfferStatus = "pending" | "approved" | "rejected";

interface Offer {
  id: string;
  isOwnListing: boolean;
  price: string | number;
  stock: number;
  status: OfferStatus;
  rejectedReason: string | null;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  product: { id: string; slug: string; title: string; category: string | null; images: { url: string }[] | null };
  seller: { id: string; brandName: string; legalName: string; city: string | null; status: string };
}

const STATUS_META: Record<OfferStatus, { icon: typeof Clock; cls: string; label: string }> = {
  pending:  { icon: Clock,        cls: "text-amber-700 bg-amber-100 border-amber-200",       label: "Pending" },
  approved: { icon: CheckCircle2, cls: "text-emerald-700 bg-emerald-100 border-emerald-200", label: "Live" },
  rejected: { icon: XCircle,      cls: "text-red-600 bg-red-100 border-red-200",             label: "Rejected" },
};

const TABS: { key: OfferStatus | "all"; label: string }[] = [
  { key: "pending",  label: "Pending" },
  { key: "approved", label: "Live" },
  { key: "rejected", label: "Rejected" },
  { key: "all",      label: "All" },
];

const REJECTION_REASONS = [
  "Images are low quality or missing",
  "Product description is incomplete or misleading",
  "Incorrect or missing category",
  "Price is not reasonable for this product",
  "Product is prohibited on this platform",
  "Duplicate listing already exists",
  "Copyright or trademark concern",
  "Other",
];

function inr(v: string | number) {
  return Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// ── Rejection dialog ──────────────────────────────────────────────────────────
function RejectDialog({
  offerId,
  productTitle,
  onClose,
  onRejected,
}: {
  offerId: string;
  productTitle: string;
  onClose: () => void;
  onRejected: (updated: Offer) => void;
}) {
  const [selected, setSelected] = useState("");
  const [otherText, setOtherText] = useState("");
  const [busy, setBusy] = useState(false);

  const reason = selected === "Other" ? otherText.trim() : selected;
  const canSubmit = selected !== "" && (selected !== "Other" || otherText.trim() !== "");

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    const updated = await safePatch<Offer | null>(
      `/admin/seller-products/${offerId}/reject`,
      { reason },
      null,
    );
    setBusy(false);
    if (updated) {
      adminToast.success("Listing rejected — seller will be notified");
      onRejected(updated);
    } else {
      adminToast.error("Action failed — try again");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">Reject listing</h2>
            <p className="mt-0.5 text-xs text-muted-foreground truncate max-w-xs">{productTitle}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <p className="mb-3 text-xs text-muted-foreground">
          Select the reason — this is shown to the seller so they can correct and resubmit.
        </p>

        <div className="space-y-2">
          {REJECTION_REASONS.map((r) => (
            <label key={r} className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="reject-reason"
                value={r}
                checked={selected === r}
                onChange={() => setSelected(r)}
                className="mt-0.5 shrink-0"
              />
              <span className="text-sm">{r}</span>
            </label>
          ))}
        </div>

        {selected === "Other" && (
          <textarea
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Describe the issue..."
            rows={3}
            className="mt-3 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
            autoFocus
          />
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || busy}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            Reject listing
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminSellerProducts() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<OfferStatus | "all">("pending");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Offer | null>(null);

  const fetchOffers = async () => {
    setLoading(true);
    const data = await safeGet<Offer[]>("/admin/seller-products", []);
    setOffers(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchOffers(); }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, approved: 0, rejected: 0, all: offers.length };
    for (const o of offers) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [offers]);

  const filtered = useMemo(() => {
    let list = tab === "all" ? offers : offers.filter((o) => o.status === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((o) =>
        o.product.title.toLowerCase().includes(q) ||
        o.seller.brandName.toLowerCase().includes(q),
      );
    }
    return list;
  }, [offers, tab, search]);

  async function approve(id: string) {
    setBusy(id);
    const updated = await safePatch<Offer | null>(`/admin/seller-products/${id}/approve`, {}, null);
    setBusy(null);
    if (updated) {
      setOffers((prev) => prev.map((o) => (o.id === id ? { ...o, ...updated } : o)));
      adminToast.success("Listing approved — now live");
    } else {
      adminToast.error("Action failed — try again");
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-4xl space-y-5">
      {rejectTarget && (
        <RejectDialog
          offerId={rejectTarget.id}
          productTitle={rejectTarget.product.title}
          onClose={() => setRejectTarget(null)}
          onRejected={(updated) => {
            setOffers((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));
            setRejectTarget(null);
          }}
        />
      )}

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Package className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-display font-bold tracking-tight">Product Listings</h1>
          <p className="text-xs text-muted-foreground">
            {counts.pending} awaiting review · {counts.approved} live · {offers.length} total
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {t.label}
            <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${
              tab === t.key ? "bg-primary-foreground/20" : "bg-background"
            }`}>
              {counts[t.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {offers.length > 4 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product or seller..."
            className="w-full rounded-lg border border-border/60 bg-background pl-8 pr-8 h-8 text-xs outline-none focus:border-primary/50"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <Package className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm font-medium mb-0.5">{search ? "No matches" : "No listings here"}</p>
          <p className="text-xs text-muted-foreground">
            {search ? "Try a different search" : "Seller listings appear here for verification"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => {
            const meta = STATUS_META[o.status];
            const StatusIcon = meta.icon;
            const img = Array.isArray(o.product.images) ? o.product.images[0]?.url : null;
            return (
              <div key={o.id} className="bg-card rounded-xl border border-border/40 p-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden shrink-0">
                    {img
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={img} alt={o.product.title} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Package className="w-5 h-5 text-muted-foreground/30" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">{o.product.title}</span>
                      {o.isOwnListing && (
                        <span className="rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-bold text-primary">
                          New product
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-0.5"><Store className="w-2.5 h-2.5" />{o.seller.brandName}</span>
                      {o.seller.city && <><span>·</span><span>{o.seller.city}</span></>}
                      <span>·</span>
                      <span className="flex items-center gap-0.5"><IndianRupee className="w-2.5 h-2.5" />{inr(o.price)}</span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5"><Boxes className="w-2.5 h-2.5" />{o.stock}</span>
                      {o.product.category && (
                        <><span>·</span><span className="flex items-center gap-0.5"><Tag className="w-2.5 h-2.5" />{o.product.category}</span></>
                      )}
                    </div>
                  </div>
                  <span className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border font-semibold shrink-0 ${meta.cls}`}>
                    <StatusIcon className="w-2.5 h-2.5" /> {meta.label}
                  </span>
                </div>

                {o.status === "rejected" && o.rejectedReason && (
                  <p className="mt-2 rounded-lg bg-red-50 border border-red-200 px-2.5 py-1.5 text-[11px] font-semibold text-red-700">
                    Rejected: {o.rejectedReason}
                  </p>
                )}

                <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-border/30">
                  {/* Edit product — admin can review & change anything before approving */}
                  <a
                    href={`/b2b/super-admin/products/${o.product.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="w-3 h-3" /> Edit product
                  </a>
                  <a
                    href={`/products/${o.product.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="w-3 h-3" /> Preview
                  </a>
                  <div className="flex-1" />
                  {o.status !== "approved" && (
                    <button
                      onClick={() => approve(o.id)}
                      disabled={busy === o.id}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {busy === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Approve
                    </button>
                  )}
                  {o.status !== "rejected" && (
                    <button
                      onClick={() => setRejectTarget(o)}
                      disabled={busy === o.id}
                      className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  )}
                  {o.status === "rejected" && (
                    <button
                      onClick={() => setRejectTarget(o)}
                      disabled={busy === o.id}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Change reason
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
