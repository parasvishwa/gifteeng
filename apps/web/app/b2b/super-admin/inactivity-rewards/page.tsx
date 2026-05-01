"use client";

/**
 * Inactivity Goin Rewards — admin page.
 *
 * Configures the re-engagement system that drops random Goins on dormant
 * customers and pushes "We missed you, here's X Goins!". Hook the cron at
 * POST /admin/inactivity-rewards/run to a daily schedule.
 */

import { useEffect, useState } from "react";
import {
  Coins, Power, Sparkles, Save, Play, Send, Clock,
  TrendingDown, Users, Gift,
} from "lucide-react";
import { adminGet, adminPost, adminPatch } from "@/lib/admin-api";

interface Config {
  id:                  string;
  enabled:             boolean;
  minGoins:            number;
  maxGoins:            number;
  minInactiveDays:     number;
  cooldownDays:        number;
  maxLifetimePerUser:  number;
  dailyDropRate:       number;
  pushTitleTemplate:   string;
  pushBodyTemplate:    string;
  ctaUrl:              string;
}

interface Stats {
  totalAwards:       number;
  last24h:           number;
  last7d:            number;
  totalGoinsAwarded: number;
}

interface RecentSend {
  id:           string;
  customerId:   string;
  amount:       number;
  inactiveDays: number;
  pushSent:     boolean;
  sentAt:       string;
  customer:     { fullName: string | null; phone: string | null; email: string | null } | null;
}

export default function InactivityRewardsPage() {
  const [cfg, setCfg]       = useState<Config | null>(null);
  const [stats, setStats]   = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentSend[]>([]);
  const [running, setRunning] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  const fetchAll = async () => {
    const [c, s, r] = await Promise.all([
      adminGet<Config>("/admin/inactivity-rewards/config", null as unknown as Config),
      adminGet<Stats>("/admin/inactivity-rewards/stats",
        { totalAwards: 0, last24h: 0, last7d: 0, totalGoinsAwarded: 0 }),
      adminGet<RecentSend[]>("/admin/inactivity-rewards/recent?limit=50", []),
    ]);
    if (c) setCfg(c);
    setStats(s);
    setRecent(Array.isArray(r) ? r : []);
  };

  useEffect(() => { fetchAll(); }, []);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    await adminPatch("/admin/inactivity-rewards/config", {
      enabled:            cfg.enabled,
      minGoins:           cfg.minGoins,
      maxGoins:           cfg.maxGoins,
      minInactiveDays:    cfg.minInactiveDays,
      cooldownDays:       cfg.cooldownDays,
      maxLifetimePerUser: cfg.maxLifetimePerUser,
      dailyDropRate:      cfg.dailyDropRate,
      pushTitleTemplate:  cfg.pushTitleTemplate,
      pushBodyTemplate:   cfg.pushBodyTemplate,
      ctaUrl:             cfg.ctaUrl,
    }, {});
    setSaving(false);
    fetchAll();
  };

  const runNow = async () => {
    if (!confirm(`Run drops now? This will award random Goins to eligible inactive users (subject to ${cfg?.dailyDropRate ?? 20}% daily probability per user).`)) return;
    setRunning(true);
    setRunResult(null);
    try {
      const res = await adminPost<{ awarded: number; eligible: number; totalGoinsAwarded: number; skipped: number; enabled: boolean }>(
        "/admin/inactivity-rewards/run", {},
        { awarded: 0, eligible: 0, totalGoinsAwarded: 0, skipped: 0, enabled: false },
      );
      if (!res.enabled) {
        setRunResult("⚠ Feature is disabled — toggle Enabled and save first.");
      } else {
        setRunResult(`✓ Awarded ${res.awarded} of ${res.eligible} eligible users · ${res.totalGoinsAwarded.toLocaleString()} Goins total · ${res.skipped} skipped (random + errors)`);
      }
      fetchAll();
    } catch (e) {
      setRunResult(`✗ Error: ${(e as Error).message ?? "unknown"}`);
    } finally {
      setRunning(false);
    }
  };

  if (!cfg) {
    return <div className="p-12 text-center text-muted-foreground">Loading config…</div>;
  }

  // Live preview
  const previewAmount = Math.round((cfg.minGoins + cfg.maxGoins) / 2);
  const previewVars = (s: string) => s
    .replace(/\{firstName\}/g, "Rohan")
    .replace(/\{amount\}/g,    previewAmount.toString());

  return (
    <div className="container max-w-4xl mx-auto py-6 px-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Coins className="w-6 h-6 text-amber-500" />
            Inactivity Goin Rewards
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Win back dormant customers with random Goin drops + emotion-driven pushes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runNow}
            disabled={running || !cfg.enabled}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-[#EF3752] text-white disabled:opacity-50"
          >
            {running ? <><Sparkles className="w-3.5 h-3.5 animate-spin" /> Running…</> : <><Play className="w-3.5 h-3.5" /> Run Now</>}
          </button>
        </div>
      </div>

      {runResult && (
        <div className={`rounded-lg p-3 text-xs ${
          runResult.startsWith("✓") ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
          : runResult.startsWith("⚠") ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30"
          : "bg-red-500/10 text-red-600 border border-red-500/30"
        }`}>{runResult}</div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatBox label="Awards (24h)"    value={stats.last24h}            icon={Send}        color="text-purple-600" />
          <StatBox label="Awards (7d)"     value={stats.last7d}             icon={TrendingDown} color="text-blue-600" />
          <StatBox label="Total awards"    value={stats.totalAwards}        icon={Users}       color="text-emerald-600" />
          <StatBox label="Goins distributed" value={stats.totalGoinsAwarded} icon={Coins}       color="text-amber-600" />
        </div>
      )}

      {/* Cron hint */}
      <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs text-muted-foreground flex items-start gap-2">
        <Clock className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <strong className="text-foreground">Schedule it:</strong> hook <code className="bg-card px-1 rounded">POST /api/admin/inactivity-rewards/run</code> to a daily cron at ~10:30 IST (high engagement window). Each eligible user has <strong>{cfg.dailyDropRate}%</strong> chance of being awarded per run, naturally staggering drops over days.
        </div>
      </div>

      {/* Config */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2"><Gift className="w-4 h-4" /> Configuration</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={cfg.enabled}
              onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-xs font-bold">{cfg.enabled ? "Enabled" : "Disabled"}</span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Min Goins per drop">
            <input type="number" min={1} max={10000} value={cfg.minGoins}
              onChange={(e) => setCfg({ ...cfg, minGoins: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
          </Field>
          <Field label="Max Goins per drop">
            <input type="number" min={1} max={10000} value={cfg.maxGoins}
              onChange={(e) => setCfg({ ...cfg, maxGoins: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Inactive days threshold" hint="User must be inactive ≥ this many days">
            <input type="number" min={1} max={365} value={cfg.minInactiveDays}
              onChange={(e) => setCfg({ ...cfg, minInactiveDays: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
          </Field>
          <Field label="Cooldown (days)" hint="Don't re-reward within">
            <input type="number" min={1} max={365} value={cfg.cooldownDays}
              onChange={(e) => setCfg({ ...cfg, cooldownDays: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Max lifetime per user" hint="0 = unlimited">
            <input type="number" min={0} max={100} value={cfg.maxLifetimePerUser}
              onChange={(e) => setCfg({ ...cfg, maxLifetimePerUser: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
          </Field>
          <Field label="Daily drop rate (%)" hint="Random chance per eligible user per day">
            <input type="number" min={0} max={100} value={cfg.dailyDropRate}
              onChange={(e) => setCfg({ ...cfg, dailyDropRate: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
          </Field>
        </div>

        <Field label="Push title (template)" hint="Vars: {firstName} {amount}">
          <input value={cfg.pushTitleTemplate}
            onChange={(e) => setCfg({ ...cfg, pushTitleTemplate: e.target.value })}
            maxLength={200}
            className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
        </Field>

        <Field label="Push body (template)">
          <textarea value={cfg.pushBodyTemplate}
            onChange={(e) => setCfg({ ...cfg, pushBodyTemplate: e.target.value })}
            rows={2} maxLength={500}
            className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm resize-none" />
        </Field>

        <Field label="CTA deep link" hint="Where the push opens when tapped">
          <input value={cfg.ctaUrl}
            onChange={(e) => setCfg({ ...cfg, ctaUrl: e.target.value })}
            placeholder="/goins"
            className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
        </Field>

        {/* Live preview */}
        <div className="rounded-lg border border-border p-3 bg-muted/20">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Preview (with sample data)
          </p>
          <div className="rounded-lg bg-card border border-border p-3 shadow-sm">
            <p className="font-bold text-sm">{previewVars(cfg.pushTitleTemplate)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{previewVars(cfg.pushBodyTemplate)}</p>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Range: {cfg.minGoins}–{cfg.maxGoins} Goins · sample = {previewAmount}
            </p>
          </div>
        </div>

        <button onClick={save} disabled={saving}
          className="w-full py-2.5 rounded-lg bg-[#EF3752] text-white text-sm font-black disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? "Saving…" : <><Save className="w-4 h-4" /> Save Configuration</>}
        </button>
      </div>

      {/* Recent awards log */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-bold text-sm">Recent awards</h2>
        </div>
        {recent.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground text-sm">No awards yet.</p>
        ) : (
          <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
            {recent.map((r) => (
              <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
                  <Coins className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold">
                    {r.customer?.fullName ?? r.customer?.phone ?? "Customer"}
                    <span className="ml-2 text-amber-600">+{r.amount.toLocaleString()} Goins</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Inactive {r.inactiveDays}d · {new Date(r.sentAt).toLocaleString()}
                    {r.pushSent ? " · ✓ push delivered" : " · push not delivered"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
          {label}
        </span>
        <Icon className={`w-3.5 h-3.5 ${color}`} />
      </div>
      <p className={`text-2xl font-black ${color}`}>{value.toLocaleString()}</p>
    </div>
  );
}

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-bold mb-1.5">
        {label}
        {hint && <span className="ml-1 text-muted-foreground font-normal">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}
