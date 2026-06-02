"use client";

/**
 * DailyQuest — 3-step daily checklist + all-3 bonus. Deploy 118.
 *
 * Flow:
 *   GET  /api/games/daily-quest  → { stepsDone, bonusEligible, steps, bonusReward }
 *   POST /api/games/daily-quest/claim { step } → +coins
 *
 * Steps 1 & 2 are claimed by the user tapping "Claim". Step 3 is auto-
 * detected server-side (any other game played today) — the button becomes
 * active without requiring a client-side trigger. Bonus unlocks when all
 * three are done.
 */

import { useEffect, useState } from "react";
import { X, Check, Sparkles, Loader2 } from "lucide-react";
import { cartFetch } from "@/lib/api";
import { flyCoinsToNavbar } from "@/lib/coins-fx";

type Step = { id: "1" | "2" | "3"; label: string; reward: number };
type QuestState = {
  stepsDone: Record<"1" | "2" | "3", boolean>;
  bonusEligible: boolean;
  bonusClaimed: boolean;
  steps: Step[];
  bonusReward: number;
};

export default function DailyQuest({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<QuestState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const s = await cartFetch<QuestState>("/games/daily-quest", { authed: true });
      setState(s);
    } catch { /* handled by loading state */ }
  };
  useEffect(() => { refresh(); }, []);

  async function claim(step: "1" | "2" | "3" | "bonus", e?: React.MouseEvent) {
    setBusy(step);
    try {
      const res = await cartFetch<{ coinsEarned?: number; alreadyClaimed?: boolean }>(
        "/games/daily-quest/claim",
        { method: "POST", authed: true, body: JSON.stringify({ step }) },
      );
      if (res?.alreadyClaimed) setToast("Already claimed today");
      else if (res?.coinsEarned) {
        setToast(`+${res.coinsEarned} Goins!`);
        if (e?.currentTarget) {
          flyCoinsToNavbar(e.currentTarget as HTMLElement, { amount: res.coinsEarned, redeemable: true, source: "quest" });
        }
      }
      await refresh();
      setTimeout(() => setToast(null), 2200);
    } catch (err: any) {
      setToast((err?.body as any)?.message ?? err?.message ?? "Couldn't claim");
      setTimeout(() => setToast(null), 2200);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-md rounded-2xl bg-[#12131A] border border-white/10 shadow-lg p-6">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-[#1A1B24] hover:bg-[#22232e] border border-white/10 flex items-center justify-center text-white/40 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
          <div className="text-center mb-5">
            <div className="text-5xl mb-2">✅</div>
            <h2 className="text-xl font-black">Daily Quest</h2>
            <p className="text-xs text-white/40 mt-1">
              Complete 3 tiny tasks for a bonus
            </p>
          </div>

          {!state ? (
            <div className="flex items-center justify-center py-10 text-white/40">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <ul className="space-y-2 mb-4">
              {state.steps.map((s) => {
                const done = state.stepsDone[s.id];
                return (
                  <li
                    key={s.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                      done
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : "border-white/10/50 bg-muted/30"
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-white text-sm font-black shrink-0 ${
                        done ? "bg-emerald-500" : "bg-white/10-foreground/30"
                      }`}
                    >
                      {done ? <Check className="w-4 h-4" /> : s.id}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold ${done ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                        {s.label}
                      </div>
                      <div className="text-[11px] text-white/40">+{s.reward} Goins</div>
                    </div>
                    {done ? (
                      <span className="text-[11px] font-bold text-emerald-600">Done</span>
                    ) : (
                      <button
                        onClick={(e) => claim(s.id, e)}
                        disabled={!!busy}
                        className="rounded-full bg-brand hover:bg-brand-dark text-white text-xs font-bold px-3 py-1.5 transition-colors disabled:opacity-50"
                      >
                        {busy === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Claim"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Bonus row */}
          {state && (
            <div
              className={`rounded-2xl p-4 text-center border ${
                state.bonusEligible
                  ? "bg-amber-500/10 border-amber-400/60"
                  : state.bonusClaimed
                    ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500/40"
                    : "bg-white/10/30 border-white/10/50"
              }`}
            >
              <div className="flex items-center justify-center gap-1.5 text-sm font-bold mb-1">
                <Sparkles className="w-4 h-4 text-amber-500" />
                All-3 Bonus
                <Sparkles className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-[11px] text-white/40 mb-2">
                +{state.bonusReward} Goins when every step is done
              </div>
              {state.bonusClaimed ? (
                <div className="text-xs font-bold text-emerald-600">✓ Claimed today</div>
              ) : (
                <button
                  onClick={(e) => claim("bonus", e)}
                  disabled={!state.bonusEligible || !!busy}
                  className="rounded-full bg-brand hover:bg-brand-dark text-white text-xs font-bold px-6 py-2 transition-colors disabled:opacity-40"
                >
                  {busy === "bonus" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Claim bonus"}
                </button>
              )}
            </div>
          )}

          {toast && (
            <div className="mt-3 text-center text-xs font-semibold text-pink-600">{toast}</div>
          )}
      </div>
    </div>
  );
}
