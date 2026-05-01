"use client";

/**
 * Cart Recovery — admin page to manage abandonment notification rules.
 *
 * Each rule defines:
 *   • when to fire (minutes of cart inactivity)
 *   • who qualifies (cart value range, logged-in only)
 *   • what to send (title + body with template vars)
 *   • cooldown to prevent spam
 *
 * The cron at POST /admin/cart-recovery/run scans every active rule, finds
 * eligible carts that haven't been notified within cooldown, and pushes via
 * the existing FCM infrastructure.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ShoppingCart, Plus, Edit2, Trash2, Eye, Send, Sparkles,
  Bell, BellOff, Save, X, Play, Clock, Heart, AlertTriangle,
} from "lucide-react";
import { adminGet, adminPost, adminPatch } from "@/lib/admin-api";

// ── Types ────────────────────────────────────────────────────────────────────
interface Rule {
  id:             string;
  name:           string;
  triggerMinutes: number;
  minCartValue:   number | null;
  maxCartValue:   number | null;
  loggedInOnly:   boolean;
  title:          string;
  body:           string;
  ctaText:        string;
  ctaUrl:         string;
  cooldownHours:  number;
  isActive:       boolean;
  sortOrder:      number;
  sentCount:      number;
  createdAt:      string;
  updatedAt:      string;
}

interface Stats {
  totalRules:   number;
  activeRules:  number;
  totalSent:    number;
  sentLast24h:  number;
  sentLast7d:   number;
}

interface Candidate {
  customerId: string;
  cartValue:  number;
  itemCount:  number;
  firstItem:  string;
  vars:       Record<string, string | number>;
}

// Pretty-print "60 → 1 hour", "1440 → 1 day"
function formatMinutes(m: number): string {
  if (m < 60)         return `${m} min`;
  if (m < 1440)       return `${Math.round(m/60 * 10) / 10} hour${m === 60 ? "" : "s"}`;
  return `${Math.round(m/1440 * 10) / 10} day${m === 1440 ? "" : "s"}`;
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CartRecoveryPage() {
  const [rules, setRules]       = useState<Rule[]>([]);
  const [stats, setStats]       = useState<Stats | null>(null);
  const [editing, setEditing]   = useState<Rule | "new" | null>(null);
  const [previewing, setPreview] = useState<Rule | null>(null);
  const [candidates, setCands]  = useState<Candidate[] | null>(null);
  const [running, setRunning]   = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  const fetchAll = async () => {
    const [r, s] = await Promise.all([
      adminGet<Rule[]>("/admin/cart-recovery/rules", []),
      adminGet<Stats>("/admin/cart-recovery/stats", {
        totalRules: 0, activeRules: 0, totalSent: 0, sentLast24h: 0, sentLast7d: 0,
      }),
    ]);
    setRules(Array.isArray(r) ? r : []);
    setStats(s);
  };

  useEffect(() => { fetchAll(); }, []);

  const runNow = async () => {
    if (!confirm("Run cart recovery now? This will send pushes to all eligible users (subject to cooldowns).")) return;
    setRunning(true);
    setRunResult(null);
    try {
      const res = await adminPost<{ totalSent: number; totalFailed: number; rulesProcessed: number }>(
        "/admin/cart-recovery/run", {}, { totalSent: 0, totalFailed: 0, rulesProcessed: 0 },
      );
      setRunResult(`✓ Processed ${res.rulesProcessed} rules — ${res.totalSent} push(es) sent, ${res.totalFailed} failed.`);
      fetchAll();
    } catch (e) {
      setRunResult(`✗ Error: ${(e as Error).message ?? "unknown"}`);
    } finally {
      setRunning(false);
    }
  };

  const previewCandidates = async (rule: Rule) => {
    setPreview(rule);
    setCands(null);
    const res = await adminGet<{ candidates: Candidate[] }>(
      `/admin/cart-recovery/candidates?ruleId=${rule.id}`,
      { candidates: [] },
    );
    setCands(res.candidates ?? []);
  };

  const toggleActive = async (rule: Rule) => {
    await adminPatch(`/admin/cart-recovery/rules/${rule.id}`, { isActive: !rule.isActive }, {});
    fetchAll();
  };

  const deleteRule = async (rule: Rule) => {
    if (!confirm(`Delete "${rule.name}"? This can't be undone.`)) return;
    await fetch(`${typeof window !== "undefined" ? window.location.origin : ""}/api/admin/cart-recovery/rules/${rule.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("gifteeng.b2b.token") ?? "" : ""}`,
      },
    });
    fetchAll();
  };

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-[#EF3752]" />
            Cart Recovery
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Win back customers who left items in their cart with emotion-driven nudges.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runNow}
            disabled={running}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-[#EF3752] text-white disabled:opacity-50"
          >
            {running ? (
              <><Sparkles className="w-3.5 h-3.5 animate-spin" /> Running…</>
            ) : (
              <><Play className="w-3.5 h-3.5" /> Run Now</>
            )}
          </button>
          <button
            onClick={() => setEditing("new")}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-card border border-border hover:bg-muted"
          >
            <Plus className="w-3.5 h-3.5" /> New Rule
          </button>
        </div>
      </div>

      {runResult && (
        <div className={`rounded-lg p-3 text-xs ${
          runResult.startsWith("✓")
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
            : "bg-red-500/10 text-red-600 border border-red-500/30"
        }`}>
          {runResult}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatBox label="Total rules"        value={stats.totalRules} icon={Bell} color="text-blue-600" />
          <StatBox label="Active rules"       value={stats.activeRules} icon={Sparkles} color="text-emerald-600" />
          <StatBox label="Pushes sent (24h)"  value={stats.sentLast24h} icon={Send} color="text-purple-600" />
          <StatBox label="Pushes sent (7d)"   value={stats.sentLast7d} icon={Send} color="text-rose-600" />
          <StatBox label="Total ever"         value={stats.totalSent} icon={Heart} color="text-amber-600" />
        </div>
      )}

      {/* Cron hint */}
      <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs text-muted-foreground flex items-start gap-2">
        <Clock className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <strong className="text-foreground">Schedule it:</strong> hook <code className="bg-card px-1 rounded">POST /api/admin/cart-recovery/run</code> to a server cron every <strong>15-30 minutes</strong> for hands-off recovery. Cooldowns prevent spam — each rule won't re-send to the same user until its cooldown elapses.
        </div>
      </div>

      {/* Rules list */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-sm">Rules</h2>
          <span className="text-[11px] text-muted-foreground">Reordered by Trigger time</span>
        </div>
        {rules.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            No rules yet. Click <strong>+ New Rule</strong> to get started.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onEdit={() => setEditing(rule)}
                onPreview={() => previewCandidates(rule)}
                onToggle={() => toggleActive(rule)}
                onDelete={() => deleteRule(rule)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit drawer */}
      {editing && (
        <RuleEditor
          rule={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchAll(); }}
        />
      )}

      {/* Preview modal */}
      {previewing && (
        <CandidatesModal
          rule={previewing}
          candidates={candidates}
          onClose={() => { setPreview(null); setCands(null); }}
        />
      )}
    </div>
  );
}

// ── Components ───────────────────────────────────────────────────────────────

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

function RuleRow({ rule, onEdit, onPreview, onToggle, onDelete }: {
  rule: Rule;
  onEdit: () => void; onPreview: () => void; onToggle: () => void; onDelete: () => void;
}) {
  return (
    <div className={`px-4 py-3 hover:bg-muted/30 ${!rule.isActive ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
            rule.isActive
              ? "bg-emerald-500/15 text-emerald-600"
              : "bg-muted text-muted-foreground"
          }`}
          title={rule.isActive ? "Active — click to disable" : "Disabled — click to enable"}
        >
          {rule.isActive ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm">{rule.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 font-bold">
              FIRES AFTER {formatMinutes(rule.triggerMinutes).toUpperCase()}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 font-bold">
              COOLDOWN {rule.cooldownHours}h
            </span>
            {rule.minCartValue && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-600 font-bold">
                MIN ₹{Math.round(rule.minCartValue / 100)}
              </span>
            )}
          </div>
          <p className="text-sm mt-1 font-medium">{rule.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{rule.body}</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Sent: <strong>{rule.sentCount.toLocaleString()}</strong>
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <button onClick={onPreview} title="Preview eligible carts"
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button onClick={onEdit} title="Edit rule"
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} title="Delete rule"
            className="p-1.5 rounded hover:bg-red-500/15 text-red-600">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleEditor({ rule, onClose, onSaved }: {
  rule: Rule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name:           rule?.name ?? "",
    triggerMinutes: rule?.triggerMinutes ?? 60,
    minCartValueRupees: rule?.minCartValue ? Math.round(rule.minCartValue / 100) : "",
    maxCartValueRupees: rule?.maxCartValue ? Math.round(rule.maxCartValue / 100) : "",
    loggedInOnly:   rule?.loggedInOnly ?? true,
    title:          rule?.title ?? "Hey {firstName}, your gifts are waiting 💝",
    body:           rule?.body ?? "{itemCount} thoughtful pick(s) are still in your cart. Make someone smile today!",
    ctaText:        rule?.ctaText ?? "Continue shopping",
    ctaUrl:         rule?.ctaUrl ?? "/cart",
    cooldownHours:  rule?.cooldownHours ?? 48,
    isActive:       rule?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const payload = {
      name:           form.name.trim() || "Untitled rule",
      triggerMinutes: Math.max(5, Math.min(43200, Number(form.triggerMinutes) || 60)),
      minCartValue:   form.minCartValueRupees ? Math.round(Number(form.minCartValueRupees) * 100) : null,
      maxCartValue:   form.maxCartValueRupees ? Math.round(Number(form.maxCartValueRupees) * 100) : null,
      loggedInOnly:   form.loggedInOnly,
      title:          form.title.trim(),
      body:           form.body.trim(),
      ctaText:        form.ctaText.trim() || "View cart",
      ctaUrl:         form.ctaUrl.trim() || "/cart",
      cooldownHours:  Math.max(0, Math.min(720, Number(form.cooldownHours) || 48)),
      isActive:       form.isActive,
    };
    if (rule) {
      await adminPatch(`/admin/cart-recovery/rules/${rule.id}`, payload, {});
    } else {
      await adminPost("/admin/cart-recovery/rules", payload, {});
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-bold">{rule ? "Edit rule" : "Create new rule"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">

          <Field label="Rule name *">
            <input
              value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}
              placeholder="e.g. Gentle nudge — 1 hour"
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fires after (minutes) *" hint={`= ${formatMinutes(Number(form.triggerMinutes) || 60)}`}>
              <input
                type="number" min={5} max={43200}
                value={form.triggerMinutes} onChange={(e) => setForm({...form, triggerMinutes: Number(e.target.value)})}
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
            </Field>
            <Field label="Cooldown (hours)" hint="Don't re-send to same user within">
              <input
                type="number" min={0} max={720}
                value={form.cooldownHours} onChange={(e) => setForm({...form, cooldownHours: Number(e.target.value)})}
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Min cart value ₹" hint="Optional — only fire if cart ≥ this">
              <input
                type="number" min={0}
                value={form.minCartValueRupees}
                onChange={(e) => setForm({...form, minCartValueRupees: e.target.value as any})}
                placeholder="e.g. 500"
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
            </Field>
            <Field label="Max cart value ₹" hint="Optional — only fire if cart ≤ this">
              <input
                type="number" min={0}
                value={form.maxCartValueRupees}
                onChange={(e) => setForm({...form, maxCartValueRupees: e.target.value as any})}
                placeholder="e.g. 5000"
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
            </Field>
          </div>

          <Field label="Notification title *" hint="Supports template variables — see below">
            <input
              value={form.title} onChange={(e) => setForm({...form, title: e.target.value})}
              maxLength={200}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
          </Field>

          <Field label="Notification body *">
            <textarea
              value={form.body} onChange={(e) => setForm({...form, body: e.target.value})}
              rows={3} maxLength={500}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm resize-none" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="CTA button label">
              <input
                value={form.ctaText} onChange={(e) => setForm({...form, ctaText: e.target.value})}
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
            </Field>
            <Field label="CTA deep link">
              <input
                value={form.ctaUrl} onChange={(e) => setForm({...form, ctaUrl: e.target.value})}
                placeholder="/cart"
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive}
              onChange={(e) => setForm({...form, isActive: e.target.checked})} />
            <span>Active (off = saved but skipped by cron)</span>
          </label>

          {/* Variable hints */}
          <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs">
            <p className="font-bold mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              Available template variables (use in title or body):
            </p>
            <ul className="space-y-0.5 text-muted-foreground">
              <li><code className="bg-card px-1 rounded">{"{firstName}"}</code> — customer's first name (or "there")</li>
              <li><code className="bg-card px-1 rounded">{"{firstItem}"}</code> — title of first item in cart</li>
              <li><code className="bg-card px-1 rounded">{"{itemCount}"}</code> — total quantity</li>
              <li><code className="bg-card px-1 rounded">{"{cartValue}"}</code> — cart total formatted as ₹X</li>
            </ul>
          </div>

          {/* Live preview */}
          <div className="rounded-lg border border-border p-3 bg-muted/20">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Preview (with sample data)
            </p>
            <div className="rounded-lg bg-card border border-border p-3 shadow-sm">
              <p className="font-bold text-sm">
                {previewVar(form.title)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {previewVar(form.body)}
              </p>
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-border">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-border text-sm font-bold hover:bg-muted">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="flex-[1.5] py-2.5 rounded-lg bg-[#EF3752] text-white text-sm font-black disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? "Saving…" : <><Save className="w-4 h-4" /> {rule ? "Save changes" : "Create rule"}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CandidatesModal({ rule, candidates, onClose }: {
  rule: Rule; candidates: Candidate[] | null; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card">
          <div>
            <h2 className="font-bold">Eligible carts</h2>
            <p className="text-[11px] text-muted-foreground">For "{rule.name}"</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        {candidates === null ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : candidates.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No carts currently match this rule's conditions.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {candidates.map((c) => (
              <div key={c.customerId} className="px-4 py-3">
                <p className="font-bold text-xs text-muted-foreground">Customer {c.customerId.slice(0, 8)}…</p>
                <p className="text-sm mt-0.5">
                  {c.itemCount} item(s) · ₹{Math.round(c.cartValue / 100)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">First item: {c.firstItem}</p>
              </div>
            ))}
          </div>
        )}
      </div>
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

// Render template vars with sample values for live preview
function previewVar(tpl: string): string {
  return tpl
    .replace(/\{firstName\}/g, "Rohan")
    .replace(/\{firstItem\}/g, "Photo Magnet")
    .replace(/\{itemCount\}/g, "3")
    .replace(/\{cartValue\}/g, "₹1,247");
}
