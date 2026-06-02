"use client";

/**
 * SEO Command Centre — /b2b/super-admin/seo
 *
 * One-stop dashboard for managing automatic SEO enrichment across all products.
 *  • Real-time stats: how many products have SEO vs missing
 *  • Bulk regenerate: fill gaps in one click
 *  • AI upgrade: switch all rule-based products to AI-enhanced
 *  • Sitemap submission helper
 *  • Quick links to Google Search Console
 */

import { useEffect, useState } from "react";
import { apiB2b } from "@/lib/api";
import {
  Sparkles, RefreshCw, Loader2, CheckCircle2, AlertTriangle,
  BarChart3, Search, ExternalLink, Zap, Globe,
} from "lucide-react";

interface BulkResult {
  processed: number;
  updated: number;
  errors: number;
}

interface StatsRow {
  total:   number;
  withSeo: number;
  aiSeo:   number;
  ruleSeo: number;
  noSeo:   number;
  avgScore: number;
}

export default function SeoCommandCentre() {
  const [stats, setStats]     = useState<StatsRow | null>(null);
  const [running, setRunning] = useState<null | "rule" | "ai-upgrade" | "full-ai">(null);
  const [result, setResult]   = useState<BulkResult | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const loadStats = async () => {
    // Derive stats from product list metadata — lightweight count
    try {
      const data = await apiB2b().get<{
        items: Array<{ metadata?: { seo?: { method?: string; score?: number } } }>;
        total: number;
      }>("/api/products/admin/list?pageSize=1000&page=1");

      const items = data.items ?? [];
      const total = data.total ?? items.length;
      let withSeo = 0, aiSeo = 0, ruleSeo = 0, scoreSum = 0;

      for (const p of items) {
        const seo = p.metadata?.seo;
        if (seo?.method) {
          withSeo++;
          if (seo.method === "ai") aiSeo++;
          else ruleSeo++;
          scoreSum += seo.score ?? 0;
        }
      }

      setStats({
        total,
        withSeo,
        aiSeo,
        ruleSeo,
        noSeo:    total - withSeo,
        avgScore: withSeo > 0 ? Math.round(scoreSum / withSeo) : 0,
      });
    } catch {
      setStats(null);
    }
  };

  useEffect(() => { void loadStats(); }, []);

  const runBulk = async (mode: "rule" | "ai-upgrade" | "full-ai") => {
    setRunning(mode);
    setResult(null);
    setError(null);
    try {
      const resp = await apiB2b().post<{ success: boolean } & BulkResult>(
        "/api/products/admin/seo/bulk-regenerate",
        {
          onlyMissing: mode === "rule",
          forceAi:     mode !== "rule",
          limit:       500,
        },
      );
      setResult({ processed: resp.processed, updated: resp.updated, errors: resp.errors });
      await loadStats();
    } catch (err) {
      setError((err as { message?: string })?.message ?? "Bulk regeneration failed.");
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">SEO Command Centre</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-generates and manages SEO metadata for every product.
          </p>
        </div>
        <a
          href="https://search.google.com/search-console"
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <Globe className="w-3.5 h-3.5" /> Search Console <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total Products",  value: stats.total,    icon: BarChart3, color: "text-foreground" },
            { label: "Have SEO",        value: stats.withSeo,  icon: CheckCircle2, color: "text-emerald-600" },
            { label: "AI-enhanced",     value: stats.aiSeo,    icon: Sparkles,  color: "text-violet-600" },
            { label: "Rule-based",      value: stats.ruleSeo,  icon: Zap,       color: "text-amber-600" },
            { label: "Missing SEO",     value: stats.noSeo,    icon: AlertTriangle, color: "text-red-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-2xl border border-border bg-card p-4 text-center">
              <Icon className={`w-5 h-5 mx-auto mb-2 ${color}`} />
              <p className={`text-2xl font-black ${color}`}>{value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Average score bar */}
      {stats && stats.withSeo > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold">Average SEO Score</p>
            <span className="text-2xl font-black" style={{
              color: stats.avgScore >= 80 ? "#10b981" : stats.avgScore >= 55 ? "#f59e0b" : "#ef4444"
            }}>
              {stats.avgScore}/100
            </span>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${stats.avgScore}%`,
                background: stats.avgScore >= 80 ? "#10b981" : stats.avgScore >= 55 ? "#f59e0b" : "#ef4444",
              }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Based on {stats.withSeo} products. Target: 80+ for rich snippet eligibility.
          </p>
        </div>
      )}

      {/* Bulk actions */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="font-black text-sm">Bulk SEO Actions</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Process all products. New products auto-enrich on save — use these for existing catalog.
          </p>
        </div>
        <div className="p-5 space-y-3">

          {/* Fill missing */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 p-4">
            <div>
              <p className="text-sm font-bold flex items-center gap-1.5"><Zap className="w-4 h-4 text-amber-500" /> Fill Missing SEO</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Generates rule-based SEO for products that have none. Fast, free, instant.
                {stats ? ` Affects ~${stats.noSeo} products.` : ""}
              </p>
            </div>
            <button
              disabled={running !== null}
              onClick={() => runBulk("rule")}
              className="shrink-0 flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50 transition-all"
            >
              {running === "rule" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              Run Now
            </button>
          </div>

          {/* AI upgrade */}
          <div className="flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50/50 p-4">
            <div>
              <p className="text-sm font-bold flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-violet-600" /> AI Upgrade All</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Upgrades all rule-based products to AI-enhanced SEO using Claude/GPT.
                Costs API tokens. Recommended once a week.
                {stats ? ` Affects ~${stats.ruleSeo} products.` : ""}
              </p>
            </div>
            <button
              disabled={running !== null}
              onClick={() => runBulk("ai-upgrade")}
              className="shrink-0 flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
            >
              {running === "ai-upgrade" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              AI Upgrade
            </button>
          </div>

          {/* Full regen */}
          <div className="flex items-center justify-between rounded-xl border border-border p-4">
            <div>
              <p className="text-sm font-bold flex items-center gap-1.5"><RefreshCw className="w-4 h-4 text-muted-foreground" /> Full Regeneration</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Regenerates SEO for all products (including already-enriched ones) with AI.
                Use after major brand/messaging changes.
              </p>
            </div>
            <button
              disabled={running !== null}
              onClick={() => runBulk("full-ai")}
              className="shrink-0 flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-bold text-foreground hover:bg-muted/60 disabled:opacity-50 transition-all"
            >
              {running === "full-ai" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Regenerate All
            </button>
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className="mx-5 mb-5 rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-emerald-800">Bulk enrichment complete</p>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Processed {result.processed} · Updated {result.updated} · Errors {result.errors}
              </p>
            </div>
          </div>
        )}
        {error && (
          <div className="mx-5 mb-5 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-800">
            {error}
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="font-black text-sm mb-4 flex items-center gap-2"><Search className="w-4 h-4 text-primary" /> How Auto-SEO Works</p>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              step: "1",
              title: "Instant (Rule-based)",
              desc: "Every time a product is saved, SEO title, description, 15 keywords, image alt texts, and FAQ schema are generated instantly using smart templates. Zero API cost.",
              color: "#f59e0b",
            },
            {
              step: "2",
              title: "AI-Enhanced (Background)",
              desc: "If Claude or GPT is configured, an AI call runs asynchronously to produce richer, more natural content. Usually completes within 3–5 seconds after save.",
              color: "#8b5cf6",
            },
            {
              step: "3",
              title: "Live on Next Pageview",
              desc: "Next.js ISR revalidates product pages every 10 minutes. Google sees the new metadata on its next crawl — typically within 24–72 hours.",
              color: "#10b981",
            },
          ].map(({ step, title, desc, color }) => (
            <div key={step} className="rounded-xl border border-border p-4">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black mb-3"
                style={{ background: color }}
              >
                {step}
              </div>
              <p className="text-sm font-bold mb-1">{title}</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
