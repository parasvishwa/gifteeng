"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles, Loader2, Copy, Check, MessageCircle, X } from "lucide-react";
import { authHeaders, getApiBase, safeGet, safePost } from "@/lib/admin-api";

type CampaignStatus = "draft" | "active" | "completed" | "cancelled";

type Campaign = {
  id: string;
  title: string;
  type?: string;
  status: CampaignStatus | string;
  companyId?: string;
  companyName?: string;
  budget?: number;
  perEmployeeBudget?: number;
  redeemedCount?: number;
  totalRecipients?: number;
  startsAt?: string | null;
  endsAt?: string | null;
};

type Company = { id: string; name: string };

const CAMPAIGN_TYPES = [
  "festival",
  "reward",
  "onboarding",
  "milestone",
  "custom",
] as const;

const STATUS_TABS: Array<"all" | CampaignStatus> = [
  "all",
  "draft",
  "active",
  "completed",
  "cancelled",
];

function statusColor(s: string): string {
  switch (s) {
    case "active":
      return "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400";
    case "draft":
      return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "completed":
      return "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "cancelled":
      return "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400";
    default:
      return "";
  }
}

function inr(n?: number): string {
  return (n ?? 0).toLocaleString("en-IN", { style: "currency", currency: "INR" });
}

// ─── AI Marketing Messages ────────────────────────────────────
const OCCASIONS = ["Birthday", "Festival", "Anniversary", "Corporate"] as const;
const TARGETS = ["All customers", "B2B companies", "VIP"] as const;
const TONES = ["Warm", "Professional", "Festive"] as const;

type Occasion = typeof OCCASIONS[number];
type Target = typeof TARGETS[number];
type Tone = typeof TONES[number];

type GeneratedMessage = {
  id: number;
  text: string;
  loading: boolean;
  copied: boolean;
};

type B2BCompany = { id: string; name: string };

function AiMarketingMessages({ companies }: { companies: B2BCompany[] }) {
  const [occasion, setOccasion] = useState<Occasion>("Birthday");
  const [target, setTarget] = useState<Target>("All customers");
  const [tone, setTone] = useState<Tone>("Warm");
  const [messages, setMessages] = useState<GeneratedMessage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [bulkMessages, setBulkMessages] = useState<{ company: string; message: string }[]>([]);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkDone, setBulkDone] = useState(false);

  async function callAI(prompt: string): Promise<string> {
    const token = typeof window !== "undefined" ? localStorage.getItem("gifteeng.b2b.token") : null;
    const res = await fetch(`${getApiBase()}/api/admin/ai/write`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { text?: string };
    return data.text ?? "";
  }

  async function generate() {
    setGenerating(true);
    setMessages([
      { id: 1, text: "", loading: true, copied: false },
      { id: 2, text: "", loading: true, copied: false },
      { id: 3, text: "", loading: true, copied: false },
    ]);
    const prompt = `Write a WhatsApp marketing message for Gifteeng (Indian gifting platform). Occasion: ${occasion}. Target: ${target}. Tone: ${tone}. Max 160 chars. Include an emoji and a CTA. Return only the message.`;

    // Call 3 times in parallel
    const [r1, r2, r3] = await Promise.all([callAI(prompt), callAI(prompt), callAI(prompt)]);
    setMessages([
      { id: 1, text: r1, loading: false, copied: false },
      { id: 2, text: r2, loading: false, copied: false },
      { id: 3, text: r3, loading: false, copied: false },
    ]);
    setGenerating(false);
  }

  function copyMessage(id: number) {
    const msg = messages.find(m => m.id === id);
    if (!msg) return;
    navigator.clipboard.writeText(msg.text);
    setMessages(prev => prev.map(m => m.id === id ? { ...m, copied: true } : m));
    setTimeout(() => setMessages(prev => prev.map(m => m.id === id ? { ...m, copied: false } : m)), 2000);
  }

  function openWA(text: string) {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  async function generateBulk() {
    if (!companies.length) return;
    setBulkGenerating(true);
    setBulkDone(false);
    setBulkMessages([]);
    const results: { company: string; message: string }[] = [];

    for (const company of companies.slice(0, 20)) {
      const prompt = `Write a personalized WhatsApp marketing message for Gifteeng (Indian gifting platform) to the B2B company "${company.name}". Occasion: ${occasion}. Tone: ${tone}. Max 160 chars. Include an emoji and a CTA. Return only the message.`;
      const text = await callAI(prompt);
      results.push({ company: company.name, message: text });
    }

    setBulkMessages(results);
    setBulkGenerating(false);
    setBulkDone(true);
  }

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
        <p className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5" /> Generate WhatsApp Marketing Message
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Occasion</label>
            <select
              value={occasion}
              onChange={e => setOccasion(e.target.value as Occasion)}
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              {OCCASIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Target Audience</label>
            <select
              value={target}
              onChange={e => setTarget(e.target.value as Target)}
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              {TARGETS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Tone</label>
            <select
              value={tone}
              onChange={e => setTone(e.target.value as Tone)}
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              {TONES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? "Generating 3 variations..." : "Generate Message"}
        </button>
      </div>

      {/* 3 Variations */}
      {messages.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">3 AI Variations</p>
          <div className="grid grid-cols-1 gap-3">
            {messages.map((msg, i) => (
              <div key={msg.id} className="rounded-xl border border-border/40 bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Variation {i + 1}</span>
                  {msg.text && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${msg.text.length <= 160 ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-700 border-red-200"}`}>
                      {msg.text.length}/160 chars
                    </span>
                  )}
                </div>
                {msg.loading ? (
                  <div className="h-12 flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed bg-muted/30 rounded-lg p-3 font-mono whitespace-pre-wrap">{msg.text}</p>
                )}
                {!msg.loading && msg.text && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyMessage(msg.id)}
                      className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                    >
                      {msg.copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      {msg.copied ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={() => openWA(msg.text)}
                      className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                    >
                      <MessageCircle className="w-3 h-3" /> Send to WhatsApp
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bulk B2B Generator */}
      {companies.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border/30 bg-muted/10">
            <p className="text-xs font-semibold flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5 text-primary" /> Generate Bulk B2B List
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              One personalized message per B2B company ({Math.min(companies.length, 20)} companies)
            </p>
          </div>
          <div className="p-4 space-y-3">
            <button
              onClick={generateBulk}
              disabled={bulkGenerating}
              className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
            >
              {bulkGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {bulkGenerating ? `Generating... (${bulkMessages.length}/${Math.min(companies.length, 20)})` : "Generate bulk list"}
            </button>

            {bulkMessages.length > 0 && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {bulkMessages.map((item, i) => (
                  <div key={i} className="rounded-lg border border-border/40 p-3 space-y-2">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{item.company}</p>
                    <p className="text-xs font-mono bg-muted/30 rounded-md p-2 whitespace-pre-wrap">{item.message}</p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { navigator.clipboard.writeText(item.message); }}
                        className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] hover:bg-muted"
                      >
                        <Copy className="w-2.5 h-2.5" /> Copy
                      </button>
                      <button
                        onClick={() => openWA(item.message)}
                        className="flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-[10px] text-white hover:bg-green-700"
                      >
                        <MessageCircle className="w-2.5 h-2.5" /> WhatsApp
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {bulkDone && (
              <p className="text-xs text-emerald-600 font-medium">
                ✅ {bulkMessages.length} personalized messages generated!
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SuperAdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | CampaignStatus>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [scopedToCaller, setScopedToCaller] = useState<boolean>(false);
  const [showNew, setShowNew] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"campaigns" | "ai_marketing">("campaigns");

  // Per-row action state
  const [activating, setActivating] = useState<string | null>(null);
  const [allocating, setAllocating] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cmpRaw = await safeGet<{ data?: Company[] } | Company[]>("/companies", []);
      const cmpList: Company[] = Array.isArray(cmpRaw) ? cmpRaw : (cmpRaw.data ?? []);
      setCompanies(cmpList);

      const allRes = await safeGet<{ data?: Campaign[]; scoped?: boolean } | Campaign[]>(
        "/campaigns?all=true",
        [],
      );
      let list: Campaign[] = [];
      let scoped = false;
      if (Array.isArray(allRes)) {
        list = allRes;
      } else {
        list = allRes.data ?? [];
        scoped = !!allRes.scoped;
      }

      if (!scoped && list.length > 0) {
        const firstId = list[0].companyId;
        if (firstId && list.every((c) => c.companyId === firstId) && cmpList.length > 1) {
          scoped = true;
        }
      }
      setScopedToCaller(scoped);

      const byId = new Map(cmpList.map((c) => [c.id, c.name] as const));
      list = list.map((c) => ({
        ...c,
        companyName: c.companyName ?? (c.companyId ? byId.get(c.companyId) : undefined),
      }));

      setCampaigns(list);
    } catch {
      setError("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function activateCampaign(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setActivating(id);
    setActionMsg((prev) => ({ ...prev, [id]: "" }));
    const res = await safePost<{ id?: string; status?: string } | null>(
      `/campaigns/${id}/activate`,
      {},
      null,
    );
    setActivating(null);
    if (res) {
      setCampaigns((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: "active" } : c)),
      );
      setActionMsg((prev) => ({ ...prev, [id]: "Activated" }));
    } else {
      setActionMsg((prev) => ({ ...prev, [id]: "Activation failed" }));
    }
    setTimeout(() => setActionMsg((prev) => ({ ...prev, [id]: "" })), 3000);
  }

  async function allocateCampaign(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setAllocating(id);
    setActionMsg((prev) => ({ ...prev, [id]: "" }));
    const res = await safePost<{ allocated?: number } | null>(
      `/campaigns/${id}/allocate`,
      {},
      null,
    );
    setAllocating(null);
    if (res) {
      const count = res.allocated;
      setActionMsg((prev) => ({
        ...prev,
        [id]: count != null ? `Allocated to ${count} employees` : "Allocated",
      }));
    } else {
      setActionMsg((prev) => ({ ...prev, [id]: "Allocation failed" }));
    }
    setTimeout(() => setActionMsg((prev) => ({ ...prev, [id]: "" })), 4000);
  }

  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (companyFilter !== "all" && c.companyId !== companyFilter) return false;
      return true;
    });
  }, [campaigns, statusFilter, companyFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            All active gifting campaigns across the platform.
          </p>
        </div>
        <div className="flex gap-2">
          {activeTab === "campaigns" && (
            <button
              onClick={() => setShowNew(true)}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              New Campaign
            </button>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg border border-border/40 bg-muted/30 p-1 w-fit">
        <button
          onClick={() => setActiveTab("campaigns")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${activeTab === "campaigns" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Campaigns
        </button>
        <button
          onClick={() => setActiveTab("ai_marketing")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all flex items-center gap-1.5 ${activeTab === "ai_marketing" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Sparkles className="w-3.5 h-3.5 text-primary" /> AI Marketing Messages
        </button>
      </div>

      {activeTab === "ai_marketing" && (
        <AiMarketingMessages companies={companies} />
      )}

      {activeTab === "campaigns" && scopedToCaller && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-300">
          Showing campaigns for your company only — cross-company view requires a
          platform-staff endpoint.
        </div>
      )}

      {activeTab === "campaigns" && <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-md border p-1">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded px-3 py-1 text-xs font-medium uppercase transition ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <select
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          <option value="all">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "campaign" : "campaigns"}
        </div>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left">Title</th>
              <th className="px-4 py-2 text-left">Type</th>
              <th className="px-4 py-2 text-left">Company</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Budget</th>
              <th className="px-4 py-2 text-right">Per-employee</th>
              <th className="px-4 py-2 text-right">Redeemed</th>
              <th className="px-4 py-2 text-left">Starts</th>
              <th className="px-4 py-2 text-left">Ends</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                  No campaigns match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer border-t hover:bg-muted/30"
                  onClick={() => {
                    window.location.href = `/super-admin/campaigns/${c.id}`;
                  }}
                >
                  <td className="px-4 py-2 font-medium">
                    <Link
                      href={`/super-admin/campaigns/${c.id}`}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs uppercase text-muted-foreground">
                    {c.type ?? "--"}
                  </td>
                  <td className="px-4 py-2">{c.companyName ?? "--"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${statusColor(c.status)}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{inr(c.budget)}</td>
                  <td className="px-4 py-2 text-right">{inr(c.perEmployeeBudget)}</td>
                  <td className="px-4 py-2 text-right text-xs">
                    {c.redeemedCount ?? 0}
                    {c.totalRecipients != null ? ` / ${c.totalRecipients}` : ""}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {c.startsAt ? new Date(c.startsAt).toLocaleDateString() : "--"}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {c.endsAt ? new Date(c.endsAt).toLocaleDateString() : "--"}
                  </td>
                  <td className="px-4 py-2">
                    <div
                      className="flex items-center justify-end gap-1 flex-wrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {actionMsg[c.id] ? (
                        <span className="text-xs text-muted-foreground">{actionMsg[c.id]}</span>
                      ) : null}
                      {c.status === "draft" && (
                        <button
                          onClick={(e) => activateCampaign(c.id, e)}
                          disabled={activating === c.id}
                          className="rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50 hover:bg-green-700 whitespace-nowrap"
                        >
                          {activating === c.id ? "Activating..." : "Activate"}
                        </button>
                      )}
                      {(c.status === "active" || c.status === "draft") && (
                        <button
                          onClick={(e) => allocateCampaign(c.id, e)}
                          disabled={allocating === c.id}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50 whitespace-nowrap"
                        >
                          {allocating === c.id ? "Allocating..." : "Allocate to employees"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      </>}

      {showNew && (
        <NewCampaignDialog
          companies={companies}
          onClose={() => setShowNew(false)}
          onCreated={(campaign) => {
            const byId = new Map(companies.map((c) => [c.id, c.name] as const));
            setCampaigns((prev) => [
              {
                ...campaign,
                companyName: campaign.companyName ?? byId.get(campaign.companyId ?? "") ?? "--",
              },
              ...prev,
            ]);
            setShowNew(false);
          }}
        />
      )}
    </div>
  );
}

// ─── New Campaign Dialog ──────────────────────────────────────────────────────

function NewCampaignDialog({
  companies,
  onClose,
  onCreated,
}: {
  companies: Company[];
  onClose: () => void;
  onCreated: (campaign: Campaign) => void;
}) {
  const [companyId, setCompanyId] = useState<string>(companies[0]?.id ?? "");
  const [type, setType] = useState<string>("festival");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [budget, setBudget] = useState<string>("");
  const [perEmployee, setPerEmployee] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) {
      setError("Select a company");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await safePost<Campaign | null>(
      "/campaigns",
      {
        companyId,
        type,
        title,
        description,
        budget: budget ? Number(budget) : undefined,
        perEmployeeBudget: perEmployee ? Number(perEmployee) : undefined,
        startsAt: startDate || undefined,
        endsAt: endDate || undefined,
      },
      null,
    );
    setSaving(false);
    if (!res || !res.id) {
      setError("Failed to create campaign");
      return;
    }
    onCreated(res);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-background p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">New Campaign</h2>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Company *
            </span>
            <select
              required
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-1.5"
            >
              <option value="">— Select company —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Campaign Type *
            </span>
            <select
              required
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-1.5"
            >
              {CAMPAIGN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Title *
            </span>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-1.5"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Description
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-1.5 resize-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
                Total Budget (INR)
              </span>
              <input
                type="number"
                min="0"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
                Per-Employee (INR)
              </span>
              <input
                type="number"
                min="0"
                value={perEmployee}
                onChange={(e) => setPerEmployee(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
                Start Date
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
                End Date
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5"
              />
            </label>
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Campaign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
