"use client";

/**
 * StreakLadder — Climb the 8-rung login-streak ladder. Deploy 118.
 *
 * GET  /api/games/streak-ladder → { streakDays, rungs[] }
 * POST /api/games/streak-ladder/claim { day } → +coins
 *
 * Rungs are visualised as a vertical ladder; the current streak marker sits
 * at the user's current position, each unlocked-but-unclaimed rung has a
 * Claim button. Locked rungs show "Day N".
 */

import { useEffect, useState } from "react";
import { X, Lock, Check, Flame, Loader2 } from "lucide-react";
import { cartFetch } from "@/lib/api";
import { flyCoinsToNavbar } from "@/lib/coins-fx";

type Rung = { day: number; goins: number; label: string; unlocked: boolean; claimed: boolean };
type LadderState = { streakDays: number; rungs: Rung[] };

export default function StreakLadder({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<LadderState | null>(null);
  const [busyDay, setBusyDay] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const s = await cartFetch<LadderState>("/games/streak-ladder", { authed: true });
      setState(s);
    } catch { /* handled in loading */ }
  };
  useEffect(() => { refresh(); }, []);

  const claim = async (day: number, e: React.MouseEvent) => {
    setBusyDay(day);
    try {
      const res = await cartFetch<{ coinsEarned?: number; alreadyClaimed?: boolean }>(
        "/games/streak-ladder/claim",
        { method: "POST", authed: true, body: JSON.stringify({ day }) },
      );
      if (res?.alreadyClaimed) setToast("Already claimed");
      else if (res?.coinsEarned) {
        setToast(`+${res.coinsEarned} Goins!`);
        flyCoinsToNavbar(e.currentTarget as HTMLElement, { amount: res.coinsEarned, redeemable: true, source: "streak" });
      }
      await refresh();
      setTimeout(() => setToast(null), 2200);
    } catch (err: any) {
      setToast((err?.body as any)?.message ?? err?.message ?? "Couldn't claim");
      setTimeout(() => setToast(null), 2200);
    } finally {
      setBusyDay(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative w-full max-w-md rounded-2xl bg-[#12131A] border border-white/10 shadow-lg p-6">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-[#1A1B24] hover:bg-[#22232e] border border-white/10 flex items-center justify-center text-white/40 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
          <div className="text-center mb-5">
            <div className="text-5xl mb-2">🪜</div>
            <h2 className="text-xl font-black">Streak Ladder</h2>
            {state && (
              <p className="text-xs text-white/40 mt-1 flex items-center justify-center gap-1">
                <Flame className="w-3.5 h-3.5 text-orange-500" />
                <strong className="text-orange-500">{state.streakDays}-day</strong> streak
              </p>
            )}
          </div>

          {!state ? (
            <div className="flex items-center justify-center py-10 text-white/40">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <ul className="space-y-1.5 mb-2">
              {[...state.rungs].reverse().map((r) => {
                const isCurrent = state.streakDays >= r.day && !r.claimed && r.unlocked;
                return (
                  <li
                    key={r.day}
                    className={`flex items-center gap-3 rounded-xl border p-2.5 transition-all ${
                      r.claimed
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : isCurrent
                          ? "border-amber-500/50 bg-amber-500/10"
                          : r.unlocked
                            ? "border-white/10/50 bg-muted/30"
                            : "border-white/10/30 bg-muted/10 opacity-60"
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 text-xs font-black ${
                        r.claimed
                          ? "bg-emerald-500 text-white"
                          : r.unlocked
                            ? "bg-amber-500 text-white"
                            : "bg-white/10 text-white/40"
                      }`}
                    >
                      {r.claimed ? <Check className="w-4 h-4" /> : r.unlocked ? r.day : <Lock className="w-3.5 h-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{r.label}</div>
                      <div className="text-[11px] text-white/40">+{r.goins} Goins</div>
                    </div>
                    {r.claimed ? (
                      <span className="text-[10px] font-bold text-emerald-600">Claimed</span>
                    ) : r.unlocked ? (
                      <button
                        onClick={(e) => claim(r.day, e)}
                        disabled={busyDay !== null}
                        className="rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 transition-colors disabled:opacity-50"
                      >
                        {busyDay === r.day ? <Loader2 className="w-3 h-3 animate-spin" /> : "Claim"}
                      </button>
                    ) : (
                      <span className="text-[10px] text-white/40">Day {r.day}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-[10px] text-center text-white/40 mt-3">
            Any game you play counts toward your streak. Miss a day and the streak resets.
          </p>
          {toast && (
            <div className="mt-3 text-center text-xs font-semibold text-pink-600">{toast}</div>
          )}
      </div>
    </div>
  );
}
