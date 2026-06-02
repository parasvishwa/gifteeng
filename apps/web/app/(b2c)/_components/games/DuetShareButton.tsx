"use client";

/**
 * DuetShareButton — shown on the order success page.
 * Generates a Duet invite token for this order and lets the sender
 * share a "surprise reward" scratch card with the recipient via WhatsApp
 * or copy-link.
 */

import { useState } from "react";
import { Check, Copy, MessageCircle, Sparkles } from "lucide-react";
import { cartFetch, getB2cToken } from "@/lib/api";

type Props = { orderId: string; recipientName?: string };

export default function DuetShareButton({ orderId, recipientName }: Props) {
  const [token, setToken]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    if (!getB2cToken()) {
      setErr("Please sign in to share a Duet reward");
      return;
    }
    if (loading) return;
    setLoading(true);
    try {
      const r = await cartFetch<{ token: string }>("/duet/create", {
        method: "POST",
        body: JSON.stringify({ orderId }),
        authed: true,
      });
      setToken(r.token);
    } catch (e: any) {
      setErr(e?.body?.message ?? "Could not create Duet link");
    }
    setLoading(false);
  };

  const url = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/gift/${token}` : "";
  const waText = encodeURIComponent(
    `I sent you something special from Gifteeng 🎁✨\nPlus, here's a surprise reward for you too — scratch it open 👉 ${url}`,
  );

  const copy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="mt-6">
      <div
        className="relative mx-auto max-w-sm rounded-2xl p-5 overflow-hidden border border-white/10 bg-[#12131A]"
      >
        {!token ? (
          <>
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-brand/15"
              >
                ✨
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-purple-700 dark:text-purple-300 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Duet Jackpot
                </p>
                <p className="font-black text-base text-white leading-tight">
                  Send {recipientName ?? "them"} a surprise reward too!
                </p>
              </div>
            </div>

            <p className="text-xs text-white/40 mb-4">
              Share a secret scratch card with {recipientName ?? "your recipient"}. They reveal a
              discount, free shipping or other perk — AND you get +10 Goins when they claim it.
            </p>

            {err && (
              <p className="text-xs text-red-500 mb-2">{err}</p>
            )}

            <button
              onClick={create}
              disabled={loading}
              className="w-full py-3 rounded-2xl text-sm font-black text-white bg-brand hover:bg-brand-dark transition-colors active:scale-95"
            >
              {loading ? "Creating your Duet…" : "🎁 Generate Duet Reward Link"}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center">
                <Check className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm text-white">Your Duet link is ready!</p>
                <p className="text-xs text-white/40">Share it via WhatsApp or copy</p>
              </div>
            </div>

            <div className="rounded-xl bg-muted/50 border border-white/10 p-2 mb-3 text-[10px] font-mono break-all">
              {url}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <a
                href={`https://wa.me/?text=${waText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-full text-xs font-black text-white"
                style={{ background: "#25D366" }}
              >
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </a>
              <button
                onClick={copy}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-full text-xs font-black text-white transition-colors ${copied ? "bg-emerald-600" : "bg-brand hover:bg-brand-dark"}`}
              >
                {copied ? (
                  <><Check className="w-3.5 h-3.5" /> Copied!</>
                ) : (
                  <><Copy className="w-3.5 h-3.5" /> Copy link</>
                )}
              </button>
            </div>

            <p className="text-[10px] text-white/40 mt-3 text-center">
              You'll earn +10 Goins when they claim 🪙
            </p>
          </>
        )}

      </div>
    </div>
  );
}
