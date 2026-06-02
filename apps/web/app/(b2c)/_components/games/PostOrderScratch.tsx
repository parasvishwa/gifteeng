"use client";

/**
 * PostOrderScratch — a beautiful prompt shown on the order success page
 * that invites the user to scratch a reward card unlocked by their order.
 * Order value determines how many cards are granted (1–3).
 *
 * Auto-opens the scratch card modal after 1.5 s (full-screen overlay).
 */

import { useEffect, useState } from "react";
import ScratchCard from "./ScratchCard";

type Props = { orderId: string; orderValueInr: number };

export default function PostOrderScratch({ orderId, orderValueInr }: Props) {
  const cardsGranted = Math.min(3, Math.max(1, Math.floor(orderValueInr / 500)));
  const [cardsRemaining, setCardsRemaining] = useState(cardsGranted);
  const [open, setOpen] = useState(false);
  const [played, setPlayed] = useState(0);

  // Auto-open after 1.5 s on first mount if cards are available
  useEffect(() => {
    if (cardsGranted <= 0) return;
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
    // Only run once on mount — cardsGranted is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    setOpen(false);
    setCardsRemaining((n) => Math.max(0, n - 1));
    setPlayed((p) => p + 1);
  };

  return (
    <div className="mt-6">
      {/* Compact waiting chip — always visible on the page */}
      {cardsRemaining > 0 ? (
        <button
          onClick={() => setOpen(true)}
          className="mx-auto flex items-center gap-2 rounded-full bg-[#12131A] border border-white/10 px-4 py-2 text-xs font-bold text-amber-300 shadow-lg hover:bg-white/5 active:scale-95 transition-all"
        >
          <span className="text-base">🎫</span>
          {cardsRemaining} scratch card{cardsRemaining > 1 ? "s" : ""} waiting
          <span className="ml-1 h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        </button>
      ) : (
        <a
          href="/cart"
          className="mx-auto flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-black text-white shadow hover:bg-emerald-700 active:scale-95 transition-all"
        >
          Use rewards now →
        </a>
      )}

      {/* Full-screen overlay modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-end md:justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative w-full md:max-w-sm rounded-t-3xl md:rounded-3xl bg-[#12131A] pt-8 px-6 pb-10 animate-slide-up">

            {/* CSS sparkle decorations */}
            <span className="pointer-events-none absolute -top-3 left-6 text-2xl select-none">✦</span>
            <span className="pointer-events-none absolute -top-1 right-10 text-lg select-none opacity-70">✦</span>
            <span className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 text-sm select-none opacity-40">✦</span>

            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              aria-label="Close"
            >
              ✕
            </button>

            {/* Heading */}
            <h2 className="text-[28px] font-black text-white text-center leading-tight mb-1">
              Congratulations 🎉
            </h2>
            <p className="text-center text-[14px] text-white/50 mb-6">
              You have won a scratch card
            </p>

            {/* ScratchCard component — centered */}
            <div className="flex justify-center">
              <ScratchCard
                onClose={handleClose}
                title="Order Reward"
                subtitle={`Card ${played + 1} of ${cardsGranted}`}
                triggerRef={orderId}
              />
            </div>

            {/* Progress dots when multiple cards */}
            {cardsGranted > 1 && (
              <div className="mt-5 flex justify-center gap-2">
                {Array.from({ length: cardsGranted }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i === played
                        ? "bg-white w-4"
                        : i < played
                        ? "bg-white/30 w-1.5"
                        : "bg-white/20 w-1.5"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
