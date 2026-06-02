"use client";

/**
 * /gift/[token] — Duet Jackpot recipient landing
 *
 * Flow:
 *  1. Recipient lands → sees "[Sender] sent you a surprise scratch card!"
 *  2. Taps "Reveal" → (if not logged in, routes to /auth)
 *  3. Scratch card opens → reveals discount or free perk
 *  4. Sender also gets +10 Goins thank-you
 */

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Gift, Sparkles } from "lucide-react";
import ConfettiBurst from "../../_components/chrome/ConfettiBurst";
import { cartFetch, getB2cToken } from "@/lib/api";

type Invite = {
  token: string;
  senderName: string | null;
  isClaimed: boolean;
  isExpired: boolean;
  canClaim: boolean;
};
type ClaimResult = {
  rewardCode: string;
  rewardLabel: string;
  rewardType: string;
  rewardValue: string;
};

export default function DuetLandingPage({
  params,
}: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [invite, setInvite]   = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [result, setResult]   = useState<ClaimResult | null>(null);
  const [confetti, setConfetti] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await cartFetch<Invite>(`/duet/${token}`);
        setInvite(r);
      } catch (e: any) {
        setError(e?.body?.message ?? "Invalid link");
      }
      setLoading(false);
    })();
  }, [token]);

  const claim = async () => {
    const t = getB2cToken();
    if (!t) {
      router.push(`/auth?next=${encodeURIComponent(`/gift/${token}`)}`);
      return;
    }
    if (claiming) return;
    setClaiming(true);
    try {
      const r = await cartFetch<ClaimResult>(`/duet/${token}/claim`, {
        method: "POST",
        authed: true,
      });
      setResult(r);
      setConfetti(true);
    } catch (e: any) {
      setError(e?.body?.message ?? "Could not claim");
    }
    setClaiming(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#06010f" }}>
        <div className="w-10 h-10 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden p-4" style={{ background: "#06010f" }}>
      <ConfettiBurst active={confetti} onDone={() => setConfetti(false)} />


      <div
        className="relative w-full max-w-md rounded-2xl border border-border bg-[#12131A] p-6 md:p-8 text-center"
      >
        <p className="text-amber-300/80 text-[10px] font-black uppercase tracking-[0.28em] mb-2 flex items-center justify-center gap-1">
          <Sparkles className="w-3 h-3" /> Duet Jackpot
        </p>

        {error && !invite ? (
          <>
            <div className="text-6xl mb-3">😕</div>
            <h1 className="text-white text-xl font-black">Link unavailable</h1>
            <p className="text-white/60 text-sm mt-2">{error}</p>
            <Link
              href="/"
              className="inline-block mt-6 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#EF3752] text-white hover:opacity-90"
            >
              Explore Gifteeng
            </Link>
          </>
        ) : invite && invite.isExpired ? (
          <>
            <div className="text-6xl mb-3">⏳</div>
            <h1 className="text-white text-xl font-black">This Duet has expired</h1>
            <p className="text-white/60 text-sm mt-2">Looks like this gift card is no longer valid. Ask your friend to send another!</p>
            <Link
              href="/"
              className="inline-block mt-6 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#EF3752] text-white hover:opacity-90"
            >
              Explore Gifteeng
            </Link>
          </>
        ) : invite && invite.isClaimed ? (
          <>
            <div className="text-6xl mb-3">✅</div>
            <h1 className="text-white text-xl font-black">Already claimed</h1>
            <p className="text-white/60 text-sm mt-2">This Duet gift has been claimed. Ask your friend for a new one!</p>
            <Link
              href="/"
              className="inline-block mt-6 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#EF3752] text-white hover:opacity-90"
            >
              Explore Gifteeng
            </Link>
          </>
        ) : result ? (
          <>
            <div className="text-6xl mb-3 scr-pop">🎉</div>
            <h1 className="text-white text-2xl font-black">You got it!</h1>
            <div className="mt-5 rounded-2xl bg-[#1A1B24] border border-border p-4">
              <p className="text-white/90 text-[10px] font-black uppercase tracking-wider">Your reward</p>
              <p className="text-white font-black text-xl mt-1">{result.rewardLabel}</p>
              <p className="mt-2 inline-block bg-black/30 text-white text-[11px] font-mono font-bold px-3 py-1 rounded-lg">
                {result.rewardCode}
              </p>
            </div>
            <p className="text-white/50 text-xs mt-4">
              Use it at checkout on your first Gifteeng order. Valid for 30 days.
            </p>
            <Link
              href="/products"
              className="inline-block mt-5 w-full py-3 rounded-xl text-sm font-bold bg-[#EF3752] text-white hover:opacity-90"
            >
              🛍️ Shop Gifteeng
            </Link>
          </>
        ) : invite && invite.canClaim ? (
          <>
            <div className="text-6xl mb-4">
              <span style={{ animation: "duet-wiggle 1.3s ease-in-out infinite" }}>🎁</span>
            </div>
            <h1 className="text-white text-2xl font-black leading-tight">
              {invite.senderName ? invite.senderName.split(" ")[0] : "A friend"} sent you a{" "}
              <span className="text-[#EF3752]">
                surprise reward
              </span>
            </h1>
            <p className="text-white/60 text-sm mt-3">
              Open your Duet scratch card to reveal a discount, free shipping, or other surprise on your first Gifteeng order.
            </p>

            <button
              onClick={claim}
              disabled={claiming}
              className="mt-6 w-full py-3.5 rounded-xl bg-[#EF3752] text-sm font-bold text-white transition-all active:scale-95 hover:opacity-90"
            >
              {claiming ? "Opening your card…" : "🎫 Reveal my reward"}
            </button>

            <p className="text-white/30 text-[10px] mt-3">
              {!getB2cToken() ? "You'll sign in first (takes 30 seconds)" : "One tap and it's yours"}
            </p>
          </>
        ) : null}

        <style>{`
          @keyframes duet-wiggle {
            0%,100% { transform: rotate(-6deg) scale(1); }
            25%     { transform: rotate(6deg) scale(1.08); }
            50%     { transform: rotate(-4deg) scale(1.04); }
            75%     { transform: rotate(4deg) scale(1.1); }
          }
          @keyframes scr-pop {
            0%   { transform: scale(0.5); opacity: 0; }
            60%  { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(1); }
          }
          .scr-pop { animation: scr-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both; }
        `}</style>
      </div>
    </div>
  );
}
