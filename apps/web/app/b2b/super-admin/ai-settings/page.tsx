"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@gifteeng/ui";
import {
  Brain,
  Save,
  Loader2,
  Sparkles,
  Wand2,
  ImagePlus,
  Settings2,
  AlertCircle,
  CheckCircle2,
  Type,
  PenLine,
  BarChart3,
  FileText,
  ListChecks,
  Eye,
  EyeOff,
  BookOpen,
  Ban,
  Info,
  ChevronDown,
  ChevronUp,
  Key,
  Activity,
} from "lucide-react";
import { authHeaders, getApiBase } from "@/lib/admin-api";

/* ── API helpers ─────────────────────────────────────────────── */

/** Fetch wrapper that surfaces HTTP status + body on non-OK. */
async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: string; json: any }> {
  try {
    const r = await fetch(`${getApiBase()}/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(init.headers || {}),
      },
    });
    const body = await r.text();
    let json: any = null;
    try { json = JSON.parse(body); } catch { /* not JSON */ }
    return { ok: r.ok, status: r.status, body, json };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      body: e instanceof Error ? e.message : String(e),
      json: null,
    };
  }
}

type Settings = Record<string, string>;

async function loadSettings(): Promise<Settings> {
  const r = await apiFetch("/admin/settings");
  if (!r.ok || !r.json) return {};
  const map: Settings = {};
  Object.entries(r.json as Record<string, unknown>).forEach(([k, v]) => {
    const sv = typeof v === "string" ? v : JSON.stringify(v);
    map[k] = sv.replace(/^"|"$/g, "");
  });
  return map;
}

async function saveSetting(key: string, value: string): Promise<{ ok: boolean; err?: string }> {
  const r = await apiFetch(`/admin/settings/${key}`, {
    method: "PATCH",
    body: JSON.stringify({ value }),
  });
  return r.ok
    ? { ok: true }
    : { ok: false, err: `HTTP ${r.status}: ${r.body.slice(0, 200)}` };
}

type Diagnostic = {
  keyConfigured: boolean;
  keySource: "db" | "env" | "none";
  keyPrefix: string | null;
  keyLength: number;
  provider: "openai" | "anthropic";
  textModel: string;
  textApiUrl: string;
  imageModel: string;
  imageApiUrl: string;
  hasKnowledgeBase: boolean;
  hasSystemPrompt: boolean;
};

/* ── Per-field prompt keys ───────────────────────────────────── */
const FIELD_PROMPTS = [
  { key: "ai_prompt_title",       label: "Product Title",       icon: Type,      default: "Write a catchy, SEO-friendly product title. Max 80 chars. Title case." },
  { key: "ai_prompt_description", label: "Product Description", icon: PenLine,   default: "Write a compelling product description in HTML. 150-300 words. Use <p>, <ul>, <li>." },
  { key: "ai_prompt_meta_title",  label: "SEO Meta Title",      icon: BarChart3, default: "Write an SEO meta title. Max 60 chars. Include primary keyword." },
  { key: "ai_prompt_meta_desc",   label: "SEO Meta Description",icon: FileText,  default: "Write an SEO meta description. Max 160 chars. Include a call-to-action." },
  { key: "ai_prompt_features",    label: "Product Features",    icon: ListChecks,default: "Generate 4-6 short product features. Each 2-4 words. Comma-separated." },
];

/* ── Small components ────────────────────────────────────────── */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border/50 bg-card p-5 ${className}`}>
      {children}
    </div>
  );
}
function SectionTitle({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────── */
export default function AdminAISettings() {
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [saveStatus,   setSaveStatus]   = useState<{ kind: "idle" | "ok" | "err"; msg?: string }>({ kind: "idle" });
  const [settings,     setSettings]     = useState<Settings>({});
  const [activeTab,    setActiveTab]    = useState("setup");
  const [keyVisible,   setKeyVisible]   = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testingText,  setTestingText]  = useState(false);
  const [testingImage, setTestingImage] = useState(false);
  const [textResult,   setTextResult]   = useState<{ ok: boolean; text: string; detail?: string } | null>(null);
  const [imageResult,  setImageResult]  = useState<{ ok: boolean; url?: string; err?: string } | null>(null);
  const [copied,       setCopied]       = useState(false);
  const [diagnostic,   setDiagnostic]   = useState<Diagnostic | null>(null);
  const [keyInlineErr, setKeyInlineErr] = useState<string | null>(null);

  useEffect(() => {
    loadSettings().then(s => { setSettings(s); setLoading(false); });
  }, []);

  const loadDiagnostic = useCallback(async () => {
    const r = await apiFetch("/ai/diagnostic");
    if (r.ok && r.json) setDiagnostic(r.json as Diagnostic);
    else setDiagnostic(null);
  }, []);

  // Refresh diagnostic whenever user lands on Test tab
  useEffect(() => {
    if (activeTab === "test") void loadDiagnostic();
  }, [activeTab, loadDiagnostic]);

  const update = (key: string, value: string) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus({ kind: "idle" });
    const entries = Object.entries(settings).filter(([, v]) => v !== undefined && v !== "");
    const results = await Promise.all(entries.map(([k, v]) => saveSetting(k, v)));
    const failures = results.filter(r => !r.ok);
    if (failures.length === 0) {
      setSaveStatus({ kind: "ok", msg: `Saved ${results.length} settings` });
    } else {
      setSaveStatus({
        kind: "err",
        msg: `${failures.length} failed: ${failures[0]!.err ?? "unknown"}`,
      });
    }
    setSaving(false);
    setTimeout(() => setSaveStatus({ kind: "idle" }), 4000);
    void loadDiagnostic();
  };

  const saveKeyInline = async (value: string) => {
    setKeyInlineErr(null);
    if (!value) return;
    const [a, b] = await Promise.all([
      saveSetting("ai_text_api_key", value),
      saveSetting("ai_image_api_key", value),
    ]);
    if (!a.ok) setKeyInlineErr(a.err ?? "Save failed");
    else if (!b.ok) setKeyInlineErr(b.err ?? "Save failed");
    void loadDiagnostic();
  };

  const hasKey        = !!settings.ai_text_api_key;
  const keyIsAnthropic = (settings.ai_text_api_key || "").startsWith("sk-ant-");
  const model         = settings.ai_text_model || (keyIsAnthropic ? "claude-3-haiku-20240307" : "gpt-4o-mini");

  const testText = async () => {
    setTestingText(true); setTextResult(null);
    const r = await apiFetch("/ai/write", {
      method: "POST",
      body: JSON.stringify({
        prompt: "Write a catchy product title for a personalised photo frame gift",
        field: "title",
      }),
    });
    if (!r.ok) {
      setTextResult({ ok: false, text: `HTTP ${r.status}`, detail: r.body.slice(0, 500) });
    } else {
      const text: string = r.json?.text ?? "";
      // Backend prefixes soft errors with ⚠️ so they stay as 200 but are visible
      const isSoftError = text.startsWith("⚠️");
      setTextResult({ ok: !isSoftError, text: text || "(empty response)" });
    }
    setTestingText(false);
    void loadDiagnostic();
  };

  const testImage = async () => {
    setTestingImage(true); setImageResult(null);
    const r = await apiFetch("/ai/generate-image", {
      method: "POST",
      body: JSON.stringify({
        prompt: "A beautiful personalised wooden nameplate, clean white background, product photography",
      }),
    });
    if (!r.ok) {
      const detail = r.json?.message ?? r.body.slice(0, 500);
      setImageResult({ ok: false, err: `HTTP ${r.status}: ${detail}` });
    } else {
      const url: string = r.json?.imageUrl ?? "";
      setImageResult(url ? { ok: true, url } : { ok: false, err: "Empty imageUrl in response" });
    }
    setTestingImage(false);
  };

  const copyText = () => {
    if (!textResult) return;
    navigator.clipboard.writeText(textResult.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold">AI Settings</h1>
            <p className="text-xs text-muted-foreground">Configure AI for product content & image generation</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus.kind === "ok" && (
            <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> {saveStatus.msg}
            </span>
          )}
          {saveStatus.kind === "err" && (
            <span className="text-[10px] text-red-600 font-semibold flex items-center gap-1 max-w-[240px] truncate" title={saveStatus.msg}>
              <AlertCircle className="w-3 h-3" /> {saveStatus.msg}
            </span>
          )}
          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5 h-8 text-xs">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full bg-muted/40 p-1 rounded-xl h-auto grid grid-cols-3">
          <TabsTrigger value="setup"   className="text-xs py-2 rounded-lg gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <Key className="w-3.5 h-3.5" /> Setup
          </TabsTrigger>
          <TabsTrigger value="prompts" className="text-xs py-2 rounded-lg gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <PenLine className="w-3.5 h-3.5" /> Prompts
          </TabsTrigger>
          <TabsTrigger value="test"    className="text-xs py-2 rounded-lg gap-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">
            <Sparkles className="w-3.5 h-3.5" /> Test
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════
            TAB 1 — SETUP
        ════════════════════════════════ */}
        <TabsContent value="setup" className="space-y-4 mt-5">

          {/* API Key */}
          <Card>
            <SectionTitle icon={Key} title="API Key" description="OpenAI (sk-proj-…) or Anthropic Claude (sk-ant-…) — auto-detected" />
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    API Key
                    {hasKey && keyIsAnthropic && <span className="ml-2 text-[10px] font-semibold text-orange-600">Anthropic Claude</span>}
                    {hasKey && !keyIsAnthropic && <span className="ml-2 text-[10px] font-semibold text-sky-600">OpenAI</span>}
                  </label>
                  {hasKey
                    ? <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><CheckCircle2 className="w-3 h-3" /> Saved</span>
                    : <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline">Get an OpenAI key →</a>}
                </div>
                <div className="relative">
                  <Input
                    type={keyVisible ? "text" : "password"}
                    value={settings.ai_text_api_key || ""}
                    onChange={e => {
                      update("ai_text_api_key", e.target.value);
                      update("ai_image_api_key", e.target.value);
                    }}
                    onBlur={e => { void saveKeyInline(e.target.value); }}
                    placeholder="sk-proj-…  or  sk-ant-api03-…"
                    className="font-mono text-xs h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setKeyVisible(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {keyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {keyInlineErr && (
                  <p className="mt-1.5 text-[10px] text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {keyInlineErr}
                  </p>
                )}
                {!hasKey && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    OpenAI: <a href="https://platform.openai.com/signup" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">platform.openai.com</a> →
                    Anthropic: <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">console.anthropic.com</a>
                  </p>
                )}
              </div>

              {/* Models */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Text Model</label>
                  <Select value={settings.ai_text_model || (keyIsAnthropic ? "claude-3-haiku-20240307" : "gpt-4o-mini")} onValueChange={v => update("ai_text_model", v)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4o-mini">GPT-4o-mini — fast & cheap</SelectItem>
                      <SelectItem value="gpt-4o">GPT-4o — smarter, 20× cost</SelectItem>
                      <SelectItem value="gpt-3.5-turbo">GPT-3.5-turbo — cheapest OpenAI</SelectItem>
                      <SelectItem value="claude-3-haiku-20240307">Claude 3 Haiku — cheap & fast</SelectItem>
                      <SelectItem value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet — balanced</SelectItem>
                      <SelectItem value="claude-3-opus-20240229">Claude 3 Opus — best quality</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Image Model (OpenAI only)</label>
                  <Select value={settings.ai_image_model || "dall-e-3"} onValueChange={v => update("ai_image_model", v)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dall-e-3">DALL-E 3 — best quality</SelectItem>
                      <SelectItem value="dall-e-2">DALL-E 2 — cheaper</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Cost hint */}
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                <Info className="w-3 h-3 inline mr-1" />
                Typical cost: GPT-4o-mini ~₹0.01/call · Claude Haiku ~₹0.25/call · DALL-E 3 ~₹3.5/image
              </div>

              {/* Advanced toggle */}
              <button
                type="button"
                onClick={() => setShowAdvanced(v => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
              >
                {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Advanced — custom API endpoint (Azure, OpenRouter, local LLM)
              </button>

              {showAdvanced && (
                <div className="space-y-3 pt-1 border-t border-border/40">
                  <div className="rounded-lg bg-blue-50/60 border border-blue-100 px-3 py-2 text-[11px] text-blue-700">
                    <Info className="w-3 h-3 inline mr-1" />
                    Only fill these if you&apos;re using a custom OpenAI-compatible endpoint. Leave blank for stock OpenAI. Anthropic uses the official SDK and ignores these fields.
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Text API URL</label>
                    <Input
                      value={settings.ai_text_api_url || ""}
                      onChange={e => update("ai_text_api_url", e.target.value)}
                      placeholder="https://api.openai.com/v1/chat/completions"
                      className="font-mono text-xs h-9"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Image API URL</label>
                    <Input
                      value={settings.ai_image_api_url || ""}
                      onChange={e => update("ai_image_api_url", e.target.value)}
                      placeholder="https://api.openai.com/v1/images/generations"
                      className="font-mono text-xs h-9"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Custom Model Name (overrides dropdown)</label>
                    <Input
                      value={settings.ai_text_model || ""}
                      onChange={e => update("ai_text_model", e.target.value)}
                      placeholder="e.g. gpt-4o, claude-3-haiku-20240307"
                      className="text-xs h-9"
                    />
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Brand knowledge base */}
          <Card>
            <SectionTitle
              icon={BookOpen}
              title="Brand Rules"
              description="Injected into every AI call. Define your brand voice, occasion context, and what to always mention."
            />
            <textarea
              value={settings.ai_knowledge_base || ""}
              onChange={e => update("ai_knowledge_base", e.target.value)}
              placeholder={`Gifteeng is a premium Indian gifting brand.\nAlways mention personalization options.\nUse warm, celebratory tone for Indian occasions (Diwali, birthdays, weddings).\nHighlight same-day delivery and quality craftsmanship.\nTarget: urban Indians aged 22–45 who value thoughtful gifting.`}
              rows={6}
              className="w-full rounded-lg border border-border/50 bg-background p-3 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </Card>

          {/* Blocked topics */}
          <Card>
            <SectionTitle
              icon={Ban}
              title="Blocked Topics"
              description="Words the AI must never mention in any output."
            />
            <textarea
              value={settings.ai_blocked_topics || ""}
              onChange={e => update("ai_blocked_topics", e.target.value)}
              placeholder="competitor names, alcohol, adult content..."
              rows={2}
              className="w-full rounded-lg border border-border/50 bg-background p-3 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </Card>

        </TabsContent>

        {/* ════════════════════════════════
            TAB 2 — PROMPTS
        ════════════════════════════════ */}
        <TabsContent value="prompts" className="space-y-4 mt-5">

          <Card>
            <SectionTitle
              icon={Settings2}
              title="Global System Prompt"
              description="Base instruction for all text generation. Leave empty to use the built-in default."
            />
            <textarea
              value={settings.ai_text_system_prompt || ""}
              onChange={e => update("ai_text_system_prompt", e.target.value)}
              placeholder="You are a product copywriter for Gifteeng, an Indian e-commerce personalised gifting store…"
              rows={4}
              className="w-full rounded-lg border border-border/50 bg-background p-3 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </Card>

          <Card>
            <SectionTitle
              icon={PenLine}
              title="Per-Field Prompts"
              description="Customize instructions per product field. Leave empty to use defaults."
            />
            <div className="space-y-3">
              {FIELD_PROMPTS.map(field => {
                const Icon = field.icon;
                const hasCustom = !!settings[field.key];
                return (
                  <div key={field.key} className="rounded-lg border border-border/40 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b border-border/30">
                      <Icon className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-medium flex-1">{field.label}</span>
                      {hasCustom && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">Custom</span>
                      )}
                    </div>
                    <textarea
                      value={settings[field.key] || ""}
                      onChange={e => update(field.key, e.target.value)}
                      placeholder={field.default}
                      className="w-full bg-background p-3 text-xs font-mono min-h-[56px] leading-relaxed focus:outline-none resize-y border-0"
                    />
                  </div>
                );
              })}
            </div>
          </Card>

        </TabsContent>

        {/* ════════════════════════════════
            TAB 3 — TEST (with diagnostic!)
        ════════════════════════════════ */}
        <TabsContent value="test" className="space-y-4 mt-5">

          {/* Diagnostic — what the server actually sees */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <SectionTitle icon={Activity} title="Server Diagnostic" description="Exactly what the API sees right now" />
              <button onClick={() => void loadDiagnostic()} className="text-[10px] text-primary hover:underline">Refresh</button>
            </div>
            {!diagnostic ? (
              <p className="text-[11px] text-muted-foreground">Loading diagnostic…</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] font-mono">
                <span className="text-muted-foreground">Key configured:</span>
                <span className={diagnostic.keyConfigured ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>
                  {diagnostic.keyConfigured ? "yes" : "NO — save a key in Setup tab"}
                </span>

                <span className="text-muted-foreground">Key source:</span>
                <span>{diagnostic.keySource} {diagnostic.keyPrefix && `(${diagnostic.keyPrefix}, ${diagnostic.keyLength} chars)`}</span>

                <span className="text-muted-foreground">Provider:</span>
                <span className={diagnostic.provider === "anthropic" ? "text-orange-600" : "text-sky-600"}>{diagnostic.provider}</span>

                <span className="text-muted-foreground">Text model:</span>
                <span>{diagnostic.textModel}</span>

                <span className="text-muted-foreground">Text API URL:</span>
                <span className="truncate" title={diagnostic.textApiUrl}>{diagnostic.textApiUrl || "(SDK default)"}</span>

                <span className="text-muted-foreground">Image model:</span>
                <span>{diagnostic.imageModel}</span>

                <span className="text-muted-foreground">Knowledge base:</span>
                <span>{diagnostic.hasKnowledgeBase ? "✓ loaded" : "empty"}</span>

                <span className="text-muted-foreground">System prompt:</span>
                <span>{diagnostic.hasSystemPrompt ? "✓ custom" : "using default"}</span>
              </div>
            )}
          </Card>

          {/* Status bar */}
          {!hasKey && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-amber-800">No API key configured</p>
                <p className="text-[11px] text-amber-700 mt-0.5">Add your key in the Setup tab to enable AI features.</p>
              </div>
              <Button size="sm" onClick={() => setActiveTab("setup")} className="shrink-0 text-xs h-7 bg-amber-600 hover:bg-amber-700 text-white">
                Set up →
              </Button>
            </div>
          )}

          {/* Test cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Text AI */}
            <Card className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center ring-1 ring-violet-100">
                  <Wand2 className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Text AI</p>
                  <p className="text-[11px] text-muted-foreground">Generates a sample product title</p>
                </div>
              </div>
              <Button
                onClick={testText}
                disabled={testingText}
                variant="outline"
                className="w-full gap-2 h-9 text-xs"
              >
                {testingText ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {testingText ? "Generating…" : "Run Test"}
              </Button>
              {textResult && (
                textResult.ok ? (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-2">
                    <p className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> AI is working!
                    </p>
                    <p className="text-xs text-gray-800 font-medium leading-snug">{textResult.text}</p>
                    <button onClick={copyText} className="text-[10px] text-emerald-600 hover:underline">
                      {copied ? "✓ Copied" : "Copy"}
                    </button>
                  </div>
                ) : (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-1.5">
                    <p className="text-[10px] font-semibold text-red-700 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Test failed
                    </p>
                    <p className="text-xs text-red-700 leading-relaxed whitespace-pre-wrap">{textResult.text}</p>
                    {textResult.detail && (
                      <details className="text-[10px] text-red-600">
                        <summary className="cursor-pointer hover:underline">Show raw response</summary>
                        <pre className="mt-1 p-2 bg-red-100 rounded overflow-x-auto">{textResult.detail}</pre>
                      </details>
                    )}
                  </div>
                )
              )}
            </Card>

            {/* Image AI */}
            <Card className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-pink-50 flex items-center justify-center ring-1 ring-pink-100">
                  <ImagePlus className="w-5 h-5 text-pink-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Image AI</p>
                  <p className="text-[11px] text-muted-foreground">Generates a sample product image</p>
                </div>
              </div>
              <Button
                onClick={testImage}
                disabled={testingImage}
                variant="outline"
                className="w-full gap-2 h-9 text-xs"
              >
                {testingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                {testingImage ? "Generating…" : "Run Test"}
              </Button>
              {imageResult && (
                imageResult.ok && imageResult.url ? (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Image generated!
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageResult.url} alt="AI generated" className="w-full rounded-xl border border-border/40" />
                    <a href={imageResult.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline block">
                      Open full size →
                    </a>
                  </div>
                ) : (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                    <p className="text-[10px] font-semibold text-red-700 flex items-center gap-1 mb-1">
                      <AlertCircle className="w-3 h-3" /> Test failed
                    </p>
                    <p className="text-xs text-red-700 leading-relaxed whitespace-pre-wrap">{imageResult.err}</p>
                  </div>
                )
              )}
            </Card>
          </div>

        </TabsContent>
      </Tabs>
    </div>
  );
}
