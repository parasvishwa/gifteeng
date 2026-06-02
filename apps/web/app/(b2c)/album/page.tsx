"use client";

/**
 * /b2c/album — Sticker Album
 * Panini-style collectible: every order awards 1 random sticker.
 * 50 stickers across 5 themes of 10. Complete a row → prize. Full album → grand.
 *
 * Stunning casino-gift aesthetic with:
 *  • Dark backdrop + geometric gift pattern
 *  • Foil-stamped sticker cards for collected; silhouette for missing
 *  • Rarity glow (common → gold, rare → pink, legendary → rainbow)
 *  • Progress ring per row + overall
 *  • Confetti on row-complete claim
 */

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles, Lock, Check, Gift } from "lucide-react";
import ConfettiBurst from "../_components/chrome/ConfettiBurst";
import { cartFetch, getB2cToken } from "@/lib/api";
import { flyCoinsToNavbar } from "@/lib/coins-fx";

type Sticker = {
  code: string; name: string; emoji: string; rarity: string;
  collected: boolean; qty: number; collectedAt: string | null;
};
type ThemeRow = {
  theme: string;
  stickers: Sticker[];
  collectedCount: number;
  total: number;
  rowComplete: boolean;
  prizeClaimed: boolean;
};
type Album = {
  themes: ThemeRow[];
  totalCollected: number;
  totalStickers: number;
  albumComplete: boolean;
  albumClaimed: boolean;
};

const THEME_META: Record<string, { label: string; accent: string; icon: string }> = {
  animals:   { label: "Animal Friends", accent: "#f472b6", icon: "🐾" },
  festivals: { label: "Festive Vibes",  accent: "#f59e0b", icon: "🎆" },
  food:      { label: "Sweet Treats",   accent: "#ec4899", icon: "🍰" },
  things:    { label: "Gift Things",    accent: "#a855f7", icon: "🎁" },
  nature:    { label: "Nature's Magic", accent: "#10b981", icon: "🌈" },
};

const RARITY_CLASS: Record<string, string> = {
  common:    "sticker-common",
  rare:      "sticker-rare",
  legendary: "sticker-legendary",
};

export default function AlbumPage() {
  const router = useRouter();
  const [album, setAlbum]     = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [toast, setToast]     = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [selected, setSelected] = useState<Sticker | null>(null);

  const load = async () => {
    try {
      const a = await cartFetch<Album>("/stickers/album", { authed: !!getB2cToken() });
      setAlbum(a);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };
  useEffect(() => {
    const t = getB2cToken();
    if (!t) { router.push("/auth?next=/album"); return; }
    void load();
  }, [router]);

  const claimRow = async (theme: string) => {
    if (claiming) return;
    setClaiming(theme);
    try {
      const res = await cartFetch<{ goinsAwarded: number; rewardCode: string }>(
        `/stickers/claim-row/${theme}`,
        { method: "POST", authed: true },
      );
      setToast(`+${res.goinsAwarded} Goins and a discount code!`);
      setConfetti(true);
      flyCoinsToNavbar(null, { amount: res.goinsAwarded, redeemable: true, source: "spin" });
      await load();
    } catch (e: any) {
      setToast(e?.body?.message ?? "Could not claim");
    }
    setClaiming(null);
    setTimeout(() => setToast(null), 3500);
  };

  const claimAlbum = async () => {
    if (claiming) return;
    setClaiming("album");
    try {
      const res = await cartFetch<{ goinsAwarded: number; rewardCode: string }>(
        "/stickers/claim-album",
        { method: "POST", authed: true },
      );
      setToast(`🏆 GIFT COLLECTOR! +${res.goinsAwarded} Goins + ₹500 off!`);
      setConfetti(true);
      flyCoinsToNavbar(null, { amount: res.goinsAwarded, redeemable: true, source: "spin" });
      await load();
    } catch (e: any) {
      setToast(e?.body?.message ?? "Could not claim");
    }
    setClaiming(null);
    setTimeout(() => setToast(null), 4500);
  };

  const progress = useMemo(() => {
    if (!album) return 0;
    return album.totalStickers === 0 ? 0 : album.totalCollected / album.totalStickers;
  }, [album]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#06010f" }}>
        <div className="text-white/60 text-center">
          <div className="mx-auto w-10 h-10 rounded-full border-2 border-white/10 border-t-white/60 animate-spin mb-3" />
          <p className="text-sm">Opening album…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "#06010f" }}>
      <ConfettiBurst active={confetti} onDone={() => setConfetti(false)} />
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] px-4 py-2.5 rounded-full text-sm font-black text-black shadow-2xl"
          style={{ background: "hsl(43 96% 52%)", animation: "album-toast 0.4s ease-out both" }}
        >
          {toast}
        </div>
      )}

      {/* Geometric backdrop */}
      <div className="absolute inset-0 opacity-[0.06] pointer-events-none">
        <svg className="absolute inset-0 w-full h-full">
          <defs>
            <pattern id="album-pat" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
              <g fill="none" stroke="#ec4899" strokeWidth="0.8">
                <rect x="16" y="16" width="28" height="28" rx="3" />
                <circle cx="30" cy="30" r="4" />
              </g>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#album-pat)" />
        </svg>
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-4 py-8 md:py-12">
        {/* Header */}
        <Link href="/play" className="inline-flex items-center gap-1 text-white/60 hover:text-white text-sm mb-5">
          <ArrowLeft className="w-4 h-4" /> Back to Play
        </Link>

        <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
          <div>
            <p className="text-amber-300/80 text-[10px] font-black uppercase tracking-[0.28em] mb-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Gift Collector Album
            </p>
            <h1 className="text-white text-3xl md:text-4xl font-black font-display">
              Your Sticker Collection
            </h1>
            <p className="text-white/60 text-sm mt-1">
              Every order earns a random sticker. Complete rows to win prizes.
            </p>
          </div>
          {album && (
            <div
              className="rounded-2xl border border-white/10 p-3 text-center"
          style={{ background: "hsl(351 85% 58% / 0.08)" }}
            >
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-300/80 mb-0.5">Progress</p>
              <p className="text-white text-2xl font-black tabular-nums">
                {album.totalCollected}<span className="text-white/40 text-sm">/{album.totalStickers}</span>
              </p>
              <div className="mt-1 h-1 w-24 mx-auto rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ width: `${progress * 100}%`, background: "hsl(351 85% 58%)" }}
                />
              </div>
            </div>
          )}
        </div>

        {album && (
          <>
            {/* Themes */}
            <div className="space-y-6">
              {album.themes.map((row) => {
                const meta = THEME_META[row.theme];
                if (!meta) return null;
                return (
                  <div
                    key={row.theme}
                    className="rounded-2xl border border-white/10 p-4 md:p-5"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    {/* Row header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                          style={{ background: meta.accent }}
                        >
                          {meta.icon}
                        </div>
                        <div>
                          <p className="text-white font-black text-base">{meta.label}</p>
                          <p className="text-white/40 text-xs tabular-nums">
                            {row.collectedCount}/{row.total} collected
                          </p>
                        </div>
                      </div>
                      {row.rowComplete ? (
                        row.prizeClaimed ? (
                          <span className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300">
                            <Check className="w-3 h-3 inline mr-0.5" /> Claimed
                          </span>
                        ) : (
                          <button
                            onClick={() => claimRow(row.theme)}
                            disabled={claiming === row.theme}
                            className="px-4 py-1.5 rounded-full text-[11px] font-black bg-[#EF3752] text-white shadow-sm hover:opacity-90 transition-all active:scale-95"
                          >
                            {claiming === row.theme ? "Claiming…" : "🎁 Claim 50 Goins + 10%"}
                          </button>
                        )
                      ) : (
                        <div className="text-right">
                          <p className="text-[9px] text-white/30 uppercase tracking-wider">Row prize</p>
                          <p className="text-white/70 text-[11px] font-bold">50 Goins + 10% off</p>
                        </div>
                      )}
                    </div>

                    {/* Stickers grid */}
                    <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
                      {row.stickers.map((s) => (
                        <button
                          key={s.code}
                          onClick={() => s.collected && setSelected(s)}
                          disabled={!s.collected}
                          className={`aspect-square rounded-2xl relative overflow-hidden transition-transform duration-200 ease-[cubic-bezier(0.34,1.8,0.64,1)] will-change-transform ${
                            s.collected ? `${RARITY_CLASS[s.rarity]} hover:-translate-y-1.5 hover:scale-[1.1] active:scale-[0.95] cursor-pointer` : "opacity-30"
                          }`}
                          style={{
                            background: s.collected
                              ? `${meta.accent}22`
                              : "rgba(255,255,255,0.04)",
                            border: s.collected
                              ? `1.5px solid ${meta.accent}99`
                              : "1.5px dashed rgba(255,255,255,0.15)",
                          }}
                        >
                          <div
                            className="absolute inset-0 flex items-center justify-center text-2xl md:text-3xl"
                            style={{
                              filter: s.collected
                                ? "drop-shadow(0 2px 6px rgba(0,0,0,0.4))"
                                : "grayscale(1) brightness(0.4)",
                            }}
                          >
                            {s.collected ? s.emoji : <Lock className="w-4 h-4 text-white/30" />}
                          </div>
                          {s.qty > 1 && (
                            <span className="absolute bottom-0.5 right-0.5 bg-amber-400 text-black text-[8px] font-black px-1 rounded">
                              ×{s.qty}
                            </span>
                          )}
                          {s.rarity === "legendary" && s.collected && (
                            <div className="absolute inset-0 pointer-events-none rounded-2xl ring-1 ring-white/20" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Full album claim CTA */}
            <div
              className="relative mt-8 rounded-2xl p-6 overflow-hidden"
              style={{
                background: album.albumComplete
                  ? "#EF3752"
                  : "rgba(255,255,255,0.03)",
              }}
            >
              {album.albumComplete && (
                <div className="absolute inset-0 pointer-events-none rounded-2xl ring-1 ring-white/20" />
              )}
              <div className="relative flex items-center gap-4">
                <div className="text-5xl">🏆</div>
                <div className="flex-1 min-w-0">
                  <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.2em]">
                    Grand Prize
                  </p>
                  <p className="text-white font-black text-lg md:text-xl">GIFT COLLECTOR</p>
                  <p className="text-white/80 text-xs md:text-sm">
                    Complete all 50 stickers to unlock 2,000 Goins + ₹500 off coupon
                  </p>
                </div>
                {album.albumComplete && !album.albumClaimed && (
                  <button
                    onClick={claimAlbum}
                    disabled={claiming === "album"}
                    className="shrink-0 px-4 py-2 rounded-full text-xs font-black bg-[#EF3752] text-white shadow-sm hover:opacity-90"
                  >
                    {claiming === "album" ? "Claiming…" : "🏆 CLAIM"}
                  </button>
                )}
                {album.albumClaimed && (
                  <span className="shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black bg-emerald-500/30 text-emerald-300 uppercase tracking-wider">
                    <Check className="w-3 h-3 inline mr-0.5" /> Claimed
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sticker detail modal */}
      {selected && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="rounded-2xl p-6 max-w-xs w-full text-center border border-border bg-[#12131A]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-7xl mb-3">{selected.emoji}</div>
            <p className="text-white font-black text-xl">{selected.name}</p>
            <p className={`text-xs font-black uppercase tracking-wider mt-1 ${
              selected.rarity === "legendary" ? "text-amber-300" :
              selected.rarity === "rare" ? "text-pink-300" : "text-white/60"
            }`}>
              {selected.rarity}
            </p>
            <p className="text-white/50 text-xs mt-2">
              Owned: ×{selected.qty}{selected.collectedAt ? ` · since ${new Date(selected.collectedAt).toLocaleDateString()}` : ""}
            </p>
            <button
              onClick={() => setSelected(null)}
              className="mt-4 w-full py-2.5 rounded-xl text-sm font-black bg-[#EF3752] text-white hover:opacity-90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes album-toast {
          from { opacity: 0; transform: translate(-50%, -14px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        .sticker-common    { box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
        .sticker-rare      { box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
        .sticker-legendary { box-shadow: 0 2px 8px rgba(0,0,0,0.5); }
      `}</style>
    </div>
  );
}
