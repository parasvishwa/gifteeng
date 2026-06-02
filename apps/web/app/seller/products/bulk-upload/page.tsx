"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Upload, Download, FileSpreadsheet, CheckCircle2,
  XCircle, Loader2, AlertTriangle, Package, Grid3x3,
} from "lucide-react";
import { getSellerToken } from "@/lib/seller-api";

const API_BASE = "/api";

function authHeader() {
  const t = getSellerToken();
  return t ? `Bearer ${t}` : "";
}

type Step = 1 | 2 | 3;

interface UploadResult {
  created: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

const CATEGORY_ICONS: Record<string, string> = {
  "Photo Frames & Albums":    "🖼️",
  "Mugs & Drinkware":         "☕",
  "Cushions & Pillows":       "🛋️",
  "Wall Art & Canvas":        "🎨",
  "Personalised Jewelry":     "💍",
  "Clothing & Apparels":      "👕",
  "Gift Hampers & Combos":    "🎁",
  "Stationery & Notebooks":   "📓",
  "Home Décor":               "🏠",
  "Keychains & Accessories":  "🔑",
  "Calendars & Planners":     "📅",
  "Cakes & Edibles":          "🎂",
};

export default function BulkUploadPage() {
  const router  = useRouter();
  const [step,      setStep]      = useState<Step>(1);
  const [category,  setCategory]  = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [file,      setFile]      = useState<File | null>(null);
  const [busy,      setBusy]      = useState(false);
  const [result,    setResult]    = useState<UploadResult | null>(null);
  const [err,       setErr]       = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!getSellerToken()) { router.replace("/seller/login"); return; }
    fetch(`${API_BASE}/seller/products/bulk-categories`, {
      headers: { Authorization: authHeader() },
    }).then(r => r.json()).then(d => setCategories(d.categories ?? [])).catch(() => {});
  }, [router]);

  async function downloadTemplate(cat: string | null) {
    const qs  = cat ? `?category=${encodeURIComponent(cat)}` : "";
    const res = await fetch(`${API_BASE}/seller/products/bulk-template${qs}`, {
      headers: { Authorization: authHeader() },
    });
    if (!res.ok) { setErr("Could not download template"); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const slug = cat ? cat.replace(/[^a-z0-9]+/gi, "-").toLowerCase() : "generic";
    a.href = url; a.download = `gifteeng-template-${slug}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleUpload() {
    if (!file) { setErr("Select a CSV file first"); return; }
    setBusy(true); setErr("");
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/seller/products/bulk-upload`, {
        method:  "POST",
        headers: { Authorization: authHeader() },
        body:    form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? `Server error ${res.status}`);
      setResult(data as UploadResult);
      setStep(3);
    } catch (e) {
      setErr((e as Error).message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 bg-card border-b border-border/60 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push("/seller/products")} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <FileSpreadsheet className="w-5 h-5 text-primary" />
        <h1 className="font-black text-base flex-1">Bulk Product Upload</h1>
      </header>

      {/* Step indicator */}
      <div className="flex items-center gap-0 px-6 py-4 bg-white border-b">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-0 flex-1 last:flex-none">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-colors ${
              step === s ? "bg-primary text-primary-foreground" :
              step > s  ? "bg-emerald-500 text-white" :
                          "bg-muted text-muted-foreground"
            }`}>
              {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
            </div>
            {s < 3 && <div className={`h-0.5 flex-1 mx-1 transition-colors ${step > s ? "bg-emerald-400" : "bg-border"}`} />}
          </div>
        ))}
      </div>
      <div className="flex px-6 pb-2 bg-white border-b">
        {["Get template", "Upload CSV", "Review results"].map((l, i) => (
          <div key={i} className="flex-1 text-[10px] font-semibold text-muted-foreground">{l}</div>
        ))}
      </div>

      <div className="max-w-xl mx-auto p-4 space-y-4">

        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Category browser */}
            <div className="rounded-2xl border border-border/50 bg-card p-5">
              <div className="flex items-center gap-2 mb-1">
                <Grid3x3 className="w-4 h-4 text-primary" />
                <h2 className="font-black text-sm">Step 1 — Choose a category</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Select your product category to get a template with the right columns pre-filled.
                Or skip to get the generic template.
              </p>

              <div className="grid grid-cols-3 gap-2 mb-4">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategory(c => c === cat ? null : cat)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-center transition-all text-xs font-semibold ${
                      category === cat
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/50 bg-muted/20 hover:border-primary/30 hover:bg-primary/5 text-foreground"
                    }`}
                  >
                    <span className="text-xl leading-none">{CATEGORY_ICONS[cat] ?? "📦"}</span>
                    <span className="leading-tight">{cat}</span>
                  </button>
                ))}
              </div>

              {category && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-primary font-semibold mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  Template will include extra columns for: <span className="font-black">{category}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => downloadTemplate(category)}
                  className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90"
                >
                  <Download className="w-4 h-4" />
                  {category ? `Download ${category} Template` : "Download Generic Template"}
                </button>
                {category && (
                  <button
                    onClick={() => setCategory(null)}
                    className="px-3 py-2 rounded-xl border border-border/50 text-xs text-muted-foreground hover:bg-muted"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Column guide */}
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <p className="text-xs font-black uppercase tracking-wide text-muted-foreground mb-2">Base columns (all templates)</p>
              <div className="space-y-1">
                {[
                  ["title*",          "Product name (2–160 characters)"],
                  ["price*",          "Your selling price in ₹ (e.g. 499)"],
                  ["stock*",          "Available stock quantity"],
                  ["description",     "Product description"],
                  ["category",        "Category name"],
                  ["sku",             "Your internal SKU code"],
                  ["image_url_1/2",   "Direct image URLs"],
                  ["is_customizable", "true or false"],
                ].map(([col, desc]) => (
                  <div key={col} className="flex gap-2 text-xs">
                    <span className={`font-mono font-bold flex-shrink-0 w-28 ${col.endsWith("*") ? "text-primary" : "text-foreground"}`}>{col}</span>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>All uploaded products will be <strong className="text-foreground">pending admin review</strong> before going live.</p>
                  <p>Maximum <strong>200 rows</strong> per upload. Delete the example rows before uploading.</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90"
            >
              I&apos;ve filled the template → Next
            </button>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/50 bg-card p-5">
              <h2 className="font-black text-sm mb-1">Step 2 — Upload your CSV</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Select the filled template file. Only CSV files are accepted (max 2 MB).
              </p>

              {/* Drop zone */}
              <div
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
                  file
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/50 hover:border-primary/30 hover:bg-primary/5"
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={e => { setFile(e.target.files?.[0] ?? null); setErr(""); }}
                />
                {file ? (
                  <>
                    <FileSpreadsheet className="w-10 h-10 mx-auto mb-2 text-primary" />
                    <p className="text-sm font-bold text-primary">{file.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(file.size / 1024).toFixed(1)} KB — click to change
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-40" />
                    <p className="text-sm font-semibold text-muted-foreground">Click to select CSV file</p>
                    <p className="text-xs text-muted-foreground mt-1">or drag and drop here</p>
                  </>
                )}
              </div>

              {err && <p className="mt-2 text-xs text-destructive font-semibold">{err}</p>}

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 rounded-xl border border-border/50 px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted"
                >
                  ← Back
                </button>
                <button
                  onClick={handleUpload}
                  disabled={busy || !file}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</> : <><Upload className="w-4 h-4" /> Upload & Create</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — Results */}
        {step === 3 && result && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/50 bg-card p-5">
              <h2 className="font-black text-sm mb-4">Upload complete</h2>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
                  <p className="text-2xl font-black text-emerald-600">{result.created}</p>
                  <p className="text-xs text-emerald-700 font-semibold">Created</p>
                </div>
                <div className={`rounded-xl p-3 text-center border ${result.skipped > 0 ? "bg-red-50 border-red-200" : "bg-muted/30 border-border/40"}`}>
                  <XCircle className={`w-6 h-6 mx-auto mb-1 ${result.skipped > 0 ? "text-red-500" : "text-muted-foreground"}`} />
                  <p className={`text-2xl font-black ${result.skipped > 0 ? "text-red-500" : "text-muted-foreground"}`}>{result.skipped}</p>
                  <p className={`text-xs font-semibold ${result.skipped > 0 ? "text-red-600" : "text-muted-foreground"}`}>Skipped</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 mb-4">
                  <p className="text-xs font-bold text-red-700 mb-2">Errors — fix these rows and re-upload:</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <div key={i} className="flex gap-2 text-xs text-red-600">
                        <span className="font-bold flex-shrink-0">Row {e.row}:</span>
                        <span>{e.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.created > 0 && (
                <p className="text-xs text-muted-foreground mb-4">
                  Products are now <strong>pending admin review</strong>. You'll see them in your product list once approved.
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => { setStep(1); setFile(null); setResult(null); setErr(""); }}
                  className="flex-1 rounded-xl border border-border/50 px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted"
                >
                  Upload another file
                </button>
                <button
                  onClick={() => router.push("/seller/products")}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90"
                >
                  <Package className="w-4 h-4" /> View products
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
