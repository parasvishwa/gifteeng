"use client";

/**
 * SeoPanel — Admin SEO Intelligence Panel
 *
 * Shows the auto-generated SEO metadata for a product, with:
 *  • Google SERP snippet preview (exactly how Google shows it)
 *  • SEO score gauge (0-100)
 *  • Improvement suggestions
 *  • One-click Rule-based regenerate (instant)
 *  • One-click AI regenerate (uses Claude/GPT)
 *  • Manual override for title + description
 *
 * The data pipeline:
 *  Admin creates/updates product → ProductsService calls SeoEnrichmentService.enrichProductAsync()
 *  → rule-based data saved in metadata.seo instantly
 *  → if AI key configured, AI-enhanced data saved within ~3s
 *  → Next.js product page picks it up on next ISR revalidate
 */

import { useEffect, useState } from "react";
import { apiB2b } from "@/lib/api";
import { Sparkles, RefreshCw, CheckCircle2, AlertCircle, Info, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FaqItem { q: string; a: string; }

interface SeoData {
  title:          string;
  description:    string;
  keywords:       string[];
  altTexts:       string[];
  faq:            FaqItem[];
  score:          number;
  method:         "rule" | "ai" | "manual";
  lastEnrichedAt: string;
  version:        number;
  suggestions?:   string[];
}

interface SeoPanelProps {
  productId: string;
  productSlug: string;
  /** Called after a successful regeneration so the parent editor can refresh */
  onRegenerated?: (seo: SeoData) => void;
}

// ── Score colour ──────────────────────────────────────────────────────────────
function scoreColor(score: number): string {
  if (score >= 80) return "#10b981"; // green
  if (score >= 55) return "#f59e0b"; // amber
  return "#ef4444";                   // red
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 55) return "Needs improvement";
  return "Poor";
}

// ── Google SERP snippet preview ───────────────────────────────────────────────
function SerpPreview({ title, description, url }: { title: string; description: string; url: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-4 font-sans" style={{ maxWidth: 600 }}>
      <p className="text-[12px] text-gray-500 mb-1 truncate">{url}</p>
      <p className="text-[18px] text-[#1a0dab] font-normal leading-tight hover:underline cursor-pointer truncate">
        {title || "No title yet"}
      </p>
      <p className="text-[13px] text-[#4d5156] leading-snug mt-1 line-clamp-2">
        {description || "No description yet."}
      </p>
      {/* Character count indicators */}
      <div className="flex gap-4 mt-2">
        <span className={`text-[10px] font-mono ${title.length > 60 ? "text-red-500" : "text-gray-400"}`}>
          Title: {title.length}/60 chars {title.length > 60 ? "⚠️ Too long" : "✓"}
        </span>
        <span className={`text-[10px] font-mono ${description.length > 160 ? "text-red-500" : "text-gray-400"}`}>
          Desc: {description.length}/160 chars {description.length > 160 ? "⚠️ Too long" : "✓"}
        </span>
      </div>
    </div>
  );
}

// ── Score gauge ───────────────────────────────────────────────────────────────
function ScoreGauge({ score }: { score: number }) {
  const color = scoreColor(score);
  const circumference = 2 * Math.PI * 28;
  const dash = (score / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={80} height={80} className="-rotate-90">
        <circle cx={40} cy={40} r={28} fill="none" stroke="#e5e7eb" strokeWidth={6} />
        <circle
          cx={40} cy={40} r={28}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.5s ease" }}
        />
      </svg>
      <p className="text-xl font-black -mt-[4.2rem]" style={{ color }}>{score}</p>
      <p className="text-[11px] font-semibold mt-8" style={{ color }}>{scoreLabel(score)}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function SeoPanel({ productId, productSlug, onRegenerated }: SeoPanelProps) {
  const [seo, setSeo]           = useState<SeoData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [regen, setRegen]       = useState<null | "rule" | "ai">(null);
  const [expanded, setExpanded] = useState(false);
  const [toast, setToast]       = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const siteUrl = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.host.replace(":3001", "").replace(":3000", "")}`
    : "https://gifteeng.com";

  const productUrl = `${siteUrl}/b2c/products/${productSlug}`;

  // Load current SEO
  useEffect(() => {
    setLoading(true);
    apiB2b()
      .get<SeoData>(`/api/products/admin/${productId}/seo`)
      .then((data) => { setSeo(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [productId]);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const handleRegenerate = async (withAi: boolean) => {
    setRegen(withAi ? "ai" : "rule");
    try {
      const result = await apiB2b().post<{ success: boolean; seo: SeoData }>(
        `/api/products/admin/${productId}/seo/regenerate${withAi ? "?ai=true" : ""}`,
      );
      setSeo(result.seo);
      onRegenerated?.(result.seo);
      showToast("success", withAi ? "AI SEO regenerated!" : "SEO refreshed (rule-based)");
    } catch {
      showToast("error", "Regeneration failed. Check API connection.");
    } finally {
      setRegen(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading SEO data…
      </div>
    );
  }

  if (!seo) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <p className="font-semibold mb-2">No SEO data yet</p>
        <button
          onClick={() => handleRegenerate(false)}
          className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:opacity-90"
        >
          Generate SEO Now
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className={`px-4 py-2.5 text-sm font-semibold flex items-center gap-2 ${toast.type === "success" ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-700"}`}>
          {toast.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-black text-foreground">SEO Intelligence</p>
            <p className="text-[10px] text-muted-foreground">
              Auto-generated · {seo.method === "ai" ? "AI-enhanced" : seo.method === "manual" ? "Manually set" : "Rule-based"}
              {seo.lastEnrichedAt && ` · ${new Date(seo.lastEnrichedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Rule-based refresh */}
          <button
            disabled={regen !== null}
            onClick={() => handleRegenerate(false)}
            title="Regenerate with templates (instant)"
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-[11px] font-bold text-foreground hover:bg-muted/60 disabled:opacity-50 transition-all"
          >
            {regen === "rule" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Refresh
          </button>
          {/* AI regenerate */}
          <button
            disabled={regen !== null}
            onClick={() => handleRegenerate(true)}
            title="Regenerate with AI (uses Claude/GPT — ~3s)"
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-3 py-1.5 text-[11px] font-bold text-white hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
          >
            {regen === "ai" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            AI Regenerate
          </button>
        </div>
      </div>

      {/* Score + SERP preview */}
      <div className="flex items-start gap-5 p-5">
        <ScoreGauge score={seo.score} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-2">Google Preview</p>
          <SerpPreview title={seo.title} description={seo.description} url={productUrl} />
        </div>
      </div>

      {/* Suggestions */}
      {seo.suggestions && seo.suggestions.length > 0 && (
        <div className="mx-5 mb-4 rounded-xl bg-amber-50 border border-amber-200/60 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-2">Improvements needed</p>
          <ul className="space-y-1">
            {seo.suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-800">
                <Info className="w-3 h-3 shrink-0 mt-0.5 text-amber-500" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Expandable details */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 border-t border-border text-[11px] font-bold text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        <span>View all SEO fields ({seo.keywords?.length ?? 0} keywords · {seo.altTexts?.length ?? 0} alt texts · {seo.faq?.length ?? 0} FAQs)</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="border-t border-border p-5 space-y-5 bg-muted/20">

          {/* Keywords */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/60 mb-2">Target Keywords</p>
            <div className="flex flex-wrap gap-1.5">
              {(seo.keywords ?? []).map((kw, i) => (
                <span key={i} className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[10px] font-medium text-foreground">
                  {kw}
                </span>
              ))}
            </div>
          </div>

          {/* Alt texts */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/60 mb-2">Image Alt Texts</p>
            <div className="space-y-1.5">
              {(seo.altTexts ?? []).map((alt, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-foreground/80">
                  <span className="shrink-0 w-4 h-4 rounded bg-muted text-[9px] font-bold flex items-center justify-center text-muted-foreground">{i + 1}</span>
                  {alt}
                </div>
              ))}
            </div>
          </div>

          {/* FAQ */}
          {seo.faq && seo.faq.length > 0 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/60 mb-2">FAQ Schema (Rich Snippets)</p>
              <div className="space-y-3">
                {seo.faq.map((item, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card p-3">
                    <p className="text-[11px] font-bold text-foreground mb-1">Q: {item.q}</p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">A: {item.a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
