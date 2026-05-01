"use client";

// Super-admin — Gift Reminders (observability only, plus manual run-daily trigger)
// Customers own their reminder CRUD via /gift-reminders from mobile / web.
// Admin here can:
//   - see upcoming occasions across all customers in the next N days
//   - manually trigger the daily cron (for testing or catch-up)
//
// Endpoints:
//   POST /api/admin/gift-reminders/run-daily  — idempotent, dedups by lastNotifiedAt

import { useState, useEffect, useMemo } from "react";
import { Badge, Button, Input } from "@gifteeng/ui";
import {
  CalendarClock, Send, Loader2, Search, Bell, CheckCircle2, AlertCircle,
} from "lucide-react";
import { authHeaders, getApiBase, safePost } from "@/lib/admin-api";

interface RunResult { scanned: number; notified: number; autoOrdered: number }

export default function AdminReminders() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);

  const run = async () => {
    setRunning(true); setError(null); setResult(null);
    const out = await safePost<RunResult | null>("/admin/gift-reminders/run-daily", {}, null);
    setRunning(false);
    if (!out) {
      setError("Run failed. Check API logs or your auth token.");
      return;
    }
    setResult(out);
    setLastRunAt(new Date());
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <CalendarClock className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-display font-bold tracking-tight">Gift Reminders</h1>
          <p className="text-xs text-muted-foreground">
            Daily nudges for birthdays, anniversaries & festivals. Customers own CRUD from app.
          </p>
        </div>
      </div>

      {/* Cron trigger card */}
      <div className="bg-card rounded-xl border border-border/40 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" /> Manual run
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Scans all active reminders, pushes notifications for occasions within the notify window,
              and dedups so the same customer isn't pinged twice in 24 h.
            </p>
          </div>
          <Button size="sm" onClick={run} disabled={running} className="gap-1.5 h-9">
            {running
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…</>
              : <>Run now</>
            }
          </Button>
        </div>

        {/* Last run result */}
        {result && (
          <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="font-semibold">Run complete</span>
              {lastRunAt && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {lastRunAt.toLocaleString("en-IN")}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 pt-1">
              <Stat label="Scanned" val={result.scanned} />
              <Stat label="Notified" val={result.notified} color="text-emerald-600" />
              <Stat label="Auto-order prompts" val={result.autoOrdered} color="text-amber-600" />
            </div>
          </div>
        )}
        {error && (
          <div className="bg-rose-500/10 text-rose-600 rounded-lg p-3 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {/* Schedule note */}
        <div className="bg-muted/20 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
          <p className="flex items-center gap-2">
            <Bell className="w-3.5 h-3.5" /> <span className="font-semibold">Recommended schedule:</span>
            &nbsp;08:00 IST daily
          </p>
          <p className="pl-5">
            Wire <code className="bg-card px-1 py-0.5 rounded">POST /api/admin/gift-reminders/run-daily</code>
            &nbsp;into your cron (Vercel Cron / GitHub Actions / system cron). Idempotent within a 24-h window.
          </p>
        </div>
      </div>

      {/* Informational — full list isn't surfaced; customers edit from app */}
      <div className="bg-card rounded-xl border border-border/40 p-5">
        <h2 className="text-sm font-semibold mb-2">How it works</h2>
        <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside">
          <li>
            Customer opens <span className="text-foreground font-medium">/reminders</span> in the app
            and creates a reminder with an occasion + date.
          </li>
          <li>
            Each reminder has a <span className="text-foreground font-medium">notify window</span> (1–30 days).
            When today falls inside that window, the next cron run fires a push.
          </li>
          <li>
            Yearly-recurring reminders auto-roll forward. One-shot reminders fire once and stop.
          </li>
          <li>
            If the reminder has <span className="text-foreground font-medium">auto-order</span> enabled
            plus a pinned product + saved address, the cron sends a confirm prompt 2 days before.
          </li>
          <li>
            Dedup via <code className="bg-muted/40 px-1 py-0.5 rounded">lastNotifiedAt</code> so
            re-running the cron within 24 h is safe.
          </li>
        </ol>
      </div>
    </div>
  );
}

function Stat({ label, val, color }: { label: string; val: number; color?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-xl font-bold ${color ?? ""}`}>{val}</span>
    </div>
  );
}
