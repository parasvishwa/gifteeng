"use client";

import { useState, useEffect, useMemo } from "react";
import {
  toast, Badge, Switch, Input } from "@gifteeng/ui";
import { Button } from "@gifteeng/ui";
import {
  Gift, Users, TrendingUp, Clock, Search, ChevronDown,
  Loader2, Mail, Phone, ShoppingBag, Plus, Copy, Check, Share2,
} from "lucide-react";
import { authHeaders, getApiBase, safeGet, safePatch, safePost } from "@/lib/admin-api";

// The backend referral row shape (from service.listAll → prisma.referral.findMany)
interface Referral {
  id: string;
  code: string;
  referrerCustomerId: string;
  refereeCustomerId: string | null;
  status: string; // "pending" | "claimed"
  rewardAmount: string | number | null;
  claimedAt: string | null;
  createdAt: string;
  discountValue?: number;
  discountType?: string;
}

function buildShareLink(code: string) {
  return `https://new.gifteeng.com/?ref=${code}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <button
      onClick={handleCopy}
      title="Copy link"
      className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0"
    >
      {copied
        ? <Check className="w-3.5 h-3.5 text-emerald-500" />
        : <Copy className="w-3.5 h-3.5 text-muted-foreground" />
      }
    </button>
  );
}

function ShareButton({ code }: { code: string }) {
  const url = buildShareLink(code);
  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Gifteeng Referral', text: 'Use my referral link!', url });
        return;
      } catch { /* cancelled or failed, fall through */ }
    }
    // Fallback: WhatsApp
    const wa = `https://wa.me/?text=${encodeURIComponent(`Get a discount on Gifteeng! Use my referral link: ${url}`)}`;
    window.open(wa, '_blank', 'noopener,noreferrer');
  };
  return (
    <button
      onClick={handleShare}
      title="Share"
      className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0"
    >
      <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
    </button>
  );
}

export default function AdminReferrals() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await safeGet<Referral[]>("/referrals", []);
    setReferrals(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const generateCode = async () => {
    setGenerating(true);
    const result = await safePost<Referral | null>("/referrals/generate", {}, null);
    if (result) {
      toast({ title: "New referral code generated!" });
      await load();
    } else {
      toast({ title: "Failed to generate code", variant: "destructive" });
    }
    setGenerating(false);
  };

  const toggleActive = async (r: Referral) => {
    const newStatus = r.status === 'claimed' ? 'pending' : 'claimed';
    await safePatch(`/referrals/codes/${r.id}`, { is_active: r.status !== 'claimed' }, null);
    setReferrals(prev => prev.map(x => x.id === r.id ? { ...x, status: newStatus } : x));
    toast({ title: `Code ${newStatus === 'claimed' ? 'activated' : 'deactivated'}` });
  };

  // Group: codes are rows with refereeCustomerId === null (they are the referrer's own code rows)
  // Uses are rows with a refereeCustomerId set
  const codes = useMemo(
    () => referrals.filter(r => r.refereeCustomerId === null),
    [referrals],
  );
  const uses = useMemo(
    () => referrals.filter(r => r.refereeCustomerId !== null),
    [referrals],
  );

  const filtered = useMemo(() => {
    if (!search) return codes;
    const q = search.toLowerCase();
    return codes.filter(c =>
      c.code.toLowerCase().includes(q) ||
      c.referrerCustomerId.toLowerCase().includes(q),
    );
  }, [codes, search]);

  const activeCodes = codes.filter(c => c.status !== 'claimed').length;
  const totalUses = uses.length;
  const totalCoinsEarned = uses.filter(u => u.rewardAmount).reduce(
    (s, u) => s + Number(u.rewardAmount ?? 0), 0,
  );

  const getUsesFor = (code: string) => uses.filter(u => u.code.startsWith(code + '-') || u.code === code);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Gift className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-display font-bold tracking-tight">Referrals</h1>
          <p className="text-xs text-muted-foreground">
            {activeCodes} active · {totalUses} total uses · {codes.length} codes
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 h-8 text-xs shrink-0"
          onClick={generateCode}
          disabled={generating}
        >
          {generating
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Plus className="w-3.5 h-3.5" />
          }
          Generate New Code
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total Codes", val: codes.length, icon: Gift, color: "text-primary" },
          { label: "Active", val: activeCodes, icon: Clock, color: "text-emerald-600" },
          { label: "Total Uses", val: totalUses, icon: Users, color: "text-blue-600" },
          // Goins earned across all referral-driven redemptions. Was
          // rendering "0%" when no referrals had fired yet (string concat
          // with totalUses * 10 for some reason) — now shows a real Goin
          // count formatted with the ₹ equivalent at 100 G = ₹1.
          {
            label: "Goins Earned",
            val: totalCoinsEarned > 0
              ? `${totalCoinsEarned.toLocaleString("en-IN")} G · ₹${(totalCoinsEarned * 0.01).toFixed(0)}`
              : "0 G",
            icon: TrendingUp,
            color: "text-amber-600",
          },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-xl p-3 border border-border/40">
            <div className="flex items-center gap-1.5 mb-1.5">
              <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
              <span className="text-[10px] text-muted-foreground font-medium">{s.label}</span>
            </div>
            <p className="text-lg font-bold tracking-tight">{s.val}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by code or customer ID..."
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Code list */}
      {filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <Gift className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm font-medium mb-1">
            {search ? "No codes match" : "No referral codes yet"}
          </p>
          <p className="text-xs text-muted-foreground">
            {search
              ? "Try a different search"
              : "Click \"Generate New Code\" to create one, or codes appear when customers generate referral links"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(code => {
            const isActive = code.status !== 'claimed';
            const codeUses = getUsesFor(code.code);
            const isOpen = expandedId === code.id;
            const shareLink = buildShareLink(code.code);
            const discountLabel = code.discountType === 'percent'
              ? `${code.discountValue ?? 10}% off`
              : code.discountValue
                ? `₹${code.discountValue} off`
                : '10% off';

            return (
              <div
                key={code.id}
                className={`bg-card rounded-xl border overflow-hidden transition-all ${
                  !isActive ? "border-border/20 opacity-60" : "border-border/40"
                }`}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-sm text-primary">{code.code}</span>
                      {isActive ? (
                        <Badge className="text-[8px] h-4 px-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[8px] h-4 px-1.5">Disabled</Badge>
                      )}
                      <Badge variant="outline" className="text-[8px] h-4 px-1.5">{discountLabel}</Badge>
                      {codeUses.length > 0 && (
                        <Badge variant="secondary" className="text-[8px] h-4 px-1.5 bg-blue-500/10 text-blue-600 border-blue-500/20">
                          {codeUses.length} use{codeUses.length !== 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                    {/* Share link row */}
                    <div className="flex items-center gap-1.5 mt-1.5 bg-muted/30 rounded-lg px-2.5 py-1.5 max-w-sm">
                      <span className="text-[10px] font-mono text-muted-foreground truncate flex-1">
                        {shareLink}
                      </span>
                      <CopyButton text={shareLink} />
                      <ShareButton code={code.code} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-muted-foreground/60 font-mono">
                        {code.referrerCustomerId.slice(0, 12)}…
                      </span>
                      <span className="text-[9px] text-muted-foreground/40">·</span>
                      <span className="text-[9px] text-muted-foreground/60">
                        Created {fmtDate(code.createdAt)}
                      </span>
                    </div>
                  </div>

                  <Switch
                    checked={isActive}
                    onCheckedChange={() => toggleActive(code)}
                  />

                  <button
                    onClick={() => setExpandedId(isOpen ? null : code.id)}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                  >
                    <ChevronDown
                      className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </div>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-border/30 pt-3 space-y-3 bg-muted/5">
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>Customer: <span className="font-mono">{code.referrerCustomerId}</span></span>
                      {code.rewardAmount && (
                        <span>Reward: <span className="font-semibold">{String(code.rewardAmount)} coins</span></span>
                      )}
                    </div>

                    {codeUses.length > 0 ? (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          Usage History ({codeUses.length})
                        </p>
                        <div className="space-y-1.5">
                          {codeUses.map(use => (
                            <div
                              key={use.id}
                              className="flex items-center gap-3 px-3 py-2 bg-card rounded-lg border border-border/30 text-xs"
                            >
                              <span className="text-muted-foreground/60 shrink-0">
                                {fmtDate(use.createdAt)}
                              </span>
                              <span className="flex items-center gap-1 truncate text-muted-foreground">
                                <Users className="w-3 h-3 shrink-0" />
                                {use.refereeCustomerId?.slice(0, 12)}…
                              </span>
                              {use.rewardAmount && (
                                <span className="ml-auto text-amber-600 font-semibold shrink-0">
                                  +{String(use.rewardAmount)} coins
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground/50 italic">No usage records yet</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}