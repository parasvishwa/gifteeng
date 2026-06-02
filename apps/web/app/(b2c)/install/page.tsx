"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone, Share, MoreVertical, Plus, CheckCircle2 } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua));

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const installed = () => setIsInstalled(true);

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <section className="py-12 md:py-16">
      <div className="mx-auto max-w-xl px-4 text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Smartphone className="w-10 h-10 text-primary" />
        </div>

        <h1 className="font-display text-3xl md:text-4xl font-black mb-3 tracking-tight">
          Install Gifteeng App
        </h1>
        <p className="text-muted-foreground mb-8 text-base">
          Get the full app experience &mdash; faster loading, offline access, and easy home screen access.
        </p>

        {isInstalled ? (
          <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-card">
            <CheckCircle2 className="w-12 h-12 text-primary" />
            <p className="text-foreground font-semibold">App is already installed!</p>
            <p className="text-sm text-muted-foreground">Open it from your home screen.</p>
          </div>
        ) : isIOS ? (
          <div className="text-left space-y-4 p-6 rounded-2xl bg-card">
            <p className="font-semibold text-foreground">How to install on iPhone/iPad:</p>
            <div className="space-y-3">
              <Step num={1}>
                Tap the <Share className="inline w-4 h-4" /> <strong>Share</strong> button in Safari
              </Step>
              <Step num={2}>
                Scroll down and tap <Plus className="inline w-4 h-4" /> <strong>Add to Home Screen</strong>
              </Step>
              <Step num={3}>
                Tap <strong>Add</strong> to confirm
              </Step>
            </div>
          </div>
        ) : deferredPrompt ? (
          <button
            onClick={handleInstall}
            className="inline-flex items-center gap-2 bg-[#EF3752] text-white px-8 py-4 rounded-xl font-bold text-base hover:opacity-90 transition-all"
          >
            <Download className="w-5 h-5" />
            Install Gifteeng App
          </button>
        ) : (
          <div className="text-left space-y-4 p-6 rounded-2xl bg-card">
            <p className="font-semibold text-foreground">How to install on Android / Desktop Chrome:</p>
            <div className="space-y-3">
              <Step num={1}>
                Tap the <MoreVertical className="inline w-4 h-4" /> <strong>menu</strong> button in Chrome
              </Step>
              <Step num={2}>
                Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>
              </Step>
              <Step num={3}>
                Tap <strong>Install</strong> to confirm
              </Step>
            </div>
          </div>
        )}

        <div className="mt-10 grid grid-cols-3 gap-4 text-center">
          {[
            { label: "Fast", desc: "Loads instantly" },
            { label: "Offline", desc: "Works anywhere" },
            { label: "No Store", desc: "Install directly" },
          ].map((f) => (
            <div key={f.label} className="p-3 rounded-xl bg-card">
              <p className="font-semibold text-foreground text-sm">{f.label}</p>
              <p className="text-xs text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Step({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
        {num}
      </div>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
