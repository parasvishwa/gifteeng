"use client";

// Super-admin — Stickers catalog viewer + pack seed button.
// Stickers are system-owned; admin doesn't hand-edit them, just seeds + inspects.
//
// Endpoints:
//   GET  /api/stickers/catalog              → public — used by mobile too
//   POST /api/stickers/admin/seed-packs     → one-click seed of 24-sticker
//                                             volume catalog (idempotent)
//   POST /api/stickers/admin/seed           → legacy 50-sticker theme catalog

import { useState, useEffect, useMemo } from "react";
import { Badge, Button } from "@gifteeng/ui";
import {
  Sparkles, Package, Loader2, RefreshCw, CheckCircle2, AlertCircle,
} from "lucide-react";
import { authHeaders, getApiBase, safeGet, safePost } from "@/lib/admin-api";

interface Sticker {
  id: string;
  code: string;
  emoji: string;
  name: string;
  volume: string;
  rarity: "common" | "rare" | "epic" | "legendary" | "mythic" | string;
}

const RARITY_COLOR: Record<string, string> = {
  common:    "bg-slate-500/15 text-slate-500 border-slate-500/30",
  rare:      "bg-blue-500/15 text-blue-500 border-blue-500/30",
  epic:      "bg-violet-500/15 text-violet-500 border-violet-500/30",
  legendary: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  mythic:    "bg-pink-500/15 text-pink-500 border-pink-500/30",
};

const RARITY_COIN: Record<string, number> = {
  common: 5, rare: 12, epic: 30, legendary: 75, mythic: 150,
};

const VOLUME_ORDER = ["Festive Spirit", "Love & Romance", "Celebration", "Mystic Legends"];

export default function AdminStickers() {
  const [catalog, setCatalog] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState<"packs" | "legacy" | null>(null);
  const [seedResult, setSeedResult] = useState<string | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await safeGet<Sticker[]>("/stickers/catalog", []);
    setCatalog(Array.isArray(data) ? data : []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const seed = async (which: "packs" | "legacy") => {
    setSeeding(which); setSeedError(null); setSeedResult(null);
    const path = which === "packs" ? "/stickers/admin/seed-packs" : "/stickers/admin/seed";
    const out = await safePost<{ seeded: number } | null>(path, {}, null);
    setSeeding(null);
    if (!out) { setSeedError("Seed request failed."); return; }
    if (out.seeded === 0) {
      setSeedResult(`Catalog already complete — 0 new stickers added.`);
    } else {
      setSeedResult(`Added ${out.seeded} new sticker${out.seeded === 1 ? "" : "s"}.`);
    }
    await load();
  };

  // Group by volume (pack-based)
  const byVolume = useMemo(() => {
    const m = new Map<string, Sticker[]>();
    for (const s of catalog) {
      const v = s.volume || "Unknown";
      if (!m.has(v)) m.set(v, []);
      m.get(v)!.push(s);
    }
    // Order volumes so the pack volumes sort first
    const sorted: [string, Sticker[]][] = [];
    for (const v of VOLUME_ORDER) if (m.has(v)) sorted.push([v, m.get(v)!]);
    for (const [v, list] of m) if (!VOLUME_ORDER.includes(v)) sorted.push([v, list]);
    return sorted;
  }, [catalog]);

  const totalByRarity = useMemo(() => {
    const out: Record<string, number> = { common: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 };
    for (const s of catalog) out[s.rarity] = (out[s.rarity] ?? 0) + 1;
    return out;
  }, [catalog]);

  return (
    <div className="max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-display font-bold tracking-tight">Stickers</h1>
          <p className="text-xs text-muted-foreground">
            Catalog browser + one-click seed. Customers collect via pack-opening in the app.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5 h-8 text-xs">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-6 gap-2">
        <Stat label="Total" val={catalog.length} />
        {(["common", "rare", "epic", "legendary", "mythic"] as const).map((r) => (
          <Stat key={r} label={r} val={totalByRarity[r] ?? 0} pillColor={RARITY_COLOR[r]} />
        ))}
      </div>

      {/* Seed actions */}
      <div className="bg-card rounded-xl border border-border/40 p-5 space-y-3">
        <h2 className="text-sm font-semibold">Catalog seed</h2>
        <p className="text-xs text-muted-foreground">
          One-click seeders. Idempotent — safe to click multiple times. Existing stickers are never modified.
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => seed("packs")}
            disabled={seeding !== null}
            className="gap-1.5 h-8 text-xs"
          >
            {seeding === "packs"
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Package className="w-3.5 h-3.5" />
            }
            Seed pack catalog (24 stickers · 4 volumes)
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => seed("legacy")}
            disabled={seeding !== null}
            className="gap-1.5 h-8 text-xs"
          >
            {seeding === "legacy"
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Package className="w-3.5 h-3.5" />
            }
            Seed legacy row catalog (50 stickers · 5 themes)
          </Button>
        </div>
        {seedResult && (
          <div className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 rounded-lg p-3 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> {seedResult}
          </div>
        )}
        {seedError && (
          <div className="bg-rose-500/10 text-rose-600 border border-rose-500/30 rounded-lg p-3 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {seedError}
          </div>
        )}
        <div className="bg-muted/20 rounded-lg p-3 text-xs text-muted-foreground">
          <p><strong className="text-foreground">Drop weights</strong> (on pack-open):
            &nbsp;common 55% · rare 25% · epic 14% · legendary 5% · mythic 1%</p>
          <p className="mt-1"><strong className="text-foreground">Duplicate Goin payouts</strong>:
            &nbsp;common {RARITY_COIN.common} · rare {RARITY_COIN.rare} · epic {RARITY_COIN.epic}
            &nbsp;· legendary {RARITY_COIN.legendary} · mythic {RARITY_COIN.mythic}</p>
        </div>
      </div>

      {/* Catalog grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : catalog.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <Sparkles className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm font-medium mb-1">Catalog is empty</p>
          <p className="text-xs text-muted-foreground">
            Click "Seed pack catalog" above to add the 24-sticker starter set.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {byVolume.map(([volume, stickers]) => (
            <div key={volume} className="bg-card rounded-xl border border-border/40 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/10">
                <h3 className="font-semibold text-sm">{volume}</h3>
                <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                  {stickers.length} stickers
                </Badge>
              </div>
              <div className="grid grid-cols-6 gap-2 p-4">
                {stickers.map((s) => (
                  <div
                    key={s.id}
                    className="bg-muted/10 rounded-lg p-3 border border-border/30 flex flex-col items-center gap-1"
                    title={s.code}
                  >
                    <span className="text-2xl">{s.emoji}</span>
                    <span className="text-[11px] font-medium truncate w-full text-center">{s.name}</span>
                    <Badge className={`text-[8px] h-4 px-1.5 uppercase ${RARITY_COLOR[s.rarity] ?? ""}`}>
                      {s.rarity}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label, val, pillColor,
}: { label: string; val: number; pillColor?: string }) {
  return (
    <div className="bg-card rounded-xl p-3 border border-border/40 text-center">
      <span
        className={`text-[9px] uppercase tracking-wider font-semibold inline-block px-2 py-0.5 rounded-full ${pillColor ?? "text-muted-foreground"}`}
      >
        {label}
      </span>
      <p className="text-xl font-bold tracking-tight mt-1">{val}</p>
    </div>
  );
}
