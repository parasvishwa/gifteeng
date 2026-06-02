"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Store, Loader2, CheckCircle2, XCircle, Ban, Clock, Search, X,
  Building2, MapPin, Phone, Mail, ShieldCheck, User, Factory,
  CreditCard, Star,
} from "lucide-react";
import { safeGet, safePatch, adminToast } from "@/lib/admin-api";

type SellerStatus = "pending" | "approved" | "rejected" | "suspended";

interface Seller {
  id: string;
  phone: string;
  email: string | null;
  type: "individual" | "business";
  mode: "vendor_only" | "full_seller";
  brandName: string;
  legalName: string;
  gstNumber: string | null;
  panNumber: string | null;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  status: SellerStatus;
  rejectedReason: string | null;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  approvedAt: string | null;
}

const STATUS_META: Record<SellerStatus, { icon: typeof Clock; cls: string; label: string }> = {
  pending:   { icon: Clock,        cls: "text-amber-700 bg-amber-100 border-amber-200",         label: "Pending" },
  approved:  { icon: CheckCircle2, cls: "text-emerald-700 bg-emerald-100 border-emerald-200",   label: "Approved" },
  rejected:  { icon: XCircle,      cls: "text-red-600 bg-red-100 border-red-200",               label: "Rejected" },
  suspended: { icon: Ban,          cls: "text-red-600 bg-red-100 border-red-200",               label: "Suspended" },
};

const TABS: { key: SellerStatus | "all"; label: string }[] = [
  { key: "pending",   label: "Pending" },
  { key: "approved",  label: "Approved" },
  { key: "rejected",  label: "Rejected" },
  { key: "suspended", label: "Suspended" },
  { key: "all",       label: "All" },
];

export default function AdminSellers() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<SellerStatus | "all">("pending");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchSellers = async () => {
    setLoading(true);
    const data = await safeGet<Seller[]>("/admin/sellers", []);
    setSellers(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchSellers(); }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, approved: 0, rejected: 0, suspended: 0, all: sellers.length };
    for (const s of sellers) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [sellers]);

  const filtered = useMemo(() => {
    let list = tab === "all" ? sellers : sellers.filter((s) => s.status === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
        s.brandName.toLowerCase().includes(q) ||
        s.legalName.toLowerCase().includes(q) ||
        s.phone.includes(q) ||
        (s.gstNumber ?? "").toLowerCase().includes(q) ||
        (s.city ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [sellers, tab, search]);

  async function act(id: string, action: "approve" | "reject" | "suspend") {
    let reason = "";
    if (action === "reject" || action === "suspend") {
      reason = window.prompt(
        action === "reject"
          ? "Reason for rejecting this seller (shown to the seller):"
          : "Reason for suspending this seller (shown to the seller):",
      ) ?? "";
      if (reason.trim() === "") return;
    }
    setBusy(id);
    const updated = await safePatch<Seller | null>(
      `/admin/sellers/${id}/${action}`,
      action === "approve" ? {} : { reason },
      null,
    );
    setBusy(null);
    if (updated) {
      setSellers((prev) => prev.map((s) => (s.id === id ? updated : s)));
      adminToast.success(
        action === "approve" ? "Seller approved" : action === "reject" ? "Seller rejected" : "Seller suspended",
      );
    } else {
      adminToast.error("Action failed — try again");
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Store className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-display font-bold tracking-tight">Sellers</h1>
          <p className="text-xs text-muted-foreground">
            {counts.pending} awaiting review · {counts.approved} approved · {sellers.length} total
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

      {/* Search */}
      {sellers.length > 4 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brand, GST, phone, city..."
            className="w-full rounded-lg border border-border/60 bg-background pl-8 pr-8 h-8 text-xs outline-none focus:border-primary/50"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <Store className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm font-medium mb-0.5">{search ? "No matches" : `No ${tab === "all" ? "" : tab} sellers`}</p>
          <p className="text-xs text-muted-foreground">
            {search ? "Try a different search" : "Sellers appear here after they onboard via the seller portal"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const meta = STATUS_META[s.status];
            const StatusIcon = meta.icon;
            const isOpen = expanded === s.id;
            return (
              <div key={s.id} className="bg-card rounded-xl border border-border/40 overflow-hidden">
                {/* Row */}
                <button
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                  className="w-full flex items-center gap-3 p-3.5 text-left transition-colors hover:bg-muted/20"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    {s.type === "business"
                      ? <Building2 className="w-4 h-4 text-primary" />
                      : <User className="w-4 h-4 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">{s.brandName}</span>
                      {s.mode === "vendor_only" && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-px text-[9px] font-bold">
                          <Factory className="w-2.5 h-2.5" /> Manufacturing
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                      <span>{s.legalName}</span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{s.phone}</span>
                      {(s.city || s.pincode) && (
                        <><span>·</span><span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{[s.city, s.pincode].filter(Boolean).join(" ")}</span></>
                      )}
                    </div>
                  </div>
                  <span className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border font-semibold shrink-0 ${meta.cls}`}>
                    <StatusIcon className="w-2.5 h-2.5" /> {meta.label}
                  </span>
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-border/30 bg-muted/10 p-4 space-y-4">
                    {s.rejectedReason && (s.status === "rejected" || s.status === "suspended") && (
                      <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">
                        {meta.label} reason: {s.rejectedReason}
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
                      <Field icon={ShieldCheck} label="GST number" value={s.gstNumber ?? "—"} mono />
                      <Field icon={ShieldCheck} label="PAN number" value={s.panNumber ?? "—"} mono />
                      <Field icon={User} label="Contact person" value={`${s.contactName}${s.contactPhone ? ` · ${s.contactPhone}` : ""}`} />
                      <Field icon={Mail} label="Contact email" value={s.contactEmail ?? s.email ?? "—"} />
                      <Field
                        icon={MapPin}
                        label="Pickup address"
                        value={[s.addressLine, s.city, s.state, s.pincode].filter(Boolean).join(", ") || "—"}
                      />
                      <Field
                        icon={CreditCard}
                        label="Payout account"
                        value={
                          s.bankAccountNumber
                            ? `${s.bankAccountName ?? ""} · ${s.bankAccountNumber} · ${s.bankIfsc ?? ""}`.trim()
                            : "Not added yet"
                        }
                        mono={!!s.bankAccountNumber}
                      />
                      <Field
                        icon={Star}
                        label="Rating"
                        value={s.ratingCount > 0 ? `${s.ratingAvg.toFixed(1)} (${s.ratingCount} reviews)` : "No reviews yet"}
                      />
                      <Field
                        icon={Clock}
                        label="Onboarded"
                        value={new Date(s.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      {s.status !== "approved" && (
                        <button
                          onClick={() => act(s.id, "approve")}
                          disabled={busy === s.id}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {busy === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Approve
                        </button>
                      )}
                      {s.status !== "rejected" && s.status !== "approved" && (
                        <button
                          onClick={() => act(s.id, "reject")}
                          disabled={busy === s.id}
                          className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      )}
                      {s.status === "approved" && (
                        <button
                          onClick={() => act(s.id, "suspend")}
                          disabled={busy === s.id}
                          className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                        >
                          <Ban className="w-3.5 h-3.5" /> Suspend
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({
  icon: Icon, label, value, mono,
}: { icon: typeof Clock; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`text-xs font-medium break-words ${mono ? "font-mono" : ""}`}>{value}</p>
      </div>
    </div>
  );
}
