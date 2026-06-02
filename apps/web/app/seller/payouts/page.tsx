"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wallet, Loader2, CheckCircle2, Clock,
  IndianRupee, Package, ChevronDown, ChevronUp,
  CalendarClock, AlertCircle, CircleDot, FileText,
} from "lucide-react";
import { sellerApi, getSellerToken } from "@/lib/seller-api";

// ── Types ─────────────────────────────────────────────────────────────────

type PayoutStatus = "pending" | "eligible" | "processing" | "paid" | "cancelled";

interface PayoutItem {
  id: string;
  grossAmount: string;
  assignment: {
    orderItem: {
      qty: number;
      product: { title: string };
      order: { orderNumber: string };
    };
  };
}

interface Payout {
  id: string;
  status: PayoutStatus;
  grossAmount: string;
  commissionRate: string;
  commissionAmount: string;
  netAmount: string;
  paymentRef: string | null;
  paidAt: string | null;
  createdAt: string;
  items: PayoutItem[];
}

interface OutstandingItem {
  id: string;
  orderNumber: string;
  product: string;
  qty: number;
  deliveredAt: string;
  grossAmount: number;
  netPayout: number;
  eligibleAt: string;
  daysUntilEligible: number;
}

interface Outstanding {
  inReturnWindow: OutstandingItem[];
  eligible: OutstandingItem[];
  totals: { inWindow: number; eligible: number };
}

// ── Status config ─────────────────────────────────────────────────────────

const STATUS_META: Record<PayoutStatus, { label: string; color: string }> = {
  pending:    { label: "Pending",      color: "text-gray-500 bg-gray-50 border-gray-200" },
  eligible:   { label: "Processing",   color: "text-blue-600 bg-blue-50 border-blue-200" },
  processing: { label: "Transferring", color: "text-amber-600 bg-amber-50 border-amber-200" },
  paid:       { label: "Paid",         color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  cancelled:  { label: "Cancelled",    color: "text-red-500 bg-red-50 border-red-200" },
};

function inr(v: string | number) {
  return Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ── Page ─────────────────────────────────────────────────────────────────

type Tab = "history" | "outstanding";

export default function SellerPayoutsPage() {
  const router  = useRouter();
  const [tab, setTab]             = useState<Tab>("history");
  const [payouts, setPayouts]     = useState<Payout[]>([]);
  const [outstanding, setOutstanding] = useState<Outstanding | null>(null);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<string | null>(null);

  useEffect(() => {
    if (!getSellerToken()) { router.replace("/seller/login"); return; }
    loadHistory();
    loadOutstanding();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function loadHistory() {
    setLoading(true);
    sellerApi.get<Payout[]>("/seller/payouts")
      .then(setPayouts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function loadOutstanding() {
    sellerApi.get<Outstanding>("/seller/payouts/outstanding")
      .then(setOutstanding)
      .catch(() => {});
  }

  const toggle = (id: string) => setExpanded((e) => (e === id ? null : id));

  const outstandingCount =
    (outstanding?.inReturnWindow.length ?? 0) + (outstanding?.eligible.length ?? 0);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 bg-card border-b border-border/60 px-4 py-3 flex items-center gap-3">
        <Wallet className="w-5 h-5 text-primary" />
        <h1 className="font-semibold text-base flex-1">Payouts</h1>
      </header>

      {/* Tabs */}
      <div className="bg-card border-b border-border/60 px-4 flex gap-1 py-2">
        <TabBtn active={tab === "history"} onClick={() => setTab("history")}>
          History
        </TabBtn>
        <TabBtn active={tab === "outstanding"} onClick={() => setTab("outstanding")}>
          Outstanding
          {outstandingCount > 0 && (
            <span className="ml-1.5 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold inline-flex items-center justify-center">
              {outstandingCount}
            </span>
          )}
        </TabBtn>
      </div>

      <div className="p-4 space-y-3 max-w-2xl mx-auto pb-10">

        {/* ── History tab ─────────────────────────────────────────────────── */}
        {tab === "history" && (
          loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : payouts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No payouts yet</p>
              <p className="text-xs mt-1">Your first payout appears here once delivered orders pass the return window.</p>
            </div>
          ) : (
            payouts.map((p) => {
              const meta    = STATUS_META[p.status];
              const open    = expanded === p.id;
              const commPct = (Number(p.commissionRate) * 100).toFixed(0);

              return (
                <div key={p.id} className="bg-white rounded-xl border overflow-hidden">
                  <button
                    onClick={() => toggle(p.id)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.color}`}>
                          {p.status === "paid" ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {meta.label}
                        </span>
                        <span className="text-xs text-muted-foreground">{fmtDate(p.createdAt)}</span>
                      </div>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="text-lg font-black">₹{inr(p.netAmount)}</span>
                        <span className="text-xs text-muted-foreground">net · {p.items.length} item{p.items.length !== 1 ? "s" : ""}</span>
                      </div>
                      {p.paidAt && (
                        <p className="text-xs text-emerald-600 mt-0.5">Paid {fmtDate(p.paidAt)}{p.paymentRef ? ` · Ref: ${p.paymentRef}` : ""}</p>
                      )}
                    </div>
                    {open ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                  </button>

                  {open && (
                    <div className="border-t px-4 py-3 space-y-3">
                      <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Gross earnings</span>
                          <span className="font-semibold">₹{inr(p.grossAmount)}</span>
                        </div>
                        <div className="flex justify-between text-red-500">
                          <span>Platform fee ({commPct}%)</span>
                          <span>−₹{inr(p.commissionAmount)}</span>
                        </div>
                        <div className="flex justify-between font-black border-t pt-1.5 mt-1.5">
                          <span>Net payout</span>
                          <span>₹{inr(p.netAmount)}</span>
                        </div>
                      </div>
                      <a
                        href={`/seller/payouts/${p.id}/invoice`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                      >
                        <FileText className="w-3.5 h-3.5" /> Commission tax invoice
                      </a>

                      <div className="space-y-1.5">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Included orders</p>
                        {p.items.map((item) => (
                          <div key={item.id} className="flex items-center gap-2 text-xs">
                            <Package className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="text-muted-foreground">{item.assignment.orderItem.order.orderNumber}</span>
                            <span className="flex-1 truncate">{item.assignment.orderItem.product.title}</span>
                            <span className="font-semibold flex-shrink-0">₹{inr(item.grossAmount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )
        )}

        {/* ── Outstanding tab ──────────────────────────────────────────────── */}
        {tab === "outstanding" && (
          !outstanding ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : outstandingCount === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <IndianRupee className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No outstanding payments</p>
              <p className="text-xs mt-1">Delivered orders that are unpaid will appear here.</p>
            </div>
          ) : (
            <>
              {/* Totals */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border/50 bg-card p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> In return window
                  </div>
                  <p className="text-lg font-black">₹{inr(outstanding.totals.inWindow)}</p>
                  <p className="text-[11px] text-muted-foreground">{outstanding.inReturnWindow.length} orders</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-card p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <CircleDot className="w-3.5 h-3.5 text-emerald-500" /> Eligible for payout
                  </div>
                  <p className="text-lg font-black">₹{inr(outstanding.totals.eligible)}</p>
                  <p className="text-[11px] text-muted-foreground">{outstanding.eligible.length} orders</p>
                </div>
              </div>

              {/* Eligible items — will be in next payout batch */}
              {outstanding.eligible.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <CircleDot className="w-3.5 h-3.5 text-emerald-500" />
                    <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Eligible — next payout batch</p>
                  </div>
                  <div className="space-y-2">
                    {outstanding.eligible.map(item => (
                      <OutstandingCard key={item.id} item={item} type="eligible" />
                    ))}
                  </div>
                </section>
              )}

              {/* In-window items — still in return window */}
              {outstanding.inReturnWindow.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                    <p className="text-xs font-black uppercase tracking-wide text-amber-700">In return window</p>
                  </div>
                  <div className="space-y-2">
                    {outstanding.inReturnWindow.map(item => (
                      <OutstandingCard key={item.id} item={item} type="inWindow" />
                    ))}
                  </div>
                </section>
              )}

              <p className="text-[11px] text-center text-muted-foreground">
                Payouts are processed daily after the 17-day eligibility window (7d return + 10d hold).
              </p>
            </>
          )
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function OutstandingCard({ item, type }: { item: OutstandingItem; type: "eligible" | "inWindow" }) {
  return (
    <div className="bg-white rounded-xl border px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{item.product}</p>
          <p className="text-xs text-muted-foreground">{item.orderNumber} · Qty {item.qty}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-black">₹{item.netPayout.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
          <p className="text-[11px] text-muted-foreground">net payout</p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
        <span>Delivered {new Date(item.deliveredAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
        {type === "inWindow" ? (
          <span className="flex items-center gap-0.5 text-amber-600 font-semibold">
            <CalendarClock className="w-3 h-3" />
            Eligible {new Date(item.eligibleAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            {item.daysUntilEligible > 0 ? ` (${item.daysUntilEligible}d)` : ""}
          </span>
        ) : (
          <span className="flex items-center gap-0.5 text-emerald-600 font-semibold">
            <CircleDot className="w-3 h-3" /> Ready for next batch
          </span>
        )}
      </div>
    </div>
  );
}
