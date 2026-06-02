import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface AiCustomizerInput {
  productId: string;
  prompt?: string;
  occasion?: string;
  recipientName?: string;
  style?: string;
}

export interface DesignSuggestion {
  id: string;
  prompt: string;
  seed: number;
  previewNote: string;
}

// ── Heuristic look-up tables ────────────────────────────────────────────────
// These are deterministic fallbacks that give the mobile canvas engine
// a well-shaped response while real AI generation is wired in.
// TODO: Replace with actual AI SDK call (e.g. OpenAI / Gemini) once the
//       API key and rate-limit strategy are confirmed.

const OCCASION_THEMES: Record<string, string[]> = {
  birthday:    ["warm celebration", "festive confetti", "golden sparkle"],
  anniversary: ["romantic rose", "golden elegance", "timeless love"],
  wedding:     ["ivory floral", "champagne gold", "soft blush"],
  graduation:  ["bold achievement", "academic blue", "bright future"],
  christmas:   ["festive red & green", "winter warmth", "snowy serenity"],
  diwali:      ["vibrant rangoli", "golden lantern", "royal jewel tones"],
  baby:        ["soft pastel", "playful nursery", "gentle bloom"],
  corporate:   ["clean minimal", "professional navy", "executive gold"],
};

const STYLE_MODIFIERS: Record<string, string> = {
  minimal:    "clean lines, lots of whitespace, single accent colour",
  bold:       "high contrast, thick typography, vibrant saturated palette",
  elegant:    "serif typeface, muted gold tones, generous spacing",
  playful:    "rounded shapes, bright colours, hand-drawn elements",
  vintage:    "distressed texture, muted earth tones, retro serif",
  modern:     "geometric shapes, sans-serif, cool neutral palette",
};

function pickThemes(occasion?: string): string[] {
  const key = (occasion ?? "").toLowerCase().trim();
  return OCCASION_THEMES[key] ?? ["heartfelt", "warm tones", "personal touch"];
}

function styleNote(style?: string): string {
  const key = (style ?? "").toLowerCase().trim();
  return STYLE_MODIFIERS[key] ?? "balanced layout, approachable colour palette";
}

function deterministicSeed(productId: string, index: number): number {
  // Simple hash so the same product+index always produces the same seed —
  // useful for cache consistency and mobile preview stability.
  let h = index * 2654435761;
  for (let i = 0; i < productId.length; i++) {
    h = Math.imul(h ^ productId.charCodeAt(i), 2654435761);
  }
  return Math.abs(h >>> 0) % 999_999;
}

@Injectable()
export class AiCustomizerService {
  constructor(private prisma: PrismaService) {}

  async generateSuggestions(input: AiCustomizerInput): Promise<{ suggestions: DesignSuggestion[] }> {
    // 1. Resolve product — we only need title and category for prompt building.
    const product = await this.prisma.product.findUnique({
      where: { id: input.productId },
      select: { title: true, category: true },
    });

    if (!product) {
      throw new NotFoundException(`Product ${input.productId} not found`);
    }

    const productLabel = product.title ?? "gift";
    const categoryLabel = typeof product.category === "string"
      ? product.category
      : (product.category as { name?: string } | null)?.name ?? "gift";

    // 2. Build per-suggestion prompts from heuristic tables.
    const themes    = pickThemes(input.occasion);
    const styleMod  = styleNote(input.style);
    const recipient = input.recipientName ? ` for ${input.recipientName}` : "";
    const occasion  = input.occasion ? ` (${input.occasion})` : "";
    const userHint  = input.prompt ? ` User note: "${input.prompt}".` : "";

    const suggestions: DesignSuggestion[] = themes.slice(0, 3).map((theme, i) => ({
      id:   `sug_${input.productId}_${i}`,
      seed: deterministicSeed(input.productId, i),
      prompt: [
        `Design a personalised ${categoryLabel}${occasion}${recipient}.`,
        `Theme: ${theme}.`,
        `Style: ${styleMod}.`,
        `Product: ${productLabel}.`,
        userHint,
        "Render high-quality, print-ready at 300 dpi.",
      ].filter(Boolean).join(" ").trim(),
      previewNote: `${theme} — ${styleMod}`,
    }));

    // 4th suggestion: user-driven freestyle (if a free-text prompt was supplied).
    if (input.prompt) {
      suggestions.push({
        id:   `sug_${input.productId}_custom`,
        seed: deterministicSeed(input.productId, 99),
        prompt: [
          `Design a personalised ${categoryLabel}${recipient}.`,
          `Custom instruction: "${input.prompt}".`,
          `Style: ${styleMod}.`,
          "Render high-quality, print-ready at 300 dpi.",
        ].join(" "),
        previewNote: `Custom — based on your description`,
      });
    }

    return { suggestions };
  }
}
