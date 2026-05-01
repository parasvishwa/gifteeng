"use client";

/**
 * Admin · Games & Rewards
 *  - View & edit all 5 GameConfig reward pools (scratch_card, jackpot,
 *    mystery_box, spin_wheel, streak) — JSON editor with validation
 *  - Toggle active / daily limit / cost Goins
 *  - Seed default pools (idempotent)
 *  - Secret Bid: list items, create a new one, seed-daily
 *  - Flash Jackpot: live feed + current hour state
 */

import { useState, useEffect, useCallback } from "react";
import {
  Sparkles, Gift, Loader2, CheckCircle2, AlertCircle, RefreshCw,
  Save, Plus, Zap, Trophy, Settings2,
} from "lucide-react";
import { Button, Input, Label, Badge } from "@gifteeng/ui";
import AdminPageGuide from "../_components/AdminPageGuide";
import { getApiBase } from "@/lib/admin-api";

function authHdr(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("gifteeng.b2b.token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(`${getApiBase()}/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...authHdr(), ...(init?.headers ?? {}) },
    });
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) return null;
    return data as T;
  } catch { return null; }
}

type GameConfig = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  rewardPool: any[];
  dailyLimit: number;
  costGoins: number;
  isActive: boolean;
};

type BidItem = {
  id: string;
  title: string;
  prizeLabel: string;
  status: string;
  opensAt: string;
  closesAt: string;
  winnerEntryId: string | null;
  _count: { entries: number };
};

type FlashState = {
  hourBucket: string;
  hasWinner: boolean;
  winner: { name: string; rewardLabel: string } | null;
};

type FlashWinner = {
  id: string;
  name: string;
  rewardLabel: string;
  createdAt: string;
};

export default function AdminGamesPage() {
  const [configs, setConfigs]   = useState<GameConfig[]>([]);
  const [bids, setBids]         = useState<BidItem[]>([]);
  const [flashState, setFlashState] = useState<FlashState | null>(null);
  const [flashFeed, setFlashFeed] = useState<FlashWinner[]>([]);
  const [loading, setLoading]   = useState(true);
  const [active, setActive]     = useState<string>("scratch_card");
  const [draft, setDraft]       = useState<GameConfig | null>(null);
  const [poolJson, setPoolJson] = useState<string>("");
  const [poolErr, setPoolErr]   = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState<string | null>(null);
  const [newBid, setNewBid]     = useState({
    title: "", prizeLabel: "", description: "",
    minBidGoins: 10, maxBidGoins: 500, costPerEntry: 50,
    hoursOpen: 24,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [cfgs, bidsList, fs, ff] = await Promise.all([
      apiFetch<GameConfig[]>("/games/admin/configs"),
      apiFetch<BidItem[]>("/bids/admin/items"),
      apiFetch<FlashState>("/flash-jackpot/state"),
      apiFetch<FlashWinner[]>("/flash-jackpot/feed?limit=10"),
    ]);
    setConfigs(cfgs ?? []);
    setBids(bidsList ?? []);
    setFlashState(fs);
    setFlashFeed(ff ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Sync draft when switching tabs
  useEffect(() => {
    const cfg = configs.find((c) => c.type === active);
    if (cfg) {
      setDraft(cfg);
      setPoolJson(JSON.stringify(cfg.rewardPool, null, 2));
      setPoolErr(null);
    }
  }, [active, configs]);

  const saveConfig = async () => {
    if (!draft) return;
    setSaving(true);
    let pool: any = undefined;
    if (poolJson.trim()) {
      try {
        pool = JSON.parse(poolJson);
        if (!Array.isArray(pool)) throw new Error("Pool must be an array");
        for (const p of pool) {
          if (!p.type || !p.value === undefined || typeof p.weight !== "number" || !p.label) {
            throw new Error("Each pool entry needs {type, value, weight, label}");
          }
        }
      } catch (e: any) {
        setPoolErr(e.message);
        setSaving(false);
        return;
      }
    }
    setPoolErr(null);

    const res = await apiFetch("/games/admin/config", {
      method: "POST",
      body: JSON.stringify({
        type: draft.type,
        title: draft.title,
        description: draft.description,
        dailyLimit: draft.dailyLimit,
        costGoins: draft.costGoins,
        isActive: draft.isActive,
        rewardPool: pool,
      }),
    });
    setSaving(false);
    if (res) {
      setToast("✅ Saved");
      await load();
      setTimeout(() => setToast(null), 3000);
    } else {
      setToast("❌ Save failed");
      setTimeout(() => setToast(null), 3000);
    }
  };

  const seedDefaults = async () => {
    await apiFetch("/games/admin/seed", { method: "POST" });
    setToast("✅ Seed applied");
    await load();
    setTimeout(() => setToast(null), 3000);
  };

  const createBid = async () => {
    if (!newBid.title || !newBid.prizeLabel) return;
    const opensAt = new Date();
    const closesAt = new Date(Date.now() + newBid.hoursOpen * 3600 * 1000);
    await apiFetch("/bids/admin/item", {
      method: "POST",
      body: JSON.stringify({
        title: newBid.title,
        description: newBid.description || undefined,
        prizeLabel: newBid.prizeLabel,
        minBidGoins: newBid.minBidGoins,
        maxBidGoins: newBid.maxBidGoins,
        costPerEntry: newBid.costPerEntry,
        opensAt: opensAt.toISOString(),
        closesAt: closesAt.toISOString(),
      }),
    });
    setNewBid({ title: "", prizeLabel: "", description: "", minBidGoins: 10, maxBidGoins: 500, costPerEntry: 50, hoursOpen: 24 });
    setToast("✅ Bid created");
    await load();
    setTimeout(() => setToast(null), 3000);
  };

  const resolveBid = async (id: string) => {
    await apiFetch(`/bids/resolve/${id}`, { method: "POST" });
    setToast("✅ Bid resolved");
    await load();
    setTimeout(() => setToast(null), 3000);
  };

  const seedDailyBid = async () => {
    await apiFetch("/bids/admin/seed-daily", { method: "POST" });
    setToast("✅ Daily bid seeded");
    await load();
    setTimeout(() => setToast(null), 3000);
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading games…
      </div>
    );
  }

  const GAME_LABEL: Record<string, string> = {
    scratch_card: "🎫 Scratch Card",
    jackpot:      "🎰 Jackpot",
    mystery_box:  "🎁 Mystery Box",
    spin_wheel:   "🎡 Spin Wheel",
    streak:       "🔥 Daily Streak",
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <AdminPageGuide
        title="Games & Rewards"
        description="Configure every game's reward pool, cost and daily limit. Seed defaults, run seasonal campaigns, create Secret Bid items, and monitor Flash Jackpot."
        steps={[
          { text: "Pick a game in the tab strip to edit its reward pool" },
          { text: "Each pool entry is {type, value, weight, label, minCart?, expiresInDays?}" },
          { text: "Higher weight = higher win probability (weights do not need to sum to 100)" },
          { text: "Use 'Seed defaults' to reset any empty pools to the recommended mix" },
          { text: "Create Secret Bid items with a daily open/close window" },
        ]}
        tips={[
          "For discount_pct: value = percentage as string (e.g., '15')",
          "For discount_flat: value = rupees (e.g., '200')",
          "Always include a 'miss' entry with small consolationGoins",
          "Test new pools by playing a few rounds in /b2c/play before launching",
        ]}
      />

      <div className="flex items-center justify-between mb-6 mt-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          Games & Rewards
        </h1>
        <div className="flex gap-2">
          <Button onClick={seedDefaults} variant="secondary">
            <RefreshCw className="w-4 h-4 mr-1" /> Seed defaults
          </Button>
          <Button onClick={load} variant="ghost">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {toast && (
        <div className="fixed top-6 right-6 z-50 rounded-xl bg-foreground text-background px-4 py-2 shadow-xl text-sm font-bold">
          {toast}
        </div>
      )}

      {/* ── Reward pools tab strip ── */}
      <div className="rounded-2xl border border-border p-5 bg-card mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {configs.map((c) => (
            <button
              key={c.id}
              onClick={() => setActive(c.type)}
              className={`px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${
                active === c.type
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              {GAME_LABEL[c.type] ?? c.type}
            </button>
          ))}
        </div>

        {draft && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Title</Label>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>
              <div>
                <Label>Daily limit</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.dailyLimit}
                  onChange={(e) => setDraft({ ...draft, dailyLimit: parseInt(e.target.value, 10) || 0 })}
                />
              </div>
              <div>
                <Label>Cost (Goins)</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.costGoins}
                  onChange={(e) => setDraft({ ...draft, costGoins: parseInt(e.target.value, 10) || 0 })}
                />
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <Input
                value={draft.description ?? ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Reward Pool (JSON array)</Label>
                <span className="text-xs text-muted-foreground">
                  {(() => {
                    try {
                      const p = JSON.parse(poolJson);
                      return Array.isArray(p) ? `${p.length} entries` : "invalid";
                    } catch { return "invalid"; }
                  })()}
                </span>
              </div>
              <textarea
                value={poolJson}
                onChange={(e) => setPoolJson(e.target.value)}
                className="w-full min-h-[260px] rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs"
                spellCheck={false}
              />
              {poolErr && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {poolErr}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                />
                Active
              </label>
              <Button onClick={saveConfig} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Secret Bid ── */}
      <div className="rounded-2xl border border-border p-5 bg-card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" /> Secret Bid
          </h2>
          <Button onClick={seedDailyBid} variant="secondary" size="sm">
            <Plus className="w-4 h-4 mr-1" /> Seed daily
          </Button>
        </div>

        {/* Create new */}
        <div className="rounded-xl border border-dashed border-border p-3 mb-4 space-y-2">
          <p className="text-xs font-bold text-muted-foreground">Create new bid item</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Input placeholder="Title" value={newBid.title} onChange={(e) => setNewBid({ ...newBid, title: e.target.value })} />
            <Input placeholder="Prize label" value={newBid.prizeLabel} onChange={(e) => setNewBid({ ...newBid, prizeLabel: e.target.value })} />
            <Input type="number" placeholder="Cost per entry" value={newBid.costPerEntry} onChange={(e) => setNewBid({ ...newBid, costPerEntry: parseInt(e.target.value, 10) || 0 })} />
            <Input type="number" placeholder="Hours open" value={newBid.hoursOpen} onChange={(e) => setNewBid({ ...newBid, hoursOpen: parseInt(e.target.value, 10) || 24 })} />
          </div>
          <Input placeholder="Description (optional)" value={newBid.description} onChange={(e) => setNewBid({ ...newBid, description: e.target.value })} />
          <div className="flex justify-end">
            <Button onClick={createBid} size="sm" disabled={!newBid.title || !newBid.prizeLabel}>
              <Plus className="w-4 h-4 mr-1" /> Create
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="space-y-2">
          {bids.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No bid items</p>
          ) : (
            bids.map((b) => {
              const closed = new Date(b.closesAt) < new Date();
              return (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{b.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{b.prizeLabel}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {b._count.entries} entries · closes {new Date(b.closesAt).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant={b.status === "open" ? "default" : b.status === "resolved" ? "secondary" : "outline"}>
                    {b.status}
                  </Badge>
                  {closed && b.status !== "resolved" && (
                    <Button size="sm" variant="secondary" onClick={() => resolveBid(b.id)}>
                      <Trophy className="w-3 h-3 mr-1" /> Resolve
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Flash Jackpot ── */}
      <div className="rounded-2xl border border-border p-5 bg-card">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-3">
          <Zap className="w-5 h-5 text-amber-500" fill="currentColor" /> Flash Jackpot
        </h2>

        {flashState && (
          <div className="rounded-xl bg-muted/50 p-3 mb-3 text-sm">
            <p className="font-bold">Current hour: <code>{flashState.hourBucket}</code></p>
            {flashState.hasWinner && flashState.winner ? (
              <p className="text-muted-foreground mt-1">
                Winner: <strong>{flashState.winner.name}</strong> — {flashState.winner.rewardLabel}
              </p>
            ) : (
              <p className="text-muted-foreground mt-1">No winner yet this hour</p>
            )}
          </div>
        )}

        <p className="text-xs font-bold text-muted-foreground mb-2">Recent winners</p>
        <div className="space-y-1">
          {flashFeed.length === 0 ? (
            <p className="text-sm text-muted-foreground">No winners yet</p>
          ) : (
            flashFeed.map((w) => (
              <div key={w.id} className="flex items-center gap-2 text-sm py-1.5 border-b border-border/50">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span className="font-semibold">{w.name}</span>
                <span className="text-muted-foreground flex-1">{w.rewardLabel}</span>
                <span className="text-xs text-muted-foreground">{new Date(w.createdAt).toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
