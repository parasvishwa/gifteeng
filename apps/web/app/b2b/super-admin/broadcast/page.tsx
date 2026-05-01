"use client";

// Super-admin — Push broadcast composer
// Fan-out push notification to every registered device (mobile app only
// for now; web push can be added later). Super-admin only.
//
// Endpoint:
//   POST /api/notifications/admin/broadcast
//     { title, body, data?: Record<string,string>, platform?: "android"|"ios" }

import { useState } from "react";
import { Button, Input, Label, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@gifteeng/ui";
import {
  Megaphone, Send, Loader2, AlertCircle, CheckCircle2, Users, Smartphone,
} from "lucide-react";
import { authHeaders, getApiBase, safePost } from "@/lib/admin-api";

interface BroadcastResult { sent: number; failed: number; targets: number }

const ROUTE_PRESETS = [
  { label: "Home",         value: "/home" },
  { label: "Shop",         value: "/shop" },
  { label: "Specific product", value: "/shop/<slug>" },
  { label: "Games",        value: "/play" },
  { label: "Reminders",    value: "/reminders" },
  { label: "Cart",         value: "/cart" },
  { label: "Account",      value: "/account" },
];

export default function AdminBroadcast() {
  const [title, setTitle] = useState("");
  const [body, setBody]   = useState("");
  const [route, setRoute] = useState("/home");
  const [platform, setPlatform] = useState<"all" | "android" | "ios">("all");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null); setResult(null);
    if (!title.trim() || !body.trim()) {
      setError("Title and body are required."); return;
    }
    if (!confirm(
      `Send this push to EVERY ${platform === "all" ? "" : platform + " "}device?\n\n` +
      `  Title: ${title}\n  Body: ${body}\n  Route: ${route}\n\n` +
      `This can't be recalled once delivered.`,
    )) return;

    setSending(true);
    const payload: any = { title: title.trim(), body: body.trim() };
    if (route && route.trim()) payload.data = { route: route.trim() };
    if (platform !== "all") payload.platform = platform;

    const out = await safePost<BroadcastResult | null>(
      "/notifications/admin/broadcast", payload, null,
    );
    setSending(false);
    if (!out) { setError("Broadcast failed. Check API logs or your auth token."); return; }
    setResult(out);
    // Keep composer values so admin can tweak + re-send if needed
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Megaphone className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-display font-bold tracking-tight">Push Broadcast</h1>
          <p className="text-xs text-muted-foreground">
            Send a push notification to every registered device.
          </p>
        </div>
      </div>

      {/* Composer */}
      <div className="bg-card rounded-xl border border-border/40 p-5 space-y-4">
        <div>
          <Label className="text-xs">Title *</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="🎁 Diwali sale — 30% off sitewide"
            maxLength={120}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Shown bold at the top of the notification. Keep under ~40 chars for best rendering.
            {title && <span> ({title.length}/120)</span>}
          </p>
        </div>

        <div>
          <Label className="text-xs">Body *</Label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Order by Sunday to get it delivered in time."
            maxLength={500}
            rows={3}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            iOS shows ~90 chars, Android ~160. Plain text only.
            {body && <span> ({body.length}/500)</span>}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Tap destination</Label>
            <Select value={route} onValueChange={setRoute}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROUTE_PRESETS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label} <span className="text-muted-foreground/70">({r.value})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="mt-1.5"
              value={route}
              onChange={(e) => setRoute(e.target.value)}
              placeholder="Or paste a custom route"
            />
          </div>
          <div>
            <Label className="text-xs">Platform filter</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All platforms</SelectItem>
                <SelectItem value="android">Android only</SelectItem>
                <SelectItem value="ios">iOS only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-muted/20 rounded-xl p-4 border border-border/30">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Preview</p>
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate">
                {title || "Your title appears here"}
              </div>
              <div className="text-xs text-muted-foreground line-clamp-2">
                {body || "Your message body appears here."}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={send} disabled={sending || !title.trim() || !body.trim()}>
            {sending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Sending…</>
              : <><Send className="w-3.5 h-3.5 mr-1.5" /> Broadcast</>
            }
          </Button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-emerald-500/10 text-foreground border border-emerald-500/30 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold text-sm">Broadcast dispatched</span>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-1">
            <Stat label="Targets" val={result.targets} icon={Users} />
            <Stat label="Sent" val={result.sent} icon={CheckCircle2} color="text-emerald-600" />
            <Stat label="Failed" val={result.failed} icon={AlertCircle} color="text-rose-500" />
          </div>
          {result.failed > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Failed tokens are auto-removed from the device registry (stale / uninstalled).
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="bg-rose-500/10 text-rose-600 border border-rose-500/30 rounded-xl p-4 flex items-center gap-2 text-sm">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="bg-card rounded-xl border border-border/40 p-5 text-xs text-muted-foreground space-y-2">
        <p className="font-semibold text-foreground">Notes</p>
        <ul className="list-disc list-inside space-y-1 pl-1">
          <li>Requires <code className="bg-muted/40 px-1 rounded">FIREBASE_SERVICE_ACCOUNT_JSON</code> env set on the API server.</li>
          <li>If unset, this just logs and returns 0/0 — no push is delivered.</li>
          <li>Notifications are ALSO persisted as an in-app inbox row per customer.</li>
          <li>For customer-specific pushes (e.g. order status), use the order status change path — it auto-fires from the orders module.</li>
        </ul>
      </div>
    </div>
  );
}

function Stat({
  label, val, color, icon: Icon,
}: { label: string; val: number; color?: string; icon: React.ElementType }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </span>
      <span className={`text-xl font-bold ${color ?? ""}`}>{val}</span>
    </div>
  );
}
