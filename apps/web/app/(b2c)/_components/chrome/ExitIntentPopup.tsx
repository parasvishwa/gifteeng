"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Gift, Copy, Check } from "lucide-react";

interface ExitPopupConfig {
  enabled: boolean;
  title: string;
  subtitle: string;
  discount_code: string;
  discount_text: string;
  button_text: string;
  dismiss_text: string;
}

const FALLBACK: ExitPopupConfig = {
  enabled: false, // safe default — don't show until we confirm it's ON
  title: "Wait! Don't leave yet 🎁",
  subtitle: "Here's a special discount just for you",
  discount_code: "STAY10",
  discount_text: "10% OFF your first order",
  button_text: "Continue Shopping",
  dismiss_text: "No thanks, I'll pay full price",
};

export default function ExitIntentPopup() {
  const [show, setShow]         = useState(false);
  const [config, setConfig]     = useState<ExitPopupConfig>(FALLBACK);
  const [ready, setReady]       = useState(false);
  const [copied, setCopied]     = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // ── Fetch the setting from the admin API ────────────────────────────────────
  useEffect(() => {
    // Use the public settings endpoint — /api/admin/settings requires B2B
    // auth and returns 401 for anonymous B2C visitors.
    fetch("/api/settings/public")
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, unknown> | null) => {
        if (!data) { setReady(true); return; }
        const raw = data["exit_intent_popup"];
        if (!raw) { setReady(true); return; }
        try {
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (parsed && typeof parsed === "object") {
            setConfig({
              enabled:       !!parsed.enabled,
              title:         parsed.title         || FALLBACK.title,
              subtitle:      parsed.subtitle      || FALLBACK.subtitle,
              discount_code: parsed.discount_code || FALLBACK.discount_code,
              discount_text: parsed.discount_text || FALLBACK.discount_text,
              button_text:   parsed.button_text   || FALLBACK.button_text,
              dismiss_text:  parsed.dismiss_text  || FALLBACK.dismiss_text,
            });
          }
        } catch { /* keep FALLBACK */ }
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  // ── Only wire the mouse-leave listener once settings are loaded AND enabled ─
  const handleMouseLeave = useCallback(
    (e: MouseEvent) => {
      if (
        e.clientY <= 5 &&
        !dismissed &&
        config.enabled &&
        !sessionStorage.getItem("exit_popup_shown")
      ) {
        setShow(true);
        sessionStorage.setItem("exit_popup_shown", "1");
      }
    },
    [dismissed, config.enabled]
  );

  useEffect(() => {
    if (!ready || !config.enabled) return; // don't attach if disabled or not loaded
    document.addEventListener("mouseleave", handleMouseLeave);
    return () => document.removeEventListener("mouseleave", handleMouseLeave);
  }, [ready, handleMouseLeave, config.enabled]);

  const handleCopy = () => {
    navigator.clipboard.writeText(config.discount_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setShow(false);
    setDismissed(true);
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-foreground/40" />
      <div
        className="relative w-full max-w-sm bg-card rounded-2xl overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-muted/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Top accent */}
        <div className="h-24 bg-muted flex items-center justify-center">
          <div className="w-14 h-14 rounded-xl bg-card flex items-center justify-center">
            <Gift className="w-7 h-7 text-[#EF3752]" />
          </div>
        </div>

        <div className="p-6 text-center">
          <h3 className="font-display text-lg font-bold text-foreground mb-1">{config.title}</h3>
          <p className="text-xs text-muted-foreground mb-4">{config.subtitle}</p>

          <div className="bg-muted border border-border rounded-xl p-4 mb-4">
            <p className="text-xs text-muted-foreground mb-1">{config.discount_text}</p>
            <div className="flex items-center justify-center gap-2">
              <span className="font-display text-2xl font-black text-primary tracking-wider">
                {config.discount_code}
              </span>
              <button
                onClick={handleCopy}
                className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button onClick={handleClose} className="w-full btn-primary py-2.5 text-sm font-semibold">
            {config.button_text}
          </button>
          <button
            onClick={handleClose}
            className="text-[10px] text-muted-foreground/60 mt-2 hover:text-muted-foreground transition-colors"
          >
            {config.dismiss_text}
          </button>
        </div>
      </div>
    </div>
  );
}
