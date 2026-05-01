"use client";

// ─── Live Winners Feed (web parity with mobile play_screen winners card) ──────
//
// Hits GET /api/games/winners?pageSize=10 every 45s to show a rolling social-
// proof list of recent winners. Mirrors the Flutter widget rendered at
// apps/mobile/lib/features/games/presentation/screens/play_screen.dart (lines
// 1237–1408) so the same avatars, privacy-truncated names, and prize labels
// show up on both surfaces.
//
// Layout:
//   ┌──────────────────────────────────────────────────┐
//   │ 🏆  Recent Winners                      LIVE ●  │
//   ├──────────────────────────────────────────────────┤
//   │ [PS] Priya S. won ₹500 gift card     · 2m ago  │
//   │ [AK] Amit K. won a Mystery Box       · 7m ago  │
//   │ …                                                │
//   └──────────────────────────────────────────────────┘
//
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";

type WinnerRaw = {
  id?: string;
  name?: string;
  userName?: string;
  user?: { name?: string };
  prize?: string;
  prizeName?: string;
  reward?: string;
  rewardLabel?: string;
  gameType?: string;
  ago?: number;                // minutes, pre-computed by API
  at?: string | number;        // optional ISO timestamp
  createdAt?: string;
  timestamp?: string;
};

type Winner = {
  id: string;
  name: string;
  prize: string;
  gameType?: string;
  ago: number;                 // minutes since event
};

type WinnersResponse = { items?: WinnerRaw[] } | WinnerRaw[];

const API_BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_API_BASE_URL ?? "");

// Deterministic colour per initial — so "Priya" always looks the same across
// refreshes and sits next to "Amit" with visual distinction.
const AVATAR_PALETTE = [
  "#A855F7", // purple
  "#EC4899", // pink
  "#10B981", // emerald
  "#F59E0B", // gold
  "#3B82F6", // blue
  "#EF3752", // brand coral
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function paletteFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function normalise(raw: WinnerRaw, index: number): Winner {
  const name =
    raw.name ??
    raw.userName ??
    raw.user?.name ??
    "Someone";
  const prize =
    raw.prize ??
    raw.prizeName ??
    raw.reward ??
    raw.rewardLabel ??
    "a prize";
  let ago = typeof raw.ago === "number" ? raw.ago : NaN;
  if (!Number.isFinite(ago)) {
    const ts = raw.createdAt ?? raw.timestamp ?? raw.at;
    if (ts) {
      const t = typeof ts === "number" ? ts : Date.parse(String(ts));
      if (Number.isFinite(t)) {
        ago = Math.max(0, Math.round((Date.now() - t) / 60_000));
      }
    }
  }
  if (!Number.isFinite(ago)) ago = 0;
  return {
    id: raw.id ?? `${name}-${prize}-${index}`,
    name,
    prize,
    gameType: raw.gameType,
    ago,
  };
}

function formatAgo(mins: number): string {
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function WinnersFeed() {
  const [winners, setWinners] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/games/winners?pageSize=10`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = (await res.json()) as WinnersResponse;
        const items = Array.isArray(raw) ? raw : (raw.items ?? []);
        if (!cancelled) {
          setWinners(items.map((w, i) => normalise(w, i)));
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const id = setInterval(load, 45_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const body = useMemo(() => {
    if (loading) {
      return (
        <div className="space-y-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 border border-white/5 animate-pulse"
              style={{ background: "rgba(255,255,255,0.02)" }}
            >
              <div className="w-9 h-9 rounded-full bg-white/10" />
              <div className="flex-1 h-3 rounded-full bg-white/10" />
              <div className="w-10 h-3 rounded-full bg-white/10" />
            </div>
          ))}
        </div>
      );
    }
    if (winners.length === 0) {
      return (
        <p className="text-white/40 text-xs py-3 text-center">
          Play a game to appear on the winners feed!
        </p>
      );
    }
    return (
      <div className="space-y-1.5">
        {winners.slice(0, 8).map((w, i) => {
          const color = paletteFor(w.name);
          return (
            <div
              key={w.id}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 border border-white/5"
              style={{
                background: "rgba(255,255,255,0.02)",
                animation: `winners-slide-in 0.35s cubic-bezier(0.22,1,0.36,1) both ${i * 0.05}s`,
              }}
            >
              <div
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-black text-white"
                style={{ background: color }}
              >
                {initialsOf(w.name)}
              </div>
              <p className="flex-1 text-xs font-semibold text-white/70 truncate">
                <span className="text-white font-black">{w.name}</span>
                <span className="text-white/40"> won </span>
                <span className="text-amber-300 font-black">{w.prize}</span>
              </p>
              <span className="text-white/30 text-[10px] tabular-nums shrink-0">
                {formatAgo(w.ago)}
              </span>
            </div>
          );
        })}
      </div>
    );
  }, [winners, loading]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white/50 text-[10px] font-black uppercase tracking-[0.28em] flex items-center gap-1.5">
          <Trophy className="w-3 h-3" />
          Recent Winners
        </h2>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-rose-400">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inset-0 rounded-full bg-rose-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500" />
          </span>
          LIVE
        </span>
      </div>
      {body}

      <style>{`
        @keyframes winners-slide-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default WinnersFeed;
