/**
 * Coin earn effects — shared client-side utilities.
 *
 * Any screen that awards Gifteeng Goins (spin wheel, pick-me card, order
 * completion, referrals) calls `flyCoinsToNavbar` right after the server
 * confirms the earning. It plays a quick flight animation from the source
 * element to the navbar coin chip and then dispatches a `gifteeng:coins-earned`
 * event so the navbar (and anywhere else showing the balance) can refresh.
 *
 * The animation is purely visual — the canonical balance always comes from
 * `/api/coins/balance`. On errors we still dispatch the event so at minimum
 * the balance re-fetches.
 */

export const COINS_EARNED_EVENT = "gifteeng:coins-earned";

export interface CoinsEarnedDetail {
  /** Coins earned on this event (positive integer). */
  amount: number;
  /** Whether these coins are immediately redeemable. */
  redeemable: boolean;
  /** Optional source tag for analytics ("spin" | "pickme" | "order" | ...). */
  source?: string;
}

/**
 * Fire-and-forget: plays the flight animation from `sourceEl` to the navbar
 * coin chip, then dispatches the earned event so subscribers can refresh.
 * Safe to call on the server — becomes a no-op.
 */
export function flyCoinsToNavbar(
  sourceEl: Element | null | undefined,
  detail: CoinsEarnedDetail,
): void {
  if (typeof window === "undefined") return;

  // Find the navbar chip by stable id.
  const target =
    document.querySelector<HTMLElement>("[data-nav-coin-chip]") ??
    document.querySelector<HTMLElement>("#nav-coin-chip");

  // If no source element or no target, just dispatch the refresh event.
  if (!target || !sourceEl || !(sourceEl instanceof Element)) {
    dispatchEarnedEvent(detail);
    return;
  }

  const source = sourceEl.getBoundingClientRect();
  const dest = target.getBoundingClientRect();

  // Launch N coin particles depending on amount (cap at 12 for perf).
  const particles = Math.min(12, Math.max(3, Math.round(detail.amount / 2)));
  for (let i = 0; i < particles; i++) {
    spawnCoinParticle(source, dest, i * 55);
  }

  // Pulse the chip on arrival and refresh the balance.
  const arrivalMs = 900 + particles * 55;
  window.setTimeout(() => {
    target.classList.add("coin-chip-pulse");
    window.setTimeout(() => target.classList.remove("coin-chip-pulse"), 650);
    dispatchEarnedEvent(detail);
  }, arrivalMs);
}

function dispatchEarnedEvent(detail: CoinsEarnedDetail): void {
  window.dispatchEvent(
    new CustomEvent<CoinsEarnedDetail>(COINS_EARNED_EVENT, { detail }),
  );
}

function spawnCoinParticle(
  source: DOMRect,
  dest: DOMRect,
  delayMs: number,
): void {
  const startX = source.left + source.width / 2 + (Math.random() - 0.5) * 40;
  const startY = source.top + source.height / 2 + (Math.random() - 0.5) * 20;
  const endX = dest.left + dest.width / 2;
  const endY = dest.top + dest.height / 2;

  const el = document.createElement("div");
  el.textContent = "🪙";
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = `
    position: fixed;
    left: ${startX}px;
    top: ${startY}px;
    width: 24px;
    height: 24px;
    font-size: 20px;
    line-height: 24px;
    text-align: center;
    pointer-events: none;
    z-index: 99999;
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.4) rotate(0deg);
    filter: drop-shadow(0 4px 8px rgba(245, 158, 11, 0.45));
    transition: transform 900ms cubic-bezier(0.34, 1.56, 0.64, 1), left 900ms cubic-bezier(0.5, 0, 0.75, 0), top 900ms cubic-bezier(0.35, 0, 0.8, 0.45), opacity 400ms ease;
    will-change: transform, left, top, opacity;
  `;
  document.body.appendChild(el);

  // Animate next frame with delay.
  window.setTimeout(() => {
    el.style.opacity = "1";
    el.style.left = `${endX}px`;
    el.style.top = `${endY}px`;
    el.style.transform = "translate(-50%, -50%) scale(1) rotate(720deg)";
  }, 20 + delayMs);

  // Fade + cleanup.
  window.setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translate(-50%, -50%) scale(0.2) rotate(900deg)";
  }, 920 + delayMs);
  window.setTimeout(() => el.remove(), 1400 + delayMs);
}

/** Subscribe to the earned event. Returns an unsubscribe function. */
export function onCoinsEarned(
  handler: (detail: CoinsEarnedDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const wrapped = (e: Event) => {
    const custom = e as CustomEvent<CoinsEarnedDetail>;
    if (custom.detail) handler(custom.detail);
  };
  window.addEventListener(COINS_EARNED_EVENT, wrapped);
  return () => window.removeEventListener(COINS_EARNED_EVENT, wrapped);
}
