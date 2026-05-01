"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Gift, Copy, Share2, Users, CreditCard, ChevronRight, Clock,
  AlertCircle, CheckCircle, Info, Sparkles, Mail, MessageSquare,
} from "lucide-react";

// Local stubs
const useAuth = () => ({ user: null as { id: string } | null, profile: null });
const useToast = () => ({
  toast: (_args: { title: string; description?: string; variant?: string }) => {},
});

type ReferralInfo = {
  code: string;
  expires_at: string;
  uses_count: number;
  referees?: { name: string; status: string }[];
} | null;

async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
    const res = await fetch(`${base}/api${path}`);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export default function ReferralPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [info, setInfo] = useState<ReferralInfo>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const data = await safeGet<ReferralInfo>("/referrals/me", null);
      setInfo(data);
      setLoading(false);
    };
    load();
  }, []);

  const referralCode = info?.code || null;
  const expiresAt = info?.expires_at || null;
  const usesCount = info?.uses_count || 0;
  const referees = info?.referees || [];

  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const copyCode = () => {
    if (!referralCode) return;
    navigator.clipboard.writeText(referralCode);
    toast({ title: "Copied!" });
  };

  const shareText = referralCode
    ? `Hey! Use my referral code ${referralCode} on Gifteeng and get ₹50 off your first order! 🎁 https://gifteeng.com`
    : "";

  if (!user && !loading && !info) {
    return (
      <div className="min-h-screen bg-background">
        <div className="pt-16 md:pt-20">
          <div className="container mx-auto px-4 py-16 max-w-md text-center">
            <div className="w-20 h-20 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Gift className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-bold mb-3">Refer & Earn ₹50</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Sign in to get your referral code and start earning rewards!
            </p>
            <Link href="/auth" className="bg-[#EF3752] text-white font-bold text-sm px-8 py-3 inline-flex items-center gap-2 rounded-xl hover:opacity-90">
              Sign in to get your referral code <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="pt-16 md:pt-20">
        <div className="container mx-auto px-4 pt-20 md:pt-24 pb-24 md:pb-12 max-w-2xl">
          {/* Hero */}
          <div className="bg-card rounded-2xl p-8 md:p-12 shadow-sm text-center mb-8">
            <div className="w-20 h-20 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Gift className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-bold mb-2">Refer & Earn ₹50</h1>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
              Share your love for Gifteeng! When your friend makes their first purchase, you both get ₹50 credits.
            </p>

            {loading ? (
              <div className="animate-pulse bg-muted rounded-xl p-4 max-w-xs mx-auto h-14" />
            ) : referralCode ? (
              <>
                <div className="bg-muted rounded-xl p-4 flex items-center justify-between max-w-xs mx-auto mb-3">
                  <span className="font-mono font-bold text-3xl tracking-wider">{referralCode}</span>
                  <button onClick={copyCode} className="p-2.5 rounded-lg bg-card hover:bg-accent transition-colors shadow-sm">
                    <Copy className="w-5 h-5 text-primary" />
                  </button>
                </div>
                <div className="flex items-center justify-center gap-2 mb-6">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className={`text-xs font-medium ${daysLeft <= 3 ? "text-destructive" : "text-muted-foreground"}`}>
                    {daysLeft > 0 ? `Expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}` : "Expired"}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground mb-6">No active code yet.</p>
            )}

            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#EF3752] text-white font-bold text-sm px-6 py-3 flex items-center justify-center gap-2 rounded-xl hover:opacity-90"
              >
                <Share2 className="w-4 h-4" /> Share on WhatsApp
              </a>
              <button
                onClick={() => {
                  if (referralCode) {
                    navigator.clipboard.writeText(`https://gifteeng.com?ref=${referralCode}`);
                    toast({ title: "Link copied!" });
                  }
                }}
                className="bg-muted border border-border text-foreground font-bold text-sm px-6 py-3 flex items-center justify-center gap-2 rounded-xl hover:bg-muted"
              >
                <Share2 className="w-4 h-4" /> Share Link
              </button>
            </div>
          </div>

          {/* How it works */}
          <div className="bg-card rounded-2xl p-8 shadow-sm mb-8">
            <h2 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> How It Works
            </h2>
            <div className="space-y-4">
              {[
                { icon: Share2, title: "1. Share your code", desc: "Copy your unique referral code and send it to friends & family via WhatsApp, SMS or any platform." },
                { icon: Users, title: "2. Friend signs up & enters code", desc: "Your friend creates an account on Gifteeng and enters your referral code during checkout." },
                { icon: Gift, title: "3. Friend places first order", desc: "When they place their first order using your code, the reward gets activated for both of you." },
                { icon: CreditCard, title: "4. You both earn ₹50", desc: "₹50 credits are added to your account and your friend also gets ₹50 off their order. Win-win!" },
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <step.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-sm">{step.title}</h3>
                    <p className="text-xs text-muted-foreground">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Important Notes */}
          <div className="bg-card rounded-2xl p-8 shadow-sm mb-8">
            <h2 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-primary" /> Important Notes
            </h2>
            <ul className="space-y-3">
              {[
                { icon: Clock, text: "Each referral code is valid for 15 days from the date of generation. After expiry, you can generate a new one." },
                { icon: AlertCircle, text: "Your friend must be a new user on Gifteeng and apply the code during their first purchase." },
                { icon: CheckCircle, text: "Credits are added within 24 hours after your friend's order is confirmed and payment is received." },
                { icon: Gift, text: "There's no limit on how many friends you can refer! Share with as many people as you want." },
                { icon: CreditCard, text: "Credits can be used on any product during checkout. They cannot be converted to cash." },
                { icon: AlertCircle, text: "Self-referrals or fake accounts will lead to disqualification and forfeiture of credits." },
              ].map((note, i) => (
                <li key={i} className="flex items-start gap-3">
                  <note.icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">{note.text}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-card rounded-2xl p-5 shadow-sm text-center">
              <p className="text-2xl font-display font-bold text-foreground">{usesCount}</p>
              <p className="text-[10px] text-muted-foreground">Friends Referred</p>
            </div>
            <div className="bg-card rounded-2xl p-5 shadow-sm text-center">
              <p className="text-2xl font-display font-bold text-foreground">₹{usesCount * 50}</p>
              <p className="text-[10px] text-muted-foreground">Total Earned</p>
            </div>
            <div className="bg-card rounded-2xl p-5 shadow-sm text-center">
              <p className="text-2xl font-display font-bold text-foreground">₹{usesCount * 50}</p>
              <p className="text-[10px] text-muted-foreground">Available Credits</p>
            </div>
          </div>

          {/* Referees list */}
          {referees.length > 0 && (
            <div className="bg-card rounded-2xl p-8 shadow-sm mb-8">
              <h2 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" /> Friends Referred
              </h2>
              <ul className="space-y-2">
                {referees.map((r, i) => (
                  <li key={i} className="flex items-center justify-between text-sm border-b border-border/30 pb-2 last:border-0">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-xs text-muted-foreground">{r.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* CTA */}
          <div className="text-center">
            <Link href="/account" className="text-primary text-sm font-medium inline-flex items-center gap-1">
              View your dashboard <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
