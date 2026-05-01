"use client";

/**
 * Games Hub — /b2c/play
 *
 * Neon sporty casino design with LIVE animations:
 *   - Drifting particle field (🎁✨🪙 floating up)
 *   - Animated aurora gradient backdrop
 *   - Pulsing "X playing now" chip
 *   - Ambient shimmer sweep across game cards
 *   - Animated flame for streak
 *   - Countdown timer when daily limit reached (not just greyed out)
 *   - Per-card prize tease band
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Volume2, VolumeX, Flame, Clock, Copy, Check,
  Zap, Trophy, Sparkles, ChevronRight,
} from "lucide-react";
import { cartFetch, getB2cToken } from "@/lib/api";
import ScratchCard from "../_components/games/ScratchCard";
import MysteryBox from "../_components/games/MysteryBox";
import Jackpot from "../_components/games/Jackpot";
import SecretBid from "../_components/games/SecretBid";
import FlashJackpot from "../_components/games/FlashJackpot";
import GifterTree from "../_components/games/GifterTree";
// Deploy 118 + 119 — four new Gift Casino games
import DailyQuest from "../_components/games/DailyQuest";
import StreakLadder from "../_components/games/StreakLadder";
import TreasureHunt from "../_components/games/TreasureHunt";
import GoinWager from "../_components/games/GoinWager";
// Deploy 120 — Product Drop (win real merchandise)
import ProductDrop from "../_components/games/ProductDrop";
// Inline spin wheel — no more profile-page redirect
import { SpinWheelModal } from "../_components/chrome/SpinWheel";
// Live social-proof winners feed — mirrors mobile play screen
import WinnersFeed from "../_components/games/WinnersFeed";

// ── Types ─────────────────────────────────────────────────────────────────
type GameCard = {
  type:
    | "scratch_card" | "jackpot" | "mystery_box" | "spin_wheel"
    | "daily_quest" | "streak_ladder" | "treasure_hunt" | "goin_wager"
    | "product_drop";
  title: string;
  description: string;
  dailyLimit: number;
  playsToday: number;
  canPlay: boolean;
  costGoins: number;
};
type Hub = {
  goinBalance: number;
  streak: {
    current: number;
    longest: number;
    milestonesHit: number[];
    nextMilestone?: { day: number; goins: number; label: string };
  };
  games: GameCard[];
  recentPlays: { gameType: string; rewardLabel: string | null; createdAt: string }[];
};
type Reward = {
  id: string;
  code: string;
  type: string;
  value: string;
  label: string;
  status: string;
  source: string;
  minCartInr: number;
  expiresAt: string | null;
};
type Album = { totalCollected: number; totalStickers: number; themes: { stickers: { emoji: string; collected: boolean }[] }[] };

// ── Per-game presentation data ────────────────────────────────────────────
const GAME_META: Record<string, {
  emoji: string;
  accent: string;
  title: string;
  prizeTease: string;
  cta: string;
}> = {
  scratch_card: {
    emoji: "🎫",
    accent: "#ec4899",
    title: "Scratch Card",
    prizeTease: "Win up to ₹500",
    cta: "SCRATCH",
  },
  jackpot: {
    emoji: "🎰",
    accent: "#facc15",
    title: "Gift Jackpot",
    prizeTease: "Match · Win big",
    cta: "SPIN",
  },
  mystery_box: {
    emoji: "🎁",
    accent: "#8b5cf6",
    title: "Mystery Box",
    prizeTease: "6 boxes · 1 prize",
    cta: "OPEN",
  },
  spin_wheel: {
    emoji: "🎡",
    accent: "#f97316",
    title: "Spin Wheel",
    prizeTease: "Up to 100 Goins",
    cta: "SPIN",
  },
  secret_bid: {
    emoji: "🏷️",
    accent: "#10b981",
    title: "Secret Bid",
    prizeTease: "Hamper worth ₹2,500",
    cta: "BID",
  },
  flash_jackpot: {
    emoji: "⚡",
    accent: "#facc15",
    title: "Flash Jackpot",
    prizeTease: "1 winner every hour",
    cta: "FLASH",
  },
  // Deploy 118
  daily_quest: {
    emoji: "✅",
    accent: "#8b5cf6",
    title: "Daily Quest",
    prizeTease: "3 steps · +320 G max",
    cta: "START",
  },
  streak_ladder: {
    emoji: "🪜",
    accent: "#f59e0b",
    title: "Streak Ladder",
    prizeTease: "Climb to 3,500 G",
    cta: "CLIMB",
  },
  // Deploy 119
  treasure_hunt: {
    emoji: "🗺️",
    accent: "#059669",
    title: "Treasure Hunt",
    prizeTease: "Pick a box · 1,500 G jackpot",
    cta: "HUNT",
  },
  goin_wager: {
    emoji: "🎲",
    accent: "#be123c",
    title: "Goin Wager",
    prizeTease: "Stake to 10× — or bust",
    cta: "WAGER",
  },
  // Deploy 120
  product_drop: {
    emoji: "🎁",
    accent: "#c026d3",
    title: "Product Drop",
    prizeTease: "Win it · Pay shipping only",
    cta: "DROP",
  },
};

// Drifting particle emojis — purely decorative
const PARTICLES = ["🎁", "🪙", "✨", "💎", "🎀", "⭐"];

export default function PlayPage() {
  const router = useRouter();
  const [hub, setHub]             = useState<Hub | null>(null);
  const [rewards, setRewards]     = useState<Reward[]>([]);
  const [album, setAlbum]         = useState<Album | null>(null);
  const [loading, setLoading]     = useState(true);
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [sound, setSound]         = useState(true);
  const [livePlayers, setLivePlayers] = useState(0);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // ── Load hub + auto check-in ─────────────────────────────────────────────
  useEffect(() => {
    const token = getB2cToken();
    if (!token) { router.push("/auth?next=/b2c/play"); return; }
    (async () => {
      try {
        await cartFetch("/games/streak", { method: "POST", authed: true }).catch(() => null);
        const [h, r, a] = await Promise.all([
          cartFetch<Hub>("/games/hub", { authed: true }),
          cartFetch<Reward[]>("/rewards/active", { authed: true }),
          cartFetch<Album>("/stickers/album", { authed: true }).catch(() => null),
        ]);
        setHub(h);
        setRewards(r);
        if (a) setAlbum(a);
        setLoading(false);
      } catch {
        setLoading(false);
      }
    })();

    // "Live players" simulated ticker — deterministic-ish random walk
    const base = 340 + Math.floor(Math.random() * 420);
    setLivePlayers(base);
    const t = setInterval(() => {
      setLivePlayers((p) => {
        const delta = Math.floor(Math.random() * 9) - 4; // -4..+4
        return Math.max(120, p + delta);
      });
    }, 2500);
    return () => clearInterval(t);
  }, [router]);

  const refreshHub = async () => {
    try {
      const [h, r] = await Promise.all([
        cartFetch<Hub>("/games/hub", { authed: true }),
        cartFetch<Reward[]>("/rewards/active", { authed: true }),
      ]);
      setHub(h);
      setRewards(r);
    } catch {}
  };

  const closeGame = () => { setActiveGame(null); void refreshHub(); };

  const copy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1800);
  };

  // Virtual games (not from backend hub)
  const allGames = useMemo(() => {
    if (!hub) return [];
    return [
      ...hub.games,
      { type: "secret_bid" as const, title: "Secret Bid", description: "Lowest unique bid wins the hamper", dailyLimit: 10, playsToday: 0, canPlay: true, costGoins: 50 },
      { type: "flash_jackpot" as const, title: "Flash Jackpot", description: "One lucky Gifteer wins every hour", dailyLimit: 24, playsToday: 0, canPlay: true, costGoins: 0 },
    ];
  }, [hub]);

  // Collected sticker emoji strip (last 4 collected)
  const stickerPreview = useMemo(() => {
    if (!album) return [];
    const all: { emoji: string; collected: boolean }[] = [];
    for (const t of album.themes) all.push(...t.stickers);
    return all.filter((s) => s.collected).slice(-4);
  }, [album]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#06010f" }}>
        <div className="text-center text-white/60">
          <div className="mx-auto w-12 h-12 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin mb-3" />
          <p className="text-sm">Loading games…</p>
        </div>
      </div>
    );
  }
  if (!hub) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#06010f" }}>
        <div className="text-center text-white/60 p-6">
          <p className="text-lg mb-2">😕 Could not load games</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-5 py-2 rounded-full bg-white/10 text-white text-sm">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "#04010c" }}>

      {/* Geometric pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.05]">
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="h-pat" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
              <g fill="none" stroke="#ec4899" strokeWidth="1">
                <rect x="24" y="24" width="32" height="32" rx="2" />
                <line x1="24" y1="40" x2="56" y2="40" />
                <line x1="40" y1="24" x2="40" y2="56" />
              </g>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#h-pat)" />
        </svg>
      </div>

      {/* Drifting particles — 20 absolute-positioned floating emojis */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        {Array.from({ length: 20 }).map((_, i) => {
          const p = PARTICLES[i % PARTICLES.length]!;
          const left = (i * 37 + 13) % 100; // pseudo-random
          const delay = (i * 0.7) % 8;
          const dur = 12 + ((i * 13) % 10);
          const size = 14 + ((i * 3) % 10);
          return (
            <span
              key={i}
              className="absolute opacity-20"
              style={{
                left: `${left}%`,
                bottom: "-20px",
                fontSize: `${size}px`,
                animation: `hub-drift ${dur}s linear infinite`,
                animationDelay: `-${delay}s`,
              }}
            >
              {p}
            </span>
          );
        })}
      </div>

      {/* ══ Content ═════════════════════════════════════════════════════ */}
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 md:py-10">

        {/* ─── TOP BAR ─── */}
        <div className="flex items-center justify-between mb-5 md:mb-7">
          <div>
            <p className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.28em] mb-0.5 text-white/60">
              Gifteeng · Play & Win
            </p>
            <h1 className="text-white text-2xl md:text-4xl font-black font-display leading-none tracking-tight">
              Your Gift Casino
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-emerald-400/30"
              style={{ background: "rgba(16,185,129,0.1)" }}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-emerald-300 text-[11px] font-black tabular-nums">
                {livePlayers.toLocaleString("en-IN")}
                <span className="text-emerald-300/50 font-bold ml-0.5">online</span>
              </span>
            </div>
            <button
              onClick={() => setSound((s) => !s)}
              className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
              title={sound ? "Mute" : "Unmute"}
            >
              {sound ? <Volume2 className="w-4 h-4 text-white/70" /> : <VolumeX className="w-4 h-4 text-white/40" />}
            </button>
            <Link
              href="/b2c/account?tab=goins"
              className="flex items-center gap-1.5 px-3 h-9 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            >
              <span className="text-amber-400 text-base">🪙</span>
              <span className="text-white text-sm font-black tabular-nums">{hub.goinBalance.toLocaleString("en-IN")}</span>
            </Link>
          </div>
        </div>

        {/* ─── HERO: 3-column identity strip ─── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-5 md:mb-7">

          {/* Streak card */}
          <HeroCard accent="#f59e0b">
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl bg-[#1A1B24]"
                >
                  <Flame className="w-7 h-7 text-white" fill="currentColor" style={{ animation: "hub-flame 0.7s ease-in-out infinite alternate" }} />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-amber-300/80 text-[9px] font-black uppercase tracking-[0.22em]">
                  Daily Streak
                </p>
                <p className="text-white font-black text-2xl leading-none mt-0.5 tabular-nums">
                  {hub.streak.current}<span className="text-white/40 text-sm font-bold ml-1">day{hub.streak.current !== 1 ? "s" : ""}</span>
                </p>
                <p className="text-white/50 text-[11px] mt-0.5 truncate">
                  {hub.streak.nextMilestone
                    ? `${hub.streak.nextMilestone.day - hub.streak.current} to +${hub.streak.nextMilestone.goins}G`
                    : "Max streak · legendary"}
                </p>
              </div>
            </div>
            {/* Milestone dots */}
            {hub.streak.nextMilestone && (
              <div className="mt-3">
                <div className="flex items-center gap-1.5">
                  {[3, 7, 14, 30].map((d) => {
                    const hit = hub.streak.milestonesHit.includes(d);
                    const upcoming = hub.streak.current >= d;
                    return (
                      <div
                        key={d}
                        className="flex-1 h-1.5 rounded-full"
                        style={{
                          background: hit || upcoming
                            ? "#F59E0B"
                            : "rgba(255,255,255,0.08)",
                        }}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between text-[9px] text-white/30 mt-1 font-bold">
                  <span>D3</span><span>D7</span><span>D14</span><span>D30</span>
                </div>
              </div>
            )}
          </HeroCard>

          {/* Gifter Tree (compact) — use existing widget */}
          <GifterTree variant="compact" />

          {/* Sticker Album */}
          <Link
            href="/album"
            className="group relative block rounded-2xl overflow-hidden border border-white/10 p-4 md:p-5 transition-transform duration-200 ease-[cubic-bezier(0.34,1.8,0.64,1)] hover:-translate-y-1 hover:scale-[1.02] active:scale-[0.98] bg-[#12131A]"
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 bg-[#1A1B24]"
              >
                📖
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-amber-300/80 text-[9px] font-black uppercase tracking-[0.22em]">
                  Collection
                </p>
                <p className="text-white font-black text-lg leading-none mt-0.5">
                  Sticker Album
                </p>
                <p className="text-white/50 text-[11px] mt-0.5 tabular-nums">
                  {album ? `${album.totalCollected}/${album.totalStickers} collected` : "Loading…"}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/40 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>

            {/* Preview row: 4 latest collected stickers, then "+" */}
            {stickerPreview.length > 0 && (
              <div className="flex items-center gap-1.5">
                {stickerPreview.map((s, i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-base border border-white/10"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    {s.emoji}
                  </div>
                ))}
                <div className="h-8 flex items-center text-white/40 text-[10px] font-bold px-1.5">
                  {album && album.totalCollected > 4 ? `+${album.totalCollected - 4}` : ""}
                </div>
              </div>
            )}
            {album && album.totalCollected === 0 && (
              <p className="text-white/40 text-[11px] mt-1">
                Order to earn your first sticker ✨
              </p>
            )}
          </Link>
        </div>

        {/* ─── Seasonal banner ─── */}
        <SeasonalBanner />

        {/* ─── GAMES GRID ─── */}
        <div className="flex items-end justify-between mb-3">
          <h2 className="text-white/50 text-[10px] font-black uppercase tracking-[0.28em]">
            Play · 6 games
          </h2>
          <span className="text-white/30 text-[10px] font-bold tabular-nums">
            {allGames.filter(g => g.canPlay).length} available now
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 md:gap-3 mb-6 md:mb-8">
          {allGames.map((g, i) => {
            const meta = GAME_META[g.type];
            if (!meta) return null;
            const available = g.canPlay && (g.costGoins === 0 || hub.goinBalance >= g.costGoins);
            const locked = !g.canPlay;
            const insufficient = !locked && g.costGoins > 0 && hub.goinBalance < g.costGoins;
            return (
              <GameCard
                key={g.type}
                meta={meta}
                playsToday={g.playsToday}
                dailyLimit={g.dailyLimit}
                costGoins={g.costGoins}
                available={available}
                locked={locked}
                insufficient={insufficient}
                onClick={() => available && setActiveGame(g.type)}
                stagger={i}
              />
            );
          })}
        </div>

        {/* ─── YOUR REWARDS ─── */}
        {rewards.length > 0 && (
          <div className="rounded-2xl border border-white/10 p-4 md:p-5 mb-6 md:mb-7 bg-[#12131A]"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white text-base md:text-lg font-black flex items-center gap-2">
                <span className="text-xl">💎</span>
                Your Rewards
                <span className="text-xs font-black text-white/50 tabular-nums">
                  ({rewards.length})
                </span>
              </h2>
              <Link href="/b2c/cart" className="text-xs text-[#EF3752] hover:opacity-80 flex items-center gap-1 font-bold">
                Apply to cart <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {rewards.map((r) => {
                const isApplied = r.status === "applied";
                const expiresIn = r.expiresAt ? daysUntil(r.expiresAt) : null;
                return (
                  <div
                    key={r.id}
                    className="relative rounded-2xl p-3 border overflow-hidden transition-transform duration-200 hover:-translate-y-0.5 bg-[#12131A]"
                    style={{
                      borderColor: isApplied ? "rgba(239,55,82,0.35)" : "rgba(255,255,255,0.1)",
                    }}
                  >
                    {/* left accent bar for applied state */}
                    {isApplied && (
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#EF3752] rounded-l-2xl" />
                    )}
                    <div className="relative flex items-center gap-3">
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 bg-[#1A1B24]"
                      >
                        {rewardIcon(r.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-black text-sm truncate">{r.label}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-white/40">
                          {r.code && (
                            <button
                              onClick={() => copy(r.code)}
                              className="font-mono font-bold text-white/70 hover:text-white flex items-center gap-1 transition-colors"
                            >
                              {r.code}
                              {copiedCode === r.code ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5 opacity-60" />}
                            </button>
                          )}
                          {r.minCartInr > 0 && <span className="text-white/40">· min ₹{r.minCartInr}</span>}
                          {expiresIn !== null && expiresIn > 0 && (
                            <span className="flex items-center gap-0.5 text-white/40">
                              <Clock className="w-2.5 h-2.5" /> {expiresIn}d
                            </span>
                          )}
                        </div>
                      </div>
                      {isApplied ? (
                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full shrink-0 bg-[#EF3752] text-white">
                          Applied
                        </span>
                      ) : (
                        <span className="text-[9px] font-black uppercase tracking-wider text-white/50 px-2 py-1 rounded-full bg-white/5 shrink-0">
                          Wallet
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── LIVE WINNERS FEED (social proof) ─── */}
        <WinnersFeed />

        {/* ─── RECENT ACTIVITY ─── */}
        {hub.recentPlays.length > 0 && (
          <div>
            <h2 className="text-white/50 text-[10px] font-black uppercase tracking-[0.28em] mb-3">
              Recent Activity
            </h2>
            <div className="space-y-1.5">
              {hub.recentPlays.slice(0, 5).map((p, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 border border-white/5"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    animation: `hub-slide-in 0.3s cubic-bezier(0.22,1,0.36,1) both ${i * 0.06}s`,
                  }}
                >
                  <span className="text-lg">{GAME_META[p.gameType]?.emoji ?? "🎮"}</span>
                  <span className="text-white/70 flex-1 truncate text-xs font-semibold">
                    {p.rewardLabel ?? "No reward"}
                  </span>
                  <span className="text-white/30 text-[10px] tabular-nums">{timeAgo(p.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ══ Game modals ══════════════════════════════════════════════════ */}
      {activeGame === "scratch_card" && <ScratchCard onClose={closeGame} title="Daily Scratch Card" subtitle="One free card per day" sound={sound} />}
      {activeGame === "mystery_box"  && <MysteryBox  onClose={closeGame} />}
      {activeGame === "jackpot"      && <Jackpot     onClose={closeGame} goinBalance={hub.goinBalance} costGoins={hub.games.find(g => g.type === "jackpot")?.costGoins ?? 500} />}
      {activeGame === "spin_wheel"   && <SpinWheelModal open onClose={closeGame} />}
      {activeGame === "secret_bid"   && <SecretBid onClose={closeGame} goinBalance={hub.goinBalance} />}
      {activeGame === "flash_jackpot"&& <FlashJackpot onClose={closeGame} />}
      {/* Deploy 118 + 119 — new Gift Casino games */}
      {activeGame === "daily_quest"   && <DailyQuest   onClose={closeGame} />}
      {activeGame === "streak_ladder" && <StreakLadder onClose={closeGame} />}
      {activeGame === "treasure_hunt" && <TreasureHunt onClose={closeGame} />}
      {activeGame === "goin_wager"    && <GoinWager    onClose={closeGame} />}
      {/* Deploy 120 — Product Drop */}
      {activeGame === "product_drop"  && <ProductDrop  onClose={closeGame} />}

      {/* ══ Global keyframes ═════════════════════════════════════════════ */}
      <style>{`
        @keyframes hub-drift {
          0%   { transform: translateY(0) rotate(0deg);    opacity: 0; }
          10%  { opacity: 0.25; }
          90%  { opacity: 0.25; }
          100% { transform: translateY(-110vh) rotate(180deg); opacity: 0; }
        }
        @keyframes hub-flame {
          0%   { transform: scale(1) rotate(-3deg); }
          100% { transform: scale(1.08) rotate(3deg); }
        }
        @keyframes hub-slide-in {
          from { opacity: 0; transform: translateX(-10px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

// ─── HeroCard wrapper ─────────────────────────────────────────────────────
function HeroCard({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-white/10 p-4 md:p-5 bg-[#12131A]"
      style={{ borderTop: `2px solid ${accent}` }}
    >
      {children}
    </div>
  );
}

// ─── Game Card ────────────────────────────────────────────────────────────
function GameCard({
  meta, playsToday, dailyLimit, costGoins, available, locked, insufficient,
  onClick, stagger,
}: {
  meta: typeof GAME_META[string];
  playsToday: number; dailyLimit: number; costGoins: number;
  available: boolean; locked: boolean; insufficient: boolean;
  onClick: () => void; stagger: number;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!available}
      className="group relative aspect-[3/4] rounded-2xl overflow-hidden transition-transform duration-200 ease-[cubic-bezier(0.34,1.8,0.64,1)] hover:-translate-y-1.5 hover:scale-[1.03] active:scale-[0.97] disabled:cursor-not-allowed will-change-transform bg-[#12131A] border border-white/10"
      style={{
        borderTop: `2px solid ${meta.accent}`,
        opacity: available ? 1 : 0.5,
        animation: `hub-card-in 0.35s cubic-bezier(0.22,1,0.36,1) both ${stagger * 0.04}s`,
      }}
    >
      {/* Content */}
      <div className="relative h-full flex flex-col p-3 md:p-3.5">
        {/* Top row: daily badge + cost */}
        <div className="flex items-center justify-between">
          <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.16em] px-1.5 py-0.5 rounded bg-white/10 text-white/60">
            {playsToday}/{dailyLimit}
          </span>
          {costGoins > 0 && (
            <span className="text-[9px] md:text-[10px] font-black text-[#F59E0B] flex items-center gap-0.5 bg-black/30 px-1.5 py-0.5 rounded-full">
              🪙 {costGoins}
            </span>
          )}
          {costGoins === 0 && (
            <span className="text-[8px] md:text-[9px] font-black text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full border border-emerald-400/20">
              FREE
            </span>
          )}
        </div>

        {/* Emoji */}
        <div className="flex-1 flex items-center justify-center">
          <div
            className="relative text-5xl md:text-6xl"
            style={{
              animation: available ? `card-emoji-${stagger % 4} 2.5s ease-in-out infinite` : undefined,
            }}
          >
            {meta.emoji}
          </div>
        </div>

        {/* Prize tease band */}
        <div className="text-center mb-2">
          <p className="font-black text-[13px] md:text-sm leading-tight text-white">{meta.title}</p>
          <p className="text-white/50 text-[9px] md:text-[10px] font-bold uppercase tracking-wider mt-0.5 line-clamp-1">
            {meta.prizeTease}
          </p>
        </div>

        {/* CTA pill */}
        <div
          className="w-full py-1.5 rounded-xl text-center text-[10px] md:text-[11px] font-black uppercase tracking-[0.15em] transition-all group-hover:scale-105 text-white"
          style={{
            background: available ? "#EF3752" : "rgba(255,255,255,0.08)",
            color: available ? "#fff" : "rgba(255,255,255,0.4)",
          }}
        >
          {locked
            ? "Come back tomorrow"
            : insufficient
            ? "Low balance"
            : meta.cta}
        </div>
      </div>

      <style>{`
        @keyframes hub-card-in {
          from { opacity: 0; transform: translateY(12px) scale(0.94); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes card-emoji-0 {
          0%,100% { transform: rotate(-5deg) scale(1); }
          50%     { transform: rotate(5deg)  scale(1.08); }
        }
        @keyframes card-emoji-1 {
          0%,100% { transform: translateY(0) scale(1); }
          50%     { transform: translateY(-4px) scale(1.06); }
        }
        @keyframes card-emoji-2 {
          0%,100% { transform: rotate(0deg) scale(1); }
          25%     { transform: rotate(-8deg) scale(1.05); }
          75%     { transform: rotate(8deg) scale(1.05); }
        }
        @keyframes card-emoji-3 {
          0%,100% { transform: scale(1); }
          50%     { transform: scale(1.12); }
        }
      `}</style>
    </button>
  );
}

// ─── Seasonal banner (unchanged from before) ─────────────────────────────
function SeasonalBanner() {
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const seasons: { match: (m: number, d: number) => boolean; label: string; emoji: string; accent: string; perk: string }[] = [
    { match: (m, d) => (m === 10 && d >= 10) || (m === 11 && d <= 5), label: "Diwali Dhamaka",        emoji: "🪔", accent: "#F59E0B", perk: "2× Jackpot rewards this week" },
    { match: (m, d) => m === 2 && d <= 14,                            label: "Valentine's Mega",      emoji: "❤️", accent: "#EF3752", perk: "Free gift-wrap rewards boosted" },
    { match: (m, d) => m === 8 && d <= 14,                            label: "Raksha Bandhan Bash",   emoji: "🪢", accent: "#EF3752", perk: "Rakhi special scratch prizes" },
    { match: (m, d) => m === 12 && d >= 15,                           label: "Christmas Countdown",   emoji: "🎄", accent: "#059669", perk: "Surprise Christmas jackpot" },
    { match: (m, d) => m === 5 && d <= 14,                            label: "Mother's Day Specials", emoji: "💐", accent: "#EF3752", perk: "Personalised gift rewards boosted" },
    { match: (m, d) => m === 6 && d <= 20,                            label: "Father's Day Specials", emoji: "👔", accent: "#6366F1", perk: "Premium jackpot prizes" },
  ];
  const active = seasons.find(s => s.match(m, d));
  if (!active) return null;
  return (
    <div
      className="rounded-2xl p-3 md:p-4 mb-5 md:mb-6 border border-white/10 flex items-center gap-3 bg-[#12131A]"
      style={{ borderLeft: `3px solid ${active.accent}` }}
    >
      <span className="text-2xl md:text-3xl shrink-0">{active.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Limited-time</p>
        <p className="text-white font-black text-sm md:text-base leading-tight">{active.label}</p>
        <p className="text-white/70 text-[11px] md:text-xs">{active.perk}</p>
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────
function rewardIcon(type: string): string {
  switch (type) {
    case "goins":          return "🪙";
    case "discount_pct":   return "🎯";
    case "discount_flat":  return "💸";
    case "free_shipping":  return "🚚";
    case "free_gift_wrap": return "🎀";
    case "free_product":   return "🎁";
    default:               return "✨";
  }
}
function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
