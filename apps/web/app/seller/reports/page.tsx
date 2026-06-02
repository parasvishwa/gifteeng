"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, FileText, Receipt, Loader2, CheckCircle2, Calculator, IndianRupee } from "lucide-react";
import { getSellerToken } from "@/lib/seller-api";

const API_BASE = "/api";

function getSellerAuthHeader() {
  const token = getSellerToken();
  return token ? `Bearer ${token}` : "";
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function isoMonth(offset = 0): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + offset;
  const first = new Date(y, m, 1);
  const last  = new Date(y, m + 1, 0);
  return {
    from: first.toISOString().slice(0, 10),
    to:   last.toISOString().slice(0, 10),
  };
}

function months(n: number) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - n + 1, 1);
  const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

const YEARS  = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Download trigger ──────────────────────────────────────────────────────────

async function triggerDownload(path: string, label: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: getSellerAuthHeader() },
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = label;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SellerReportsPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getSellerToken()) router.replace("/seller/login");
  }, [router]);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 bg-card border-b border-border/60 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push("/seller/dashboard")} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <FileText className="w-5 h-5 text-primary" />
        <h1 className="font-black text-base flex-1">Reports & Downloads</h1>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-4">

        {/* Order Report */}
        <ReportCard
          icon={Receipt}
          title="Order Report"
          description="All your orders with status, amount, and payout info — one row per order."
        >
          <DateRangeReport
            presets={[
              { label: "This month",    dates: isoMonth(0)   },
              { label: "Last month",    dates: isoMonth(-1)  },
              { label: "Last 3 months", dates: months(3)     },
              { label: "Last 6 months", dates: months(6)     },
            ]}
            onDownload={(from, to) =>
              triggerDownload(
                `/seller/reports/orders?from=${from}&to=${to}`,
                `gifteeng-orders-${from}-to-${to}.csv`,
              )
            }
          />
        </ReportCard>

        {/* Payout Statement */}
        <ReportCard
          icon={Download}
          title="Payout Statement"
          description="Detailed breakdown of each payout batch — gross amount, commission deducted, net received."
        >
          <DateRangeReport
            presets={[
              { label: "This month",    dates: isoMonth(0)  },
              { label: "Last month",    dates: isoMonth(-1) },
              { label: "Last 3 months", dates: months(3)    },
              { label: "This year",     dates: months(12)   },
            ]}
            onDownload={(from, to) =>
              triggerDownload(
                `/seller/reports/payouts?from=${from}&to=${to}`,
                `gifteeng-payouts-${from}-to-${to}.csv`,
              )
            }
          />
        </ReportCard>

        {/* GST Report */}
        <ReportCard
          icon={Calculator}
          title="GST Report"
          description="Per-order GST breakdown — taxable value, CGST/SGST (intrastate) or IGST (interstate), and invoice totals for GST filing."
        >
          <DateRangeReport
            presets={[
              { label: "This month",    dates: isoMonth(0)  },
              { label: "Last month",    dates: isoMonth(-1) },
              { label: "Last 3 months", dates: months(3)    },
              { label: "This year",     dates: months(12)   },
            ]}
            onDownload={(from, to) =>
              triggerDownload(
                `/seller/reports/gst?from=${from}&to=${to}`,
                `gifteeng-gst-${from}-to-${to}.csv`,
              )
            }
          />
          <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Assumes 12% GST inclusive in your listed price. Verify tax rates with your CA before filing.
          </p>
        </ReportCard>

        {/* Outstanding Payments */}
        <ReportCard
          icon={IndianRupee}
          title="Outstanding Payments"
          description="All delivered orders that have not yet been paid out — includes return-window status and expected payout date."
        >
          <button
            onClick={() => triggerDownload("/seller/reports/outstanding", `gifteeng-outstanding-${new Date().toISOString().slice(0,10)}.csv`)}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Download className="w-4 h-4" />
            Download CSV
          </button>
          <p className="mt-2 text-[11px] text-muted-foreground">Snapshot of today — re-download any time for the latest status.</p>
        </ReportCard>

        <p className="text-[11px] text-muted-foreground text-center pb-4">
          All reports download as CSV — open in Excel, Google Sheets, or any spreadsheet app.
          UTF-8 encoded with BOM for correct character display.
        </p>
      </div>
    </div>
  );
}

// ── Report Card ───────────────────────────────────────────────────────────────

function ReportCard({
  icon: Icon, title, description, children,
}: { icon: typeof FileText; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-border/40">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-black">{title}</h2>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── Date Range Report selector ────────────────────────────────────────────────

function DateRangeReport({
  presets,
  onDownload,
}: {
  presets: { label: string; dates: { from: string; to: string } }[];
  onDownload: (from: string, to: string) => Promise<void>;
}) {
  const [mode,    setMode]    = useState<"preset" | "custom">("preset");
  const [preset,  setPreset]  = useState(0);
  const [from,    setFrom]    = useState("");
  const [to,      setTo]      = useState("");
  const [busy,    setBusy]    = useState(false);
  const [done,    setDone]    = useState(false);
  const [err,     setErr]     = useState("");

  const dates = mode === "preset" ? presets[preset]?.dates ?? presets[0]!.dates : { from, to };

  async function handleDownload() {
    if (!dates.from || !dates.to) { setErr("Select a date range"); return; }
    setBusy(true); setErr(""); setDone(false);
    try {
      await onDownload(dates.from, dates.to);
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch (e) {
      setErr((e as Error).message ?? "Download failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex gap-1.5">
        <button
          onClick={() => setMode("preset")}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            mode === "preset" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          Quick select
        </button>
        <button
          onClick={() => setMode("custom")}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            mode === "custom" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          Custom range
        </button>
      </div>

      {mode === "preset" && (
        <div className="flex gap-1.5 flex-wrap">
          {presets.map((p, i) => (
            <button
              key={i}
              onClick={() => setPreset(i)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                preset === i
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "border-border/50 text-muted-foreground hover:border-primary/20 hover:bg-primary/5"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {mode === "custom" && (
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">From</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-full mt-0.5 rounded-lg border border-border/50 px-2.5 py-1.5 text-xs"
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">To</label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-full mt-0.5 rounded-lg border border-border/50 px-2.5 py-1.5 text-xs"
            />
          </div>
        </div>
      )}

      {mode === "preset" && dates.from && (
        <p className="text-[11px] text-muted-foreground">{dates.from} → {dates.to}</p>
      )}

      {err && <p className="text-xs text-destructive font-semibold">{err}</p>}

      <button
        onClick={handleDownload}
        disabled={busy}
        className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {busy  ? <Loader2 className="w-4 h-4 animate-spin" /> :
         done  ? <CheckCircle2 className="w-4 h-4" /> :
                 <Download className="w-4 h-4" />}
        {busy ? "Preparing…" : done ? "Downloaded!" : "Download CSV"}
      </button>
    </div>
  );
}
