"use client";

// Gift Reminders — web CRUD for the customer's own birthday / anniversary /
// festival reminders. Matches the mobile experience; backend is shared.
//
// Endpoints:
//   GET    /api/gift-reminders         (auth)
//   POST   /api/gift-reminders         (auth)
//   PATCH  /api/gift-reminders/:id     (auth)
//   DELETE /api/gift-reminders/:id     (auth)
//
// Mental model: users set occasions they care about once, app nudges them
// N days before with a push + deep-link into the shop pre-filtered by
// category. Recurring (yearly) or one-shot.

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  CalendarClock, Plus, X, Loader2, Pencil, Trash2, Bell, Cake, Heart, Flower2, Flame, Home as HomeIcon, Gem,
  Gift, Lock, Church, Ribbon, Star, Sun,
} from "lucide-react";

function apiBase() {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
}
function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("gifteeng.b2c.token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

interface Reminder {
  id: string;
  occasion: string;
  recipientName: string | null;
  eventDate: string;
  recurring: boolean;
  notifyDaysBefore: number;
  active: boolean;
  note?: string | null;
}

const OCCASIONS: { slug: string; label: string; icon: React.ElementType }[] = [
  { slug: "birthday",     label: "Birthday",        icon: Cake },
  { slug: "anniversary",  label: "Anniversary",     icon: Gem },
  { slug: "wedding",      label: "Wedding",         icon: Church },
  { slug: "mothers-day",  label: "Mother's Day",    icon: Flower2 },
  { slug: "fathers-day",  label: "Father's Day",    icon: Star },
  { slug: "diwali",       label: "Diwali",          icon: Flame },
  { slug: "christmas",    label: "Christmas",       icon: Sun },
  { slug: "valentine",    label: "Valentine's Day", icon: Heart },
  { slug: "rakhi",        label: "Raksha Bandhan",  icon: Ribbon },
  { slug: "housewarming", label: "Housewarming",    icon: HomeIcon },
  { slug: "custom",       label: "Other",           icon: Gift },
];

function iconFor(slug: string): React.ElementType {
  return OCCASIONS.find((o) => o.slug === slug)?.icon ?? Gift;
}
function labelFor(slug: string): string {
  return OCCASIONS.find((o) => o.slug === slug)?.label
    ?? slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
}

function daysUntilNext(iso: string, recurring: boolean): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ev = new Date(iso);
  if (!recurring) {
    const occ = new Date(ev.getFullYear(), ev.getMonth(), ev.getDate());
    return Math.round((+occ - +today) / 86_400_000);
  }
  let occ = new Date(today.getFullYear(), ev.getMonth(), ev.getDate());
  if (+occ < +today) occ = new Date(today.getFullYear() + 1, ev.getMonth(), ev.getDate());
  return Math.round((+occ - +today) / 86_400_000);
}

function toInputDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function RemindersPage() {
  const [items, setItems]   = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauth, setUnauth]  = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/api/gift-reminders`, {
        headers: authHeaders(), cache: "no-store",
      });
      if (r.status === 401) { setUnauth(true); setItems([]); setLoading(false); return; }
      if (!r.ok) { setItems([]); setLoading(false); return; }
      const data = await r.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      // active first, then nearest occurrence
      if (a.active !== b.active) return a.active ? -1 : 1;
      return daysUntilNext(a.eventDate, a.recurring) - daysUntilNext(b.eventDate, b.recurring);
    });
  }, [items]);

  const remove = async (id: string) => {
    if (!confirm("Delete this reminder? We'll stop notifying you.")) return;
    try {
      await fetch(`${apiBase()}/api/gift-reminders/${id}`, {
        method: "DELETE", headers: authHeaders(),
      });
      await load();
    } catch {}
  };

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-8 pt-24 md:pt-28 pb-16">
      {/* Header */}
      <div className="flex items-center gap-4 mb-10">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
          <CalendarClock className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-black tracking-tight">Gift Reminders</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            We'll nudge you before birthdays, anniversaries &amp; festivals so your gift always arrives on time.
          </p>
        </div>
        {!unauth && (
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-[#EF3752] text-white text-sm font-bold hover:opacity-90 shrink-0"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        )}
      </div>

      {unauth ? (
        <AuthGate />
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState onAdd={() => setShowForm(true)} />
      ) : (
        <div className="space-y-3">
          {sorted.map((r) => (
            <ReminderRow
              key={r.id}
              r={r}
              onEdit={() => { setEditing(r); setShowForm(true); }}
              onDelete={() => remove(r.id)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <FormSheet
          existing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={async () => { setShowForm(false); setEditing(null); await load(); }}
        />
      )}
    </main>
  );
}

function AuthGate() {
  return (
    <div className="bg-card rounded-2xl p-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
        <Lock className="w-6 h-6 text-muted-foreground" />
      </div>
      <p className="font-bold mb-1">Sign in to manage reminders</p>
      <p className="text-xs text-muted-foreground mb-4">
        Gift reminders are saved to your account so they follow you across devices.
      </p>
      <Link
        href="/b2c/auth"
        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#EF3752] text-white text-sm font-bold hover:opacity-90"
      >
        Sign in
      </Link>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="bg-card rounded-2xl p-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
        <Bell className="w-6 h-6 text-primary" />
      </div>
      <p className="font-bold mb-1">No reminders yet</p>
      <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">
        Add your first occasion. We'll start pinging you N days before so your gift arrives on time.
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#EF3752] text-white text-sm font-bold hover:opacity-90"
      >
        <Plus className="w-4 h-4" /> Add your first reminder
      </button>
    </div>
  );
}

function ReminderRow({
  r, onEdit, onDelete,
}: { r: Reminder; onEdit: () => void; onDelete: () => void }) {
  const days = daysUntilNext(r.eventDate, r.recurring);
  const eventDateFmt = new Date(r.eventDate).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", ...(r.recurring ? {} : { year: "numeric" }),
  });
  let chipLabel: string;
  let chipColor: string;
  if (days <= 0) {
    chipLabel = "Today"; chipColor = "bg-[#EF3752]/15 text-[#EF3752] border-[#EF3752]/20";
  } else if (days === 1) {
    chipLabel = "Tomorrow"; chipColor = "bg-[#EF3752]/10 text-[#EF3752]/80 border-[#EF3752]/15";
  } else if (days <= 7) {
    chipLabel = `${days} days`; chipColor = "bg-[#EF3752]/10 text-[#EF3752]/80 border-[#EF3752]/15";
  } else {
    chipLabel = `${days} days`; chipColor = "bg-muted text-muted-foreground border-border";
  }
  const OccasionIcon = iconFor(r.occasion);

  return (
    <div className={`bg-card rounded-2xl p-5 flex items-center gap-4 ${!r.active ? "opacity-50" : ""}`}>
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <OccasionIcon className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">
          {r.recipientName ? `${r.recipientName} — ${labelFor(r.occasion)}` : labelFor(r.occasion)}
        </div>
        <div className="text-xs text-muted-foreground">
          {eventDateFmt}{r.recurring ? " · yearly" : ""} · notify {r.notifyDaysBefore}d before
        </div>
      </div>
      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${chipColor}`}>
        {chipLabel}
      </span>
      <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-muted" title="Edit">
        <Pencil className="w-4 h-4 text-muted-foreground" />
      </button>
      <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-rose-500/10" title="Delete">
        <Trash2 className="w-4 h-4 text-rose-500" />
      </button>
    </div>
  );
}

function FormSheet({
  existing, onClose, onSaved,
}: { existing: Reminder | null; onClose: () => void; onSaved: () => void }) {
  const [occasion, setOccasion]   = useState(existing?.occasion ?? "birthday");
  const [recipientName, setRecipientName] = useState(existing?.recipientName ?? "");
  const [eventDate, setEventDate] = useState(
    existing ? toInputDate(existing.eventDate)
             : toInputDate(new Date(Date.now() + 30 * 86_400_000).toISOString()),
  );
  const [recurring, setRecurring] = useState(existing?.recurring ?? true);
  const [notifyDaysBefore, setNotify] = useState(existing?.notifyDaysBefore ?? 7);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true); setError(null);
    const body = {
      occasion,
      recipientName: recipientName.trim() || null,
      eventDate: new Date(eventDate).toISOString(),
      recurring,
      notifyDaysBefore,
    };
    try {
      const r = await fetch(
        `${apiBase()}/api/gift-reminders${existing ? `/${existing.id}` : ""}`,
        {
          method: existing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(body),
        },
      );
      if (!r.ok) { setError("Couldn't save. Try again."); setSaving(false); return; }
      onSaved();
    } catch {
      setError("Couldn't save. Try again.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-6">
      <div className="bg-card rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-bold">{existing ? "Edit reminder" : "New reminder"}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Occasion chips */}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Occasion
            </label>
            <div className="flex flex-wrap gap-2 mt-2">
              {OCCASIONS.map((o) => {
                const selected = o.slug === occasion;
                const OIcon = o.icon;
                return (
                  <button
                    key={o.slug}
                    onClick={() => setOccasion(o.slug)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition ${selected ? "bg-[#EF3752] text-white border-transparent" : "bg-muted border-border hover:bg-muted"}`}
                  >
                    <OIcon className="w-3 h-3" /> {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recipient */}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Recipient (optional)
            </label>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Mom, Priya, ..."
              className="mt-1.5 w-full h-9 px-3 rounded-xl bg-muted border border-border text-sm focus:border-[#EF3752] focus:outline-none"
            />
          </div>

          {/* Date */}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Event date
            </label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="mt-1.5 w-full h-9 px-3 rounded-xl bg-muted border border-border text-sm focus:border-[#EF3752] focus:outline-none"
            />
          </div>

          {/* Toggles */}
          <label className="flex items-center justify-between text-sm">
            <span className="font-bold">Repeats yearly</span>
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="w-5 h-5 accent-primary"
            />
          </label>

          {/* Notify slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-bold">Notify before event</span>
              <span className="text-xs font-black text-primary">{notifyDaysBefore} day{notifyDaysBefore === 1 ? "" : "s"}</span>
            </div>
            <input
              type="range"
              min={1}
              max={30}
              value={notifyDaysBefore}
              onChange={(e) => setNotify(parseInt(e.target.value, 10))}
              className="w-full accent-primary"
            />
          </div>

          {error && (
            <div className="text-xs text-rose-500 font-semibold">{error}</div>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-border sticky bottom-0 bg-card">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-xl bg-muted border border-border text-foreground text-sm font-bold hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 h-10 rounded-xl bg-[#EF3752] text-white text-sm font-bold hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {existing ? "Save changes" : "Add reminder"}
          </button>
        </div>
      </div>
    </div>
  );
}
