"use client";

// ─── Gifteeng App — Faster. Easier. Better. ──────────────────────────────────
// Matches the reference image:
//   Left: "Gifteeng App" heading + feature list + download buttons
//   Right: Phone mockup placeholder
// Features: Track Orders · Exclusive App Offers · Play & Earn Coins · Faster Experience
// ─────────────────────────────────────────────────────────────────────────────

const FEATURES = [
  { emoji: "🔄", text: "Track Orders in Real Time" },
  { emoji: "🏷️", text: "Exclusive App Offers" },
  { emoji: "🪙", text: "Play & Earn Coins" },
  { emoji: "⚡", text: "Faster & Seamless Experience" },
] as const;

export default function AppDownloadSection() {
  return (
    <section className="py-6 mb-2">
      <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center gap-0">

          {/* Left: text + features + buttons */}
          <div className="flex-1 p-6 md:p-8">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary/70 mb-1">
              Coming Soon
            </p>
            <h2 className="font-display text-xl md:text-2xl font-black text-foreground leading-tight mb-0.5">
              Gifteeng App
            </h2>
            <p className="text-sm text-muted-foreground mb-5">Faster. Easier. Better.</p>

            {/* Feature list */}
            <ul className="space-y-3 mb-6">
              {FEATURES.map((f) => (
                <li key={f.text} className="flex items-center gap-3">
                  <span className="text-lg leading-none shrink-0">{f.emoji}</span>
                  <span className="text-sm text-foreground/80 font-medium">{f.text}</span>
                </li>
              ))}
            </ul>

            {/* Store buttons */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              {/* Google Play */}
              <div className="flex items-center gap-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-800 border border-zinc-700 px-4 py-2.5 cursor-pointer hover:bg-zinc-800 dark:hover:bg-zinc-700 transition-colors w-fit">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#a4c639] shrink-0" fill="currentColor" aria-hidden>
                  <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.43 11.43 0 0 0-8.94 0L5.65 5.67a.64.64 0 0 0-.87-.2c-.29.17-.38.54-.22.83L6.4 9.48A10.81 10.81 0 0 0 1 18h22a10.81 10.81 0 0 0-5.4-8.52M7 15.25A1.25 1.25 0 1 1 8.25 14 1.25 1.25 0 0 1 7 15.25m10 0A1.25 1.25 0 1 1 18.25 14 1.25 1.25 0 0 1 17 15.25" />
                </svg>
                <div>
                  <p className="text-[8px] text-zinc-400 leading-none">GET IT ON</p>
                  <p className="text-xs font-bold text-white leading-tight">Google Play</p>
                </div>
              </div>
              {/* App Store */}
              <div className="flex items-center gap-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-800 border border-zinc-700 px-4 py-2.5 cursor-pointer hover:bg-zinc-800 dark:hover:bg-zinc-700 transition-colors w-fit">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-white shrink-0" fill="currentColor" aria-hidden>
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25" />
                </svg>
                <div>
                  <p className="text-[8px] text-zinc-400 leading-none">Download on the</p>
                  <p className="text-xs font-bold text-white leading-tight">App Store</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: phone mockup placeholder */}
          <div className="sm:w-48 md:w-56 shrink-0 self-stretch flex items-center justify-center bg-gradient-to-b from-primary/5 to-primary/10 p-6 min-h-[180px]">
            <div className="flex flex-col items-center gap-2 opacity-60">
              <div className="w-20 h-36 rounded-2xl border-4 border-foreground/20 bg-foreground/10 flex items-center justify-center">
                <span className="text-3xl">📱</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
