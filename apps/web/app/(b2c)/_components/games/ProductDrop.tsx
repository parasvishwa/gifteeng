"use client";

/**
 * ProductDrop — Deploy 120.
 *
 * Shows the currently-live drop campaigns. Customer picks one, taps
 * "Try my luck", and the server rolls against `winOddsPct`. On a win,
 * a voucher is issued and they can claim it — server places an order at
 * the shipping-only price after they supply their address.
 *
 * Flow:
 *   GET  /api/games/product-drops               → public list
 *   GET  /api/games/product-drops/:id/state     → per-user state (incl. alreadyWon)
 *   POST /api/games/product-drop  { dropId }    → play
 *   POST /api/games/product-drops/claim/:code { shippingAddress } → place order
 */

import { useEffect, useState } from "react";
import { X, Gift, Sparkles, Loader2, Truck, Clock, Trophy } from "lucide-react";
import ConfettiBurst from "../chrome/ConfettiBurst";
import { cartFetch } from "@/lib/api";

type GameMode = "drop" | "guess_price" | "daily_deal" | "product_wheel";

type WheelSlice = { productId: string; shippingInr: number; weight: number; label?: string };

type Drop = {
  id: string;
  productId: string;
  product: { id: string; slug: string; title: string; basePrice: number | string; images?: any };
  gameMode: GameMode;
  modeConfig?: { tolerancePct?: number; slices?: WheelSlice[] } | null;
  shippingInr: number;
  winOddsPct: number;
  dailyLimit: number;
  winnersCount: number;
  maxWinners: number | null;
  claimWindowHours: number;
  title: string;
  subtitle: string | null;
  bannerImage: string | null;
  endsAt: string | null;
};

const MODE_BADGE: Record<GameMode, { emoji: string; label: string; color: string }> = {
  drop:          { emoji: "🎁", label: "Lottery",      color: "bg-fuchsia-500/10 text-fuchsia-600" },
  guess_price:   { emoji: "💲", label: "Guess price",  color: "bg-amber-500/10 text-amber-600" },
  daily_deal:    { emoji: "💥", label: "Daily deal",   color: "bg-orange-500/10 text-orange-600" },
  product_wheel: { emoji: "🎡", label: "Product wheel", color: "bg-violet-500/10 text-violet-600" },
};

type PlayResult = {
  won: boolean;
  message: string;
  product?: { id: string; title: string };
  voucher?: { code: string; shippingInr: number; expiresAt: string | null };
  hint?: string;       // guess_price
  sliceIdx?: number;   // product_wheel
};

type Address = {
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
};

function firstImage(product: Drop["product"], fallback: string | null): string | null {
  if (Array.isArray(product.images) && product.images.length > 0) {
    const a = product.images[0];
    return typeof a === "string" ? a : a?.url ?? null;
  }
  return fallback;
}

export default function ProductDrop({ onClose }: { onClose: () => void }) {
  const [drops, setDrops] = useState<Drop[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Drop | null>(null);

  useEffect(() => {
    cartFetch<Drop[]>("/games/product-drops")
      .then((d) => setDrops(Array.isArray(d) ? d : []))
      .catch(() => setDrops([]))
      .finally(() => setLoading(false));
  }, []);

  if (selected) {
    return <DropRoller drop={selected} onClose={onClose} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-[#12131A] border border-white/10 shadow-lg p-6">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-[#1A1B24] hover:bg-[#22232e] border border-white/10 flex items-center justify-center text-white/40 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
          <div className="text-center mb-4">
            <div className="text-5xl mb-2">🎁</div>
            <h2 className="text-xl font-black">Product Drops</h2>
            <p className="text-xs text-white/40 mt-1">
              Win the product. Pay only shipping.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-white/40" /></div>
          ) : drops.length === 0 ? (
            <div className="py-10 text-center">
              <Gift className="w-10 h-10 mx-auto text-white/40/40 mb-2" />
              <p className="text-sm font-semibold">No drops right now</p>
              <p className="text-[11px] text-white/40 mt-1">Check back soon — new products every week.</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {drops.map((d) => {
                const img = firstImage(d.product, d.bannerImage);
                const saves = Number(d.product.basePrice) - d.shippingInr;
                return (
                  <li key={d.id}>
                    <button
                      onClick={() => setSelected(d)}
                      className="group w-full flex items-center gap-3 rounded-2xl border border-white/10/50 bg-[#12131A] hover:border-pink-500/50 hover:shadow-md p-3 transition-all text-left"
                    >
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center shrink-0">
                          <Gift className="w-6 h-6 text-white/40/40" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <div className="text-sm font-bold truncate">{d.title}</div>
                          <span className={`rounded-full text-[9px] font-bold px-1.5 py-0.5 shrink-0 ${MODE_BADGE[d.gameMode]?.color ?? ""}`}>
                            {MODE_BADGE[d.gameMode]?.emoji} {MODE_BADGE[d.gameMode]?.label}
                          </span>
                        </div>
                        {d.subtitle && <div className="text-[11px] text-white/40 truncate">{d.subtitle}</div>}
                        <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                          <span className="rounded-full bg-pink-500/10 text-pink-600 px-1.5 py-0.5 font-bold">
                            Pay ₹{d.shippingInr}
                          </span>
                          {saves > 0 && (
                            <span className="rounded-full bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 font-bold">
                              Save ₹{saves.toFixed(0)}
                            </span>
                          )}
                          <span className="rounded-full bg-amber-500/10 text-amber-600 px-1.5 py-0.5 font-bold">
                            {d.winnersCount}{d.maxWinners ? `/${d.maxWinners}` : ""} won
                          </span>
                        </div>
                      </div>
                      <span className="text-pink-500 group-hover:translate-x-0.5 transition-transform text-xl">→</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
      </div>
    </div>
  );
}

function DropRoller({ drop, onClose, onBack }: { drop: Drop; onClose: () => void; onBack: () => void }) {
  const [state, setState] = useState<{ canPlay: boolean; alreadyWon: boolean; existingVoucherCode: string | null } | null>(null);
  const [result, setResult] = useState<PlayResult | null>(null);
  const [rolling, setRolling] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);

  useEffect(() => {
    cartFetch<any>(`/games/product-drops/${drop.id}/state`, { authed: true })
      .then((s) => setState(s))
      .catch(() => setState(null));
  }, [drop.id]);

  const [guessInr, setGuessInr] = useState<number>(() => Math.round(Number(drop.product.basePrice) || 0));

  const playEndpoint = (() => {
    switch (drop.gameMode) {
      case "guess_price":   return { url: "/games/guess-price",   body: () => ({ dropId: drop.id, guessInr }) };
      case "daily_deal":    return { url: "/games/daily-deal",    body: () => ({ dropId: drop.id }) };
      case "product_wheel": return { url: "/games/product-wheel", body: () => ({ dropId: drop.id }) };
      default:              return { url: "/games/product-drop",  body: () => ({ dropId: drop.id }) };
    }
  })();

  const play = async () => {
    setErr(null);
    setRolling(true);
    try {
      // Small suspense delay so the user sees the spinner before the result.
      const [res] = await Promise.all([
        cartFetch<PlayResult>(playEndpoint.url, {
          method: "POST", authed: true, body: JSON.stringify(playEndpoint.body()),
        }),
        new Promise((r) => setTimeout(r, drop.gameMode === "product_wheel" ? 2200 : 1200)),
      ]);
      setResult(res);
      if (res.won) setConfetti(true);
    } catch (e: any) {
      setErr(e?.message ?? "Couldn't run the game right now.");
    } finally {
      setRolling(false);
    }
  };

  // If state says already won, jump straight to the claim view.
  const alreadyWonVoucher = state?.alreadyWon && state.existingVoucherCode ? state.existingVoucherCode : null;

  const img = firstImage(drop.product, drop.bannerImage);

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <ConfettiBurst active={confetti} onDone={() => setConfetti(false)} />
      <div className="relative w-full max-w-md rounded-2xl bg-[#12131A] border border-white/10 shadow-lg p-6">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-[#1A1B24] hover:bg-[#22232e] border border-white/10 flex items-center justify-center text-white/40 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
          <button onClick={onBack} className="text-[11px] text-white/40 hover:text-white mb-2">← All drops</button>
          <div className="text-center mb-4">
            {img && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt="" className="w-32 h-32 rounded-2xl mx-auto object-cover shadow-lg" />
            )}
            <h2 className="mt-3 text-lg font-black">{drop.title}</h2>
            <p className="text-[11px] text-white/40 mt-0.5">{drop.product.title}</p>
            <div className="mt-2 flex items-center justify-center gap-1.5 text-xs">
              <Truck className="w-3.5 h-3.5 text-pink-500" />
              <span className="font-bold">Pay only ₹{drop.shippingInr}</span>
              <span className="text-white/40 line-through">₹{Number(drop.product.basePrice).toFixed(0)}</span>
            </div>
          </div>

          {result && result.won && result.voucher ? (
            <ClaimCard
              code={result.voucher.code}
              productTitle={drop.product.title}
              shippingInr={drop.shippingInr}
              expiresAt={result.voucher.expiresAt}
              onClose={onClose}
            />
          ) : result && !result.won ? (
            <div className="text-center py-4">
              <div className="text-6xl mb-2">💨</div>
              <div className="text-lg font-black">{result.message}</div>
              <p className="text-[11px] text-white/40 mt-2">
                Come back tomorrow — new roll awaits!
              </p>
              <button onClick={onClose} className="mt-4 rounded-full bg-muted hover:bg-white/5 text-white font-semibold px-6 py-2 text-sm">
                Done
              </button>
            </div>
          ) : alreadyWonVoucher ? (
            <ClaimCard
              code={alreadyWonVoucher}
              productTitle={drop.product.title}
              shippingInr={drop.shippingInr}
              expiresAt={null}
              onClose={onClose}
            />
          ) : (
            <>
              {/* ── Mode-specific info + controls ─────────────────── */}
              {drop.gameMode === "guess_price" && (
                <div className="mb-3 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold mb-1.5">
                    💲 Guess the MRP within ±{drop.modeConfig?.tolerancePct ?? 10}%
                  </p>
                  <label className="text-[10px] text-white/40">Your guess (₹)</label>
                  <input
                    type="number"
                    min={1}
                    value={guessInr}
                    onChange={(e) => setGuessInr(parseInt(e.target.value, 10) || 0)}
                    className="mt-1 w-full rounded-lg border border-amber-500/40 bg-[#1A1B24] px-3 py-2 text-lg font-bold"
                    autoFocus
                  />
                </div>
              )}

              {drop.gameMode === "daily_deal" && (
                <div className="mb-3 rounded-xl bg-orange-500/10 border border-orange-500/30 p-3">
                  <p className="text-[11px] text-orange-700 dark:text-orange-300 font-semibold">
                    💥 Today's deal — guaranteed win.
                  </p>
                  <p className="text-[10px] text-white/40 mt-1">
                    Tap to unlock. Pay ₹{drop.shippingInr} shipping at delivery.
                  </p>
                </div>
              )}

              {drop.gameMode === "product_wheel" && (
                <div className="mb-3 rounded-xl bg-violet-500/10 border border-violet-500/30 p-3 text-center">
                  <p className="text-[11px] text-violet-700 dark:text-violet-300 font-semibold">
                    🎡 Spin the wheel — {drop.modeConfig?.slices?.length ?? 0} possible prizes
                  </p>
                  <p className="text-[10px] text-white/40 mt-1">
                    The wheel picks a product. Win any and you pay only its shipping.
                  </p>
                </div>
              )}

              {/* Always-visible info bar */}
              <div className="mb-4 rounded-xl bg-muted/30 p-3 text-[11px] space-y-0.5">
                {drop.gameMode === "drop" && (
                  <div className="flex justify-between"><span>Win odds</span><span className="font-bold">{drop.winOddsPct}%</span></div>
                )}
                <div className="flex justify-between"><span>You have</span><span className="font-bold">{drop.dailyLimit} try today</span></div>
                <div className="flex justify-between"><span>Claim window if you win</span><span className="font-bold">{drop.claimWindowHours} hrs</span></div>
              </div>

              <button
                onClick={play}
                disabled={
                  rolling ||
                  state?.canPlay === false ||
                  (drop.gameMode === "guess_price" && guessInr <= 0)
                }
                className="w-full rounded-xl bg-brand hover:bg-brand-dark text-white font-black py-3 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {rolling
                  ? <><Loader2 className="w-4 h-4 animate-spin" />{
                      drop.gameMode === "product_wheel" ? " Spinning…" :
                      drop.gameMode === "guess_price"   ? " Checking…" :
                      drop.gameMode === "daily_deal"    ? " Unlocking…" :
                                                          " Rolling…"
                    }</>
                  : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      {drop.gameMode === "product_wheel" ? "Spin the wheel" :
                       drop.gameMode === "guess_price"   ? "Lock in guess"  :
                       drop.gameMode === "daily_deal"    ? "Unlock today's deal" :
                                                           "Try my luck"}
                    </>
                  )}
              </button>
              {state?.canPlay === false && !state?.alreadyWon && (
                <p className="mt-2 text-[11px] text-center text-white/40">
                  <Clock className="w-3 h-3 inline" /> You've played today. Come back tomorrow.
                </p>
              )}
              {err && <p className="mt-2 text-[11px] text-center text-rose-500">{err}</p>}
            </>
          )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Claim flow — voucher → address form → place order
// ─────────────────────────────────────────────────────────────────────────

function ClaimCard({
  code, productTitle, shippingInr, expiresAt, onClose,
}: {
  code: string;
  productTitle: string;
  shippingInr: number;
  expiresAt: string | null;
  onClose: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [addr, setAddr] = useState<Address>({
    name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "", country: "IN",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  const claim = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await cartFetch<{ orderNumber: string }>(
        `/games/product-drops/claim/${code}`,
        { method: "POST", authed: true, body: JSON.stringify({ shippingAddress: addr }) },
      );
      setOrderNumber(res.orderNumber);
    } catch (e: any) {
      setErr(e?.message ?? "Couldn't place the order");
    } finally {
      setBusy(false);
    }
  };

  if (orderNumber) {
    return (
      <div className="text-center py-4">
        <div className="text-6xl mb-2 animate-bounce">🎉</div>
        <div className="text-lg font-black">Order placed!</div>
        <div className="mt-1 text-sm">
          Order <span className="font-mono font-bold">{orderNumber}</span>
        </div>
        <p className="text-[11px] text-white/40 mt-2">
          You'll pay ₹{shippingInr} on delivery (Cash-on-Delivery).
        </p>
        <button
          onClick={onClose}
          className="mt-4 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold px-6 py-2 text-sm transition-colors"
        >
          Done
        </button>
      </div>
    );
  }

  if (!showForm) {
    return (
      <div className="text-center py-2">
        <div className="text-5xl mb-2"><Trophy className="w-12 h-12 text-amber-500 inline" /></div>
        <div className="text-lg font-black text-pink-600">You won {productTitle}!</div>
        <div className="mt-1 text-[11px] text-white/40">
          Voucher <span className="font-mono font-bold text-white">{code}</span>
          {expiresAt && ` · expires ${new Date(expiresAt).toLocaleString("en-IN")}`}
        </div>
        <div className="mt-4 rounded-xl bg-muted/30 p-3 text-sm">
          You'll pay just <span className="font-bold text-pink-600">₹{shippingInr}</span> at delivery.
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="mt-4 w-full rounded-xl bg-brand hover:bg-brand-dark text-white font-black py-3 transition-colors"
        >
          Claim now — ₹{shippingInr} COD
        </button>
        <button
          onClick={onClose}
          className="mt-2 text-[11px] text-white/40 hover:text-white"
        >
          Claim later from My Rewards
        </button>
      </div>
    );
  }

  const canSubmit = addr.name.trim() && addr.phone.trim().length >= 7
    && addr.line1.trim() && addr.city.trim() && addr.state.trim() && addr.pincode.trim().length >= 4;

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-white/40 mb-1">Deliver to:</div>
      <input className="w-full rounded-lg border bg-[#1A1B24] px-3 py-2 text-sm" placeholder="Full name"
             value={addr.name} onChange={(e) => setAddr({ ...addr, name: e.target.value })} />
      <input className="w-full rounded-lg border bg-[#1A1B24] px-3 py-2 text-sm" placeholder="Phone"
             value={addr.phone} onChange={(e) => setAddr({ ...addr, phone: e.target.value })} />
      <input className="w-full rounded-lg border bg-[#1A1B24] px-3 py-2 text-sm" placeholder="Address line 1"
             value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} />
      <input className="w-full rounded-lg border bg-[#1A1B24] px-3 py-2 text-sm" placeholder="Address line 2 (optional)"
             value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <input className="rounded-lg border bg-[#1A1B24] px-3 py-2 text-sm" placeholder="City"
               value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
        <input className="rounded-lg border bg-[#1A1B24] px-3 py-2 text-sm" placeholder="State"
               value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })} />
      </div>
      <input className="w-full rounded-lg border bg-[#1A1B24] px-3 py-2 text-sm" placeholder="Pincode"
             value={addr.pincode} onChange={(e) => setAddr({ ...addr, pincode: e.target.value })} />
      {err && <div className="text-xs text-rose-500">{err}</div>}
      <button
        onClick={claim}
        disabled={!canSubmit || busy}
        className="w-full rounded-xl bg-brand hover:bg-brand-dark text-white font-black py-3 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Placing order…</>
          : <>Place order — pay ₹{shippingInr} COD</>}
      </button>
    </div>
  );
}
