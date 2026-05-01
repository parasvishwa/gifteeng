"use client";

/**
 * Milestone Rewards — admin page.
 *
 * Configures the every-Nth-signup celebration drop. Two independent counters:
 *   • Web — every Nth person who signs up via the website gets bonus Goins.
 *   • App — every Nth person who signs up via the Flutter app gets bonus Goins.
 *
 * Trigger fires automatically on customer creation (in auth-b2c controller),
 * with a celebratory push and an in-app/in-web confetti popup on next visit.
 */

import { useEffect, useState } from "react";
import {
  Trophy, Save, Sparkles, Globe, Smartphone, Gift,
  Users, Coins, TrendingUp, Power,
} from "lucide-react";
import { adminGet, adminPatch } from "@/lib/admin-api";

interface Config {
  id: string;
  webEnabled: boolean; webEvery: number; webGoins: number;
  webTitle:   string;  webBody:  string;  webCounter: number;
  appEnabled: boolean; appEvery: number; appGoins: number;
  appTitle:   string;  appBody:  string;  appCounter: number;
  ctaUrl:     string;
}

interface Stats {
  totalWeb: number; totalApp: number; last24h: number;
  totalGoinsAwarded: number;
}

interface Sent {
  id: string; customerId: string; kind: string; position: number;
  amount: number; pushSent: boolean; sentAt: string;
  customer: { fullName: string | null; phone: string | null; email: string | null } | null;
}

export default function MilestoneRewardsPage() {
  const [cfg, setCfg]       = useState<Config | null>(null);
  const [stats, setStats]   = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Sent[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const fetchAll = async () => {
    const [c, s, r] = await Promise.all([
      adminGet<Config>("/admin/milestone-rewards/config", null as unknown as Config),
      adminGet<Stats>("/admin/milestone-rewards/stats",
        { totalWeb: 0, totalApp: 0, last24h: 0, totalGoinsAwarded: 0 }),
      adminGet<Sent[]>("/admin/milestone-rewards/recent?limit=50", []),
    ]);
    if (c) setCfg(c);
    setStats(s);
    setRecent(Array.isArray(r) ? r : []);
  };

  useEffect(() => { fetchAll(); }, []);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    await adminPatch("/admin/milestone-rewards/config", {
      webEnabled: cfg.webEnabled, webEvery: cfg.webEvery, webGoins: cfg.webGoins,
      webTitle:   cfg.webTitle,   webBody:  cfg.webBody,
      appEnabled: cfg.appEnabled, appEvery: cfg.appEvery, appGoins: cfg.appGoins,
      appTitle:   cfg.appTitle,   appBody:  cfg.appBody,
      ctaUrl:     cfg.ctaUrl,
    }, {});
    setSaving(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
    fetchAll();
  };

  if (!cfg) {
    return <div className="p-12 text-center text-muted-foreground">Loading config…</div>;
  }

  const previewVar = (s: string, vars: Record<string, string | number>) =>
    s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

  return (
    <div className="container max-w-5xl mx-auto py-6 px-4 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-500" />
            Milestone Rewards
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every Nth signup gets bonus Goins + a celebration push. Two independent counters: web vs app.
          </p>
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-[#EF3752] text-white disabled:opacity-50">
          {saving ? "Saving…" : <><Save className="w-3.5 h-3.5" /> Save</>}
        </button>
      </div>

      {savedFlash && (
        <div className="rounded-lg p-3 text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
          ✓ Configuration saved.
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatBox label="Web milestones hit" value={stats.totalWeb} icon={Globe} color="text-blue-600" />
          <StatBox label="App milestones hit" value={stats.totalApp} icon={Smartphone} color="text-emerald-600" />
          <StatBox label="Last 24h"           value={stats.last24h} icon={TrendingUp} color="text-purple-600" />
          <StatBox label="Goins awarded total" value={stats.totalGoinsAwarded} icon={Coins} color="text-amber-600" />
        </div>
      )}

      {/* Live counters */}
      <div className="grid md:grid-cols-2 gap-3">
        <CounterCard
          icon={Globe} title="Web signups so far" tint="text-blue-600"
          counter={cfg.webCounter} every={cfg.webEvery}
        />
        <CounterCard
          icon={Smartphone} title="App signups so far" tint="text-emerald-600"
          counter={cfg.appCounter} every={cfg.appEvery}
        />
      </div>

      {/* Web config */}
      <ConfigSection
        kind="web" tint="text-blue-600" iconLeft={Globe}
        enabled={cfg.webEnabled}  setEnabled={(v) => setCfg({ ...cfg, webEnabled: v })}
        every={cfg.webEvery}      setEvery={(v) => setCfg({ ...cfg, webEvery: v })}
        goins={cfg.webGoins}      setGoins={(v) => setCfg({ ...cfg, webGoins: v })}
        title={cfg.webTitle}      setTitle={(v) => setCfg({ ...cfg, webTitle: v })}
        body={cfg.webBody}        setBody={(v) => setCfg({ ...cfg, webBody: v })}
        previewVar={previewVar}
      />

      {/* App config */}
      <ConfigSection
        kind="app" tint="text-emerald-600" iconLeft={Smartphone}
        enabled={cfg.appEnabled}  setEnabled={(v) => setCfg({ ...cfg, appEnabled: v })}
        every={cfg.appEvery}      setEvery={(v) => setCfg({ ...cfg, appEvery: v })}
        goins={cfg.appGoins}      setGoins={(v) => setCfg({ ...cfg, appGoins: v })}
        title={cfg.appTitle}      setTitle={(v) => setCfg({ ...cfg, appTitle: v })}
        body={cfg.appBody}        setBody={(v) => setCfg({ ...cfg, appBody: v })}
        previewVar={previewVar}
      />

      {/* Shared CTA URL */}
      <div className="rounded-xl border border-border bg-card p-4">
        <label className="block text-xs font-bold mb-1.5">CTA deep link (where the celebration push opens)</label>
        <input value={cfg.ctaUrl}
          onChange={(e) => setCfg({ ...cfg, ctaUrl: e.target.value })}
          placeholder="/goins"
          className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
      </div>

      {/* Recent winners */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-bold text-sm">Recent winners</h2>
        </div>
        {recent.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground text-sm">No winners yet — they'll appear here as signups hit milestones.</p>
        ) : (
          <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
            {recent.map((r) => (
              <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
                  <Trophy className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold flex items-center gap-2">
                    {r.customer?.fullName ?? r.customer?.phone ?? "Customer"}
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700">
                      {r.kind === "web" ? "WEB" : "APP"} #{r.position}
                    </span>
                    <span className="text-amber-600">+{r.amount.toLocaleString()} Goins</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(r.sentAt).toLocaleString()}
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

function ConfigSection(p: {
  kind: "web" | "app"; tint: string; iconLeft: React.ElementType;
  enabled: boolean; setEnabled: (v: boolean) => void;
  every: number; setEvery: (v: number) => void;
  goins: number; setGoins: (v: number) => void;
  title: string; setTitle: (v: string) => void;
  body:  string; setBody:  (v: string) => void;
  previewVar: (s: string, vars: Record<string, string | number>) => string;
}) {
  const Icon = p.iconLeft;
  const label = p.kind === "web" ? "Website" : "App";
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold flex items-center gap-2">
          <Icon className={`w-4 h-4 ${p.tint}`} />
          {label} milestone
        </h2>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={p.enabled} onChange={(e) => p.setEnabled(e.target.checked)} className="w-4 h-4" />
          <span className="text-xs font-bold">{p.enabled ? "Enabled" : "Disabled"}</span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold mb-1.5">Every Nth signup</label>
          <input type="number" min={1} value={p.every}
            onChange={(e) => p.setEvery(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold mb-1.5">Goins awarded</label>
          <input type="number" min={1} value={p.goins}
            onChange={(e) => p.setGoins(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold mb-1.5">Push title <span className="text-muted-foreground font-normal">— vars: {"{firstName}"}, {"{position}"}, {"{amount}"}</span></label>
        <input value={p.title}
          onChange={(e) => p.setTitle(e.target.value)}
          maxLength={200}
          className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
      </div>

      <div>
        <label className="block text-xs font-bold mb-1.5">Push body</label>
        <textarea value={p.body}
          onChange={(e) => p.setBody(e.target.value)}
          rows={2} maxLength={500}
          className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm resize-none" />
      </div>

      {/* Live preview */}
      <div className="rounded-lg border border-border p-3 bg-muted/30">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Preview</p>
        <div className="rounded-lg bg-card border border-border p-3 shadow-sm">
          <p className="font-bold text-sm">
            {p.previewVar(p.title, { firstName: "Rohan", position: p.every, amount: p.goins })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {p.previewVar(p.body, { firstName: "Rohan", position: p.every, amount: p.goins })}
          </p>
        </div>
      </div>
    </div>
  );
}

function CounterCard({ icon: Icon, title, tint, counter, every }: {
  icon: React.ElementType; title: string; tint: string; counter: number; every: number;
}) {
  const next = Math.ceil((counter + 1) / every) * every;
  const remaining = next - counter;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
        <Icon className={`w-3.5 h-3.5 ${tint}`} />
      </div>
      <p className={`text-3xl font-black ${tint}`}>{counter.toLocaleString()}</p>
      <p className="text-[11px] text-muted-foreground mt-1">
        Next milestone at <strong>#{next.toLocaleString()}</strong> · {remaining.toLocaleString()} signup{remaining === 1 ? "" : "s"} away
      </p>
    </div>
  );
}

function StatBox({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">{label}</span>
        <Icon className={`w-3.5 h-3.5 ${color}`} />
      </div>
      <p className={`text-2xl font-black ${color}`}>{value.toLocaleString()}</p>
    </div>
  );
}
