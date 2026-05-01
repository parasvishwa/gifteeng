import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import { PrismaService } from "../../prisma/prisma.service";

export interface AiWriteBody {
  prompt: string;
  field?: string;
  context?: string;
}

export interface AiWriteResult {
  text: string;
}

export interface AiImageBody {
  prompt: string;
  quality?: "standard" | "hd";
  style?: "vivid" | "natural";
  size?: "1024x1024" | "1792x1024" | "1024x1792";
  // Optional reference image URL. When present we switch to the OpenAI
  // /images/edits endpoint with gpt-image-1 so the generated image keeps
  // the same subject (product) as the reference — essential for e-comm
  // angle/lifestyle shots where text-to-image wouldn't match the SKU.
  referenceImageUrl?: string;
}

export interface AiImageResult {
  url: string;
}

export interface AiDiagnostic {
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
}

// ── Settings cache (short TTL so saves take effect quickly) ─────────────────

interface SettingsCache { data: Record<string, string>; at: number; }
let _cache: SettingsCache | null = null;
const CACHE_TTL_MS = 5_000;

// ── Field system instructions ─────────────────────────────────────────────────

const FIELD_INSTRUCTIONS: Record<string, string> = {
  seo_title:
    "Generate an SEO-friendly product listing title. Maximum 60 characters. Use title case. Include the main keyword naturally. Return only the title text.",
  seo_description:
    "Write a compelling product description of approximately 150 words. Use clear, engaging language. Highlight benefits, personalization options, and gifting value. Target Indian e-commerce customers. Return plain text paragraphs only.",
  seo_bullets:
    'Generate exactly 5 bullet points highlighting key product features. Each bullet should be concise (10-15 words max). Return them as a JSON array of strings, e.g. ["Feature one", "Feature two", ...]',
  seo_meta_title:
    "Write an SEO meta title. Maximum 60 characters. Must include the primary keyword. Return only the meta title text.",
  seo_meta_description:
    "Write an SEO meta description. Maximum 160 characters. Include a call-to-action and primary keyword. Return only the meta description text.",
  seo_keywords:
    "Generate exactly 10 SEO keywords relevant to the product. Return them as a comma-separated list on a single line.",
  title:
    "Write a catchy, SEO-friendly product title. Max 80 characters. Title case. Return only the title.",
  description:
    "Write a compelling product description in 150-300 words. Return plain text.",
  meta_title: "Write an SEO meta title. Max 60 characters. Return only the title.",
  meta_description:
    "Write an SEO meta description. Max 160 characters. Include a call-to-action. Return only the description.",
  features: "Generate 5 short product feature bullet points. Return as JSON array of strings.",
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  // ── Settings ────────────────────────────────────────────────────────────────

  private async getSettings(): Promise<Record<string, string>> {
    if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) return _cache.data;
    const rows = await this.prisma.siteSetting.findMany({
      where: { key: { startsWith: "ai_" } },
    });
    const data: Record<string, string> = {};
    for (const r of rows) {
      const v = r.value;
      data[r.key] =
        typeof v === "string"
          ? v.replace(/^"|"$/g, "") // strip JSON-string quotes
          : typeof v === "object" && v !== null
          ? JSON.stringify(v)
          : String(v);
    }
    _cache = { data, at: Date.now() };
    return data;
  }

  /** Public — lets SettingsController bust the cache after a save. */
  public clearSettingsCache() {
    _cache = null;
  }

  // ── Provider resolution ─────────────────────────────────────────────────────

  /**
   * Auto-detects which provider + key + model to use based on what the admin
   * configured. Supports both OpenAI (sk-proj-…, sk-…) and Anthropic (sk-ant-…).
   * Also respects an explicit `ai_text_provider` setting if present.
   */
  private resolveProvider(settings: Record<string, string>): {
    provider: "openai" | "anthropic";
    apiKey: string;
    model: string;
    apiUrl: string;
  } {
    const explicit = (settings.ai_text_provider || "").toLowerCase().trim();
    const dbKey   = (settings.ai_text_api_key || "").trim();
    const envOA   = (this.config.get<string>("OPENAI_API_KEY") || "").trim();
    const envAN   = (this.config.get<string>("ANTHROPIC_API_KEY") || "").trim();
    const model   = (settings.ai_text_model || "").trim();

    const keyLooksAnthropic   = dbKey.startsWith("sk-ant-");
    const modelLooksAnthropic = model.toLowerCase().startsWith("claude");
    const isAnthropic =
      explicit === "anthropic" ||
      keyLooksAnthropic ||
      modelLooksAnthropic ||
      (explicit !== "openai" && !dbKey && !envOA && !!envAN);

    if (isAnthropic) {
      return {
        provider: "anthropic",
        apiKey: (keyLooksAnthropic ? dbKey : "") || envAN,
        model:  model || "claude-3-haiku-20240307",
        apiUrl: "", // SDK handles URL
      };
    }
    return {
      provider: "openai",
      apiKey: dbKey || envOA,
      model:  model || "gpt-4o-mini",
      apiUrl: (settings.ai_text_api_url || "").trim() ||
              "https://api.openai.com/v1/chat/completions",
    };
  }

  // ── Diagnostic (no secret leakage) ──────────────────────────────────────────

  async getDiagnostic(): Promise<AiDiagnostic> {
    const settings = await this.getSettings();
    const { provider, apiKey, model, apiUrl } = this.resolveProvider(settings);
    const dbKey = (settings.ai_text_api_key || "").trim();
    const keySource: "db" | "env" | "none" =
      dbKey && apiKey === dbKey ? "db" : apiKey ? "env" : "none";

    return {
      keyConfigured:    !!apiKey,
      keySource,
      keyPrefix:        apiKey ? apiKey.slice(0, 7) + "…" : null,
      keyLength:        apiKey.length,
      provider,
      textModel:        model,
      textApiUrl:       apiUrl,
      imageModel:       settings.ai_image_model?.trim() || "dall-e-3",
      imageApiUrl:      (settings.ai_image_api_url || "").trim() ||
                        "https://api.openai.com/v1/images/generations",
      hasKnowledgeBase: !!(settings.ai_knowledge_base || "").trim(),
      hasSystemPrompt:  !!(settings.ai_text_system_prompt || "").trim(),
    };
  }

  // ── System prompt builder ───────────────────────────────────────────────────

  private buildSystemPrompt(field?: string, settings: Record<string, string> = {}): string {
    const base =
      settings.ai_text_system_prompt?.trim() ||
      "You are a professional e-commerce copywriter and SEO expert for Gifteeng, an Indian personalized gifting store. Always respond with only the requested content — no preamble, no explanations, no markdown fences unless the format explicitly requires it.";

    const kb = settings.ai_knowledge_base?.trim();
    const blocked = settings.ai_blocked_topics?.trim();

    const parts = [base];
    if (kb) parts.push(`\n\nKnowledge Base & Brand Rules:\n${kb}`);
    if (blocked) parts.push(`\n\nNEVER mention or reference these topics/words: ${blocked}`);

    const fi = field ? FIELD_INSTRUCTIONS[field] : null;
    if (fi) parts.push(`\n\n${fi}`);

    return parts.join("");
  }

  // ── Text generation ─────────────────────────────────────────────────────────

  async write(body: AiWriteBody): Promise<AiWriteResult> {
    const settings = await this.getSettings();
    const { provider, apiKey, model, apiUrl } = this.resolveProvider(settings);
    const systemPrompt = this.buildSystemPrompt(body.field, settings);
    const userContent  = body.context
      ? `${body.prompt}\n\nAdditional context: ${body.context}`
      : body.prompt;

    if (!apiKey) {
      this.logger.warn("No AI key configured (DB or env)");
      return {
        text:
          "⚠️ No API key configured. Go to AI Settings → Setup tab, paste your OpenAI (sk-proj-…) or Anthropic (sk-ant-…) key, and it will auto-save.",
      };
    }

    this.logger.debug(
      `AI write: provider=${provider}, model=${model}, url=${apiUrl}, keyPrefix=${apiKey.slice(
        0,
        7,
      )}, field=${body.field}`,
    );

    try {
      if (provider === "anthropic") {
        return await this.anthropicChat(apiKey, model, systemPrompt, userContent);
      }
      return await this.openAiChat(apiKey, model, apiUrl, systemPrompt, userContent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`AI write failed (${provider}): ${msg}`);
      return { text: `⚠️ AI call failed: ${msg}` };
    }
  }

  private async openAiChat(
    apiKey: string,
    model: string,
    apiUrl: string,
    system: string,
    user: string,
  ): Promise<AiWriteResult> {
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => resp.statusText);
      // Parse OpenAI error JSON for cleaner message
      let clean = err;
      try {
        const j = JSON.parse(err) as { error?: { message?: string } };
        if (j.error?.message) clean = j.error.message;
      } catch { /* raw */ }
      throw new Error(`OpenAI ${resp.status}: ${clean}`);
    }
    const data = (await resp.json()) as any;
    return { text: (data.choices?.[0]?.message?.content as string)?.trim() ?? "" };
  }

  private async anthropicChat(
    apiKey: string,
    model: string,
    system: string,
    user: string,
  ): Promise<AiWriteResult> {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: user }],
    });
    const block = message.content[0];
    const text = block?.type === "text" ? (block as any).text.trim() : "";
    return { text };
  }

  // ── Image generation ────────────────────────────────────────────────────────

  async generateImage(body: AiImageBody): Promise<AiImageResult> {
    const settings = await this.getSettings();
    const dbKey  = (settings.ai_image_api_key || settings.ai_text_api_key || "").trim();
    const envOA  = (this.config.get<string>("OPENAI_API_KEY") || "").trim();
    const apiKey = dbKey || envOA;
    const model  = settings.ai_image_model?.trim() || "dall-e-3";
    const apiUrl = (settings.ai_image_api_url || "").trim() ||
                   "https://api.openai.com/v1/images/generations";
    const stylePrompt = settings.ai_image_rules?.trim() || settings.ai_image_style_prompt?.trim() || "";
    const blocked = settings.ai_blocked_topics?.trim();

    if (!apiKey) {
      throw new Error("No image API key configured. Go to AI Settings → Setup and paste an OpenAI key (Anthropic does not support image generation).");
    }
    if (apiKey.startsWith("sk-ant-")) {
      throw new Error("Image generation requires an OpenAI key. Anthropic Claude does not generate images.");
    }

    const parts: string[] = [];
    if (stylePrompt) parts.push(stylePrompt);
    parts.push(body.prompt);
    if (blocked) parts.push(`Do not include: ${blocked.slice(0, 100)}`);
    const fullPrompt = parts.filter(Boolean).join(". ").slice(0, 4000);

    const quality = body.quality || (settings.ai_image_quality as "standard" | "hd") || "standard";
    const style   = body.style  || (settings.ai_image_style as "vivid" | "natural") || "vivid";
    const size    = body.size   || (settings.ai_image_size as "1024x1024" | "1792x1024" | "1024x1792") || "1024x1024";

    this.logger.debug(`OpenAI image: url=${apiUrl}, model=${model}, quality=${quality}, size=${size}, refImg=${!!body.referenceImageUrl}`);

    // ─── Image-to-image path ─────────────────────────────────────────────
    // When a reference image is provided we call /images/edits with the
    // downloaded reference as multipart input. This keeps the subject
    // consistent (same product, different angle/lifestyle/scale) instead
    // of a generic text-to-image render.
    if (body.referenceImageUrl) {
      try {
        const refResp = await fetch(body.referenceImageUrl);
        if (!refResp.ok) {
          throw new Error(`Reference image fetch failed ${refResp.status}`);
        }
        const refBuf = Buffer.from(await refResp.arrayBuffer());
        const refMime = refResp.headers.get("content-type") || "image/png";
        const form = new FormData();
        // gpt-image-1 is OpenAI's current image-editing model and accepts
        // PNG/JPEG/WebP. Fall back to dall-e-2 if user explicitly set it.
        const editModel = /^dall-e-2/i.test(model) ? "dall-e-2" : "gpt-image-1";
        form.append("model", editModel);
        form.append("prompt", fullPrompt);
        form.append("n", "1");
        form.append("size", size);
        // Wrap buffer as Blob for multipart — fetch+FormData handles boundary.
        form.append("image", new Blob([refBuf], { type: refMime }), "reference.png");
        const editUrl = apiUrl.replace(/\/images\/generations$/, "/images/edits");
        const resp2 = await fetch(editUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        });
        if (!resp2.ok) {
          const err = await resp2.text().catch(() => resp2.statusText);
          let clean = err;
          try {
            const j = JSON.parse(err) as { error?: { message?: string } };
            if (j.error?.message) clean = j.error.message;
          } catch { /* raw */ }
          throw new Error(`OpenAI image-edit ${resp2.status}: ${clean}`);
        }
        const data2 = (await resp2.json()) as any;
        // gpt-image-1 returns base64 in data[0].b64_json (no URL); dall-e-2
        // returns url. Handle both.
        const b64 = data2.data?.[0]?.b64_json as string | undefined;
        if (b64) {
          return { url: `data:image/png;base64,${b64}` };
        }
        const urlOut = (data2.data?.[0]?.url as string) ?? "";
        return { url: urlOut };
      } catch (e) {
        this.logger.warn(`Image-edit failed, falling back to text-to-image: ${(e as Error).message}`);
        // fall through to text-to-image
      }
    }

    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, prompt: fullPrompt, n: 1, size, quality, style }),
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => resp.statusText);
      let clean = err;
      try {
        const j = JSON.parse(err) as { error?: { message?: string } };
        if (j.error?.message) clean = j.error.message;
      } catch { /* raw */ }
      throw new Error(`OpenAI image ${resp.status}: ${clean}`);
    }
    const data = (await resp.json()) as any;
    const url = (data.data?.[0]?.url as string) ?? "";
    return { url };
  }
}
