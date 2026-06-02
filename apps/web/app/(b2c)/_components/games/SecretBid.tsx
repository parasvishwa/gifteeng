"use client";

/**
 * SecretBid — lowest-unique-bid game.
 * User picks a secret number between minBidGoins..maxBidGoins; whoever picks
 * the lowest UNIQUE number when bidding closes wins the item.
 */

import { useEffect, useState } from "react";
import { X, Trophy, Clock, Users } from "lucide-react";
import { cartFetch, getB2cToken } from "@/lib/api";

type Item = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  prizeLabel: string;
  minBidGoins: number;
  maxBidGoins: number;
  costPerEntry: number;
  opensAt: string;
  closesAt: string;
};
type MyEntry = { id: string; bidAmount: number; costGoins: number; createdAt: string };

type Props = { onClose: () => void; goinBalance: number };

export default function SecretBid({ onClose, goinBalance }: Props) {
  const [item, setItem]          = useState<Item | null>(null);
  const [myEntries, setMyEntries] = useState<MyEntry[]>([]);
  const [total, setTotal]         = useState(0);
  const [bid, setBid]             = useState<string>("");
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState<string | null>(null);
  const [success, setSuccess]     = useState<string | null>(null);
  const [timeLeft, setTimeLeft]   = useState("");

  // Load current
  const load = async () => {
    try {
      const res = await cartFetch<{ item: Item | null; myEntries: MyEntry[]; totalEntries: number }>(
        "/bids/current",
        { authed: !!getB2cToken() },
      );
      setItem(res.item);
      setMyEntries(res.myEntries);
      setTotal(res.totalEntries);
      if (res.item && !bid) setBid(String(res.item.minBidGoins));
    } catch {}
  };
  useEffect(() => { void load(); }, []);

  // Countdown
  useEffect(() => {
    if (!item) return;
    const t = setInterval(() => {
      const diff = new Date(item.closesAt).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("Closed"); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(t);
  }, [item]);

  const submit = async () => {
    if (!item || busy) return;
    const amt = parseInt(bid, 10);
    if (!Number.isFinite(amt)) { setErr("Enter a valid number"); return; }
    setBusy(true); setErr(null); setSuccess(null);
    try {
      await cartFetch("/bids/place", {
        method: "POST",
        body: JSON.stringify({ bidItemId: item.id, bidAmount: amt }),
        authed: true,
      });
      setSuccess(`Bid of ${amt} placed! Good luck 🍀`);
      await load();
    } catch (e: any) {
      setErr(e?.body?.message ?? "Could not place bid");
    }
    setBusy(false);
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-[#12131A] border border-white/10 p-6 shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-white/10 hover:bg-white/20 z-10"
        >
          <X className="w-4 h-4 text-white/70" />
        </button>

        <div className="text-center mb-4">
          <p className="text-white/40 text-[9px] font-black uppercase tracking-[0.22em] mb-1">
            🏷️ Secret Bid · Lowest Unique Wins
          </p>
          <h2 className="text-white text-lg font-black">
            {item ? item.title : "Loading…"}
          </h2>
          {item && (
            <p className="text-white/50 text-xs mt-0.5 line-clamp-2">{item.description}</p>
          )}
        </div>

        {item ? (
          <>
            {/* Prize pill */}
            <div
              className="rounded-2xl p-3 mb-4 flex items-center gap-3 bg-amber-500/10 border border-amber-500/20"
            >
              <Trophy className="w-8 h-8 text-amber-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-300/80">Prize</p>
                <p className="text-white font-black text-sm leading-tight">{item.prizeLabel}</p>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="rounded-xl border border-white/10 p-2 text-center bg-white/5">
                <Clock className="w-3.5 h-3.5 text-amber-300 mx-auto" />
                <p className="text-white text-xs font-black mt-0.5 tabular-nums">{timeLeft || "—"}</p>
                <p className="text-white/40 text-[9px]">left</p>
              </div>
              <div className="rounded-xl border border-white/10 p-2 text-center bg-white/5">
                <Users className="w-3.5 h-3.5 text-fuchsia-300 mx-auto" />
                <p className="text-white text-xs font-black mt-0.5 tabular-nums">{total}</p>
                <p className="text-white/40 text-[9px]">bidders</p>
              </div>
              <div className="rounded-xl border border-white/10 p-2 text-center bg-white/5">
                <span className="text-sm">🪙</span>
                <p className="text-white text-xs font-black mt-0.5 tabular-nums">{item.costPerEntry}</p>
                <p className="text-white/40 text-[9px]">per bid</p>
              </div>
            </div>

            {/* Bid input */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 mb-3">
              <p className="text-white/50 text-[10px] uppercase tracking-wider mb-2">Your secret bid (Goins)</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBid((b) => String(Math.max(item.minBidGoins, (parseInt(b, 10) || item.minBidGoins) - 1)))}
                  className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xl font-bold"
                >−</button>
                <input
                  type="number"
                  inputMode="numeric"
                  value={bid}
                  min={item.minBidGoins}
                  max={item.maxBidGoins}
                  onChange={(e) => setBid(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-black/40 text-center text-white font-black text-lg tabular-nums border border-white/10 focus:border-amber-400 focus:outline-none"
                />
                <button
                  onClick={() => setBid((b) => String(Math.min(item.maxBidGoins, (parseInt(b, 10) || item.minBidGoins) + 1)))}
                  className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xl font-bold"
                >+</button>
              </div>
              <p className="text-white/40 text-[10px] mt-2 text-center">
                Allowed: {item.minBidGoins}–{item.maxBidGoins} · Lowest UNIQUE number wins
              </p>
            </div>

            {err && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-2.5 text-center text-red-300 text-xs mb-3">
                {err}
              </div>
            )}
            {success && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-2.5 text-center text-emerald-300 text-xs mb-3">
                {success}
              </div>
            )}

            <button
              onClick={submit}
              disabled={busy || goinBalance < item.costPerEntry || myEntries.length >= 10}
              className="w-full py-3.5 rounded-2xl text-sm font-black bg-brand hover:bg-brand-dark text-white transition-colors active:scale-95 disabled:opacity-50"
            >
              {busy
                ? "Placing bid…"
                : goinBalance < item.costPerEntry
                ? `Need ${item.costPerEntry} Goins`
                : myEntries.length >= 10
                ? "Max 10 bids reached"
                : `🏷️ Place Bid · −${item.costPerEntry} Goins`}
            </button>

            {myEntries.length > 0 && (
              <div className="mt-4">
                <p className="text-white/40 text-[9px] font-black uppercase tracking-[0.2em] mb-2">
                  Your Bids ({myEntries.length}/10)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {myEntries.map((e) => (
                    <span
                      key={e.id}
                      className="text-[11px] font-black font-mono text-amber-200 bg-amber-400/10 border border-amber-400/30 rounded-full px-2 py-0.5"
                    >
                      {e.bidAmount}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          // Animated empty state — flat "No open bids" read as lifeless.
          // This has a soft orbiting icon + pulsing glow so it feels like
          // the game is "standing by" rather than broken.
          <div className="relative text-center py-10 overflow-hidden">
            <div className="relative w-16 h-16 mx-auto mb-3">
              <div className="absolute inset-0 rounded-full bg-amber-400/20 blur-xl animate-pulse" />
              <div className="relative w-full h-full rounded-full bg-amber-400/10 border border-amber-400/30 flex items-center justify-center">
                <span className="text-2xl" style={{ animation: "sb-idle-float 3.2s ease-in-out infinite" }}>🎯</span>
              </div>
            </div>
            <p className="text-white/80 font-bold text-sm">Next bidding round opens soon</p>
            <p className="text-white/40 text-[11px] mt-1">Come back — the lowest unique wins.</p>
            <style>{`@keyframes sb-idle-float{0%,100%{transform:translateY(0) rotate(-6deg)}50%{transform:translateY(-6px) rotate(6deg)}}`}</style>
          </div>
        )}
      </div>
    </div>
  );
}
