"use client";

// Shopify migration admin — drag-and-drop CSV upload for Customers
// and Orders. Each tab supports a Dry Run that returns the would-be
// counts + skip reasons before any data is written.
//
// Backend: POST /api/shopify-migrate/customers (multipart, ?dryRun)
//          POST /api/shopify-migrate/orders    (multipart, ?dryRun)

import { useState } from "react";
import {
  Button,
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@gifteeng/ui";
import {
  ShoppingBag, Users, FileUp, Loader2, AlertCircle, CheckCircle2,
  Eye, Rocket, Trash2,
} from "lucide-react";
import { authHeaders, getApiBase } from "@/lib/admin-api";

interface ImportResult {
  total: number;
  created?: number;
  merged?: number;
  skipped?: number;
  mergedSkipped?: number;
  unmatched?: number;
  dryRun: boolean;
  errors: { row?: number; name?: string; reason: string }[];
}

async function uploadCsv(
  endpoint: "customers" | "orders",
  file: File,
  dryRun: boolean,
): Promise<{ ok: boolean; status: number; result?: ImportResult; error?: string }> {
  const fd = new FormData();
  fd.append("file", file);
  try {
    const r = await fetch(
      `${getApiBase()}/api/shopify-migrate/${endpoint}?dryRun=${dryRun ? "true" : "false"}`,
      {
        method: "POST",
        headers: { ...authHeaders() },
        body: fd,
      },
    );
    const text = await r.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    if (!r.ok) return { ok: false, status: r.status, error: json?.message || text };
    return { ok: true, status: r.status, result: json };
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}

function ImportTab({
  kind, icon: Icon, label, description, samplePath,
}: {
  kind: "customers" | "orders";
  icon: typeof Users;
  label: string;
  description: string;
  samplePath: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"" | "dry" | "live">("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(dryRun ? "dry" : "live");
    setErr(null);
    setResult(null);
    const out = await uploadCsv(kind, file, dryRun);
    setBusy("");
    if (out.ok && out.result) {
      setResult(out.result);
    } else {
      setErr(out.error || `HTTP ${out.status}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="w-5 h-5 text-pink-600" />
          <h2 className="font-bold text-sm">{label}</h2>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          Export from Shopify admin →{" "}
          <a className="text-primary underline" href={samplePath} target="_blank" rel="noopener noreferrer">
            {samplePath.replace("https://", "")}
          </a>
        </p>
      </div>

      {/* Drop zone */}
      <label
        htmlFor={`file-${kind}`}
        className={`block rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition ${
          file ? "border-emerald-500/50 bg-emerald-500/5" : "border-border/60 hover:border-primary/60"
        }`}
      >
        <input
          id={`file-${kind}`}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setErr(null);
          }}
        />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <div className="text-sm">
              <div className="font-medium">{file.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB
              </div>
            </div>
            <button
              onClick={(e) => { e.preventDefault(); setFile(null); setResult(null); }}
              className="text-rose-600 hover:bg-rose-500/10 rounded p-1"
              title="Remove"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <FileUp className="w-6 h-6 mx-auto text-muted-foreground" />
            <div className="text-sm font-medium">Drop a Shopify CSV here, or click to browse</div>
            <div className="text-[11px] text-muted-foreground">CSV files only</div>
          </div>
        )}
      </label>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!file || busy !== ""}
          onClick={() => run(true)}
          className="gap-2"
        >
          {busy === "dry" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          Dry run
        </Button>
        <Button
          size="sm"
          disabled={!file || busy !== ""}
          onClick={() => {
            if (confirm(`This will write to the live database (${kind}). Continue?`)) run(false);
          }}
          className="gap-2"
        >
          {busy === "live" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
          Run import
        </Button>
      </div>

      {/* Results */}
      {err && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>{err}</div>
        </div>
      )}

      {result && <ResultPanel kind={kind} result={result} />}
    </div>
  );
}

function ResultPanel({ kind, result }: { kind: "customers" | "orders"; result: ImportResult }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        {result.dryRun ? (
          <>
            <Eye className="w-4 h-4 text-amber-600" />
            <span>Dry run preview — nothing was written</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Import complete</span>
          </>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Stat label="Total rows" value={result.total} />
        <Stat label="Created" value={result.created ?? 0} positive />
        {kind === "customers" && (
          <>
            <Stat label="Merged" value={result.merged ?? 0} />
            <Stat label="Skipped" value={result.skipped ?? 0} muted />
          </>
        )}
        {kind === "orders" && (
          <>
            <Stat label="Already imported" value={result.mergedSkipped ?? 0} muted />
            <Stat label="Unmatched customer" value={result.unmatched ?? 0} muted />
          </>
        )}
      </div>
      {result.errors?.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-amber-700 dark:text-amber-300">
            {result.errors.length} row{result.errors.length === 1 ? "" : "s"} flagged — click to inspect
          </summary>
          <div className="mt-2 max-h-64 overflow-y-auto rounded border border-border/60 bg-muted/20">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="px-2 py-1 text-left">Row</th>
                  <th className="px-2 py-1 text-left">Reason</th>
                </tr>
              </thead>
              <tbody>
                {result.errors.slice(0, 200).map((e, i) => (
                  <tr key={i} className="border-t border-border/40">
                    <td className="px-2 py-1 font-mono">{e.row ?? e.name ?? "—"}</td>
                    <td className="px-2 py-1">{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.errors.length > 200 && (
              <div className="px-2 py-1 text-muted-foreground">
                Showing first 200 of {result.errors.length}…
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

function Stat({ label, value, positive, muted }: { label: string; value: number; positive?: boolean; muted?: boolean }) {
  return (
    <div className="rounded border border-border/60 bg-background p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${positive ? "text-emerald-600" : muted ? "text-muted-foreground" : ""}`}>
        {value}
      </div>
    </div>
  );
}

export default function ShopifyMigratePage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-pink-500/10">
          <ShoppingBag className="w-5 h-5 text-pink-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Shopify migration</h1>
          <p className="text-xs text-muted-foreground">
            One-shot import for customers + order history. Always run a Dry
            Run first; the real import is idempotent so re-running is safe.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300">
        <strong>Run order:</strong> import <em>customers first</em>, then orders.
        Orders that can&apos;t find a matching customer (by phone or email) will
        be flagged as &quot;Unmatched&quot; and skipped on the live run.
      </div>

      <Tabs defaultValue="customers">
        <TabsList>
          <TabsTrigger value="customers" className="gap-2">
            <Users className="w-4 h-4" /> Customers
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-2">
            <ShoppingBag className="w-4 h-4" /> Orders
          </TabsTrigger>
        </TabsList>
        <TabsContent value="customers" className="mt-4">
          <ImportTab
            kind="customers"
            icon={Users}
            label="Customers"
            description="Imports customers and their default addresses. Matched by phone first, then email — duplicates merge into the existing Gifteeng customer."
            samplePath="https://admin.shopify.com/store/customers"
          />
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          <ImportTab
            kind="orders"
            icon={ShoppingBag}
            label="Orders"
            description="Imports historical orders with line items. Order numbers prefixed SH- to avoid colliding with native Gifteeng orders. Re-run safe."
            samplePath="https://admin.shopify.com/store/orders"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
