"use client";

// LivePresenceStrip — sits at the top of the admin activity feed and
// shows everyone currently active on the site (web + Flutter), with a
// beep on every new arrival.
//
// Connects to the existing /api/public/events SSE channel and listens
// for `invalidate` events with `scope: "presence"` (published by
// PageViewsService.announcePresence). Each unique session is tracked
// for ~3 minutes; sessions that don't get a refresh in that window
// drop off the "online now" list.
//
// Beep is generated via the Web Audio API so we don't have to ship a
// sound file. Three-tone chord (C-E-G), ~150ms, soft volume.

import { useEffect, useRef, useState } from "react";
import { Eye, Volume2, VolumeX, UserCircle, Smartphone, Globe } from "lucide-react";

interface PresenceEntry {
  sessionId:  string;
  customerId: string | null;
  label:      string;
  path:       string;
  deviceType: string;
  browser:    string;
  os:         string;
  firstSeen:  string;
  lastSeen:   string;
}

const STALE_MS = 3 * 60 * 1000;       // 3 min idle = "left the site"
const TICK_MS  = 30 * 1000;           // sweep every 30s

function playBeep() {
  try {
    const Ctx = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx: AudioContext = new Ctx();
    const now = ctx.currentTime;
    const freqs = [523.25, 659.25];   // C5, E5 — soft pleasant chord
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    gain.connect(ctx.destination);
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.3);
    }
    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch { /* audio blocked / unavailable */ }
}

export default function LivePresenceStrip() {
  const [entries, setEntries] = useState<Map<string, PresenceEntry>>(new Map());
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("gifteeng.activity-beep") === "muted";
  });
  const audioReadyRef = useRef(false);

  // Persist mute pref so an admin doesn't have to re-mute on every page load.
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("gifteeng.activity-beep", muted ? "muted" : "on");
  }, [muted]);

  // Browsers block AudioContext until the page receives a user gesture.
  // Latch the first click so subsequent presence events can beep.
  useEffect(() => {
    const unlock = () => { audioReadyRef.current = true; };
    window.addEventListener("click", unlock, { once: true });
    return () => window.removeEventListener("click", unlock);
  }, []);

  // SSE connection
  useEffect(() => {
    if (typeof window === "undefined") return;
    let es: EventSource | null = null;
    let stopped = false;
    let backoff = 1500;

    const connect = () => {
      if (stopped) return;
      es = new EventSource("/api/public/events");

      es.addEventListener("ready",      () => { backoff = 1500; });
      es.addEventListener("invalidate", (e) => {
        try {
          const d = JSON.parse((e as MessageEvent).data ?? "{}");
          if (d.scope !== "presence") return;
          const entry: PresenceEntry = {
            sessionId:  d.sessionId,
            customerId: d.customerId ?? null,
            label:      d.label ?? "Anonymous visitor",
            path:       d.path ?? "/",
            deviceType: d.deviceType ?? "desktop",
            browser:    d.browser ?? "",
            os:         d.os ?? "",
            firstSeen:  d.firstSeen ?? new Date().toISOString(),
            lastSeen:   new Date().toISOString(),
          };
          setEntries(prev => {
            const next = new Map(prev);
            const isNew = !next.has(entry.sessionId);
            next.set(entry.sessionId, entry);
            // Beep + flash only on genuinely-new arrivals (existing
            // sessions that just hit a new page don't re-beep — the
            // backend de-dupes per session, but extra safety here).
            if (isNew && !muted && audioReadyRef.current) playBeep();
            return next;
          });
        } catch { /* ignore */ }
      });

      es.onerror = () => {
        es?.close();
        if (stopped) return;
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30_000);
      };
    };
    connect();

    // Periodic sweep — drop sessions we haven't heard from in STALE_MS.
    const tick = setInterval(() => {
      setEntries(prev => {
        const cutoff = Date.now() - STALE_MS;
        const next = new Map<string, PresenceEntry>();
        for (const [k, v] of prev) {
          if (new Date(v.lastSeen).getTime() >= cutoff) next.set(k, v);
        }
        return next.size === prev.size ? prev : next;
      });
    }, TICK_MS);

    return () => { stopped = true; es?.close(); clearInterval(tick); };
  }, [muted]);

  const list = Array.from(entries.values()).sort(
    (a, b) => +new Date(b.lastSeen) - +new Date(a.lastSeen),
  );

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <h2 className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
            {list.length} on site now
          </h2>
        </div>
        <button
          onClick={() => setMuted(m => !m)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] hover:bg-muted"
          title={muted ? "Click to enable beep on new visitor" : "Click to mute beep"}
        >
          {muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          {muted ? "Beep off" : "Beep on"}
        </button>
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground">No active visitors right now.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {list.slice(0, 50).map(e => {
            const Icon = e.deviceType === "mobile" ? Smartphone : Globe;
            return (
              <div
                key={e.sessionId}
                title={`${e.label} · ${e.path} · ${e.browser} ${e.os}`}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] border ${
                  e.customerId
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {e.customerId
                  ? <UserCircle className="w-3 h-3" />
                  : <Eye        className="w-3 h-3" />}
                <span className="font-semibold max-w-[140px] truncate">{e.label}</span>
                <span className="opacity-60">·</span>
                <Icon className="w-3 h-3" />
                <span className="opacity-70 max-w-[160px] truncate">{e.path}</span>
              </div>
            );
          })}
          {list.length > 50 && (
            <span className="text-[11px] text-muted-foreground self-center">
              +{list.length - 50} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
