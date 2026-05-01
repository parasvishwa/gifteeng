import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { AiService } from "../ai/ai.service";

@ApiTags("admin-ai")
@ApiBearerAuth()
@UseGuards(JwtB2bGuard, RolesGuard)
@Roles("super_admin", "sales_admin")
@Controller("admin/ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  /**
   * Single-field text generation — used by the Create Product modal "AI Generate" button.
   * Delegates to AiService so the DB-configured OpenAI key + custom model are used.
   */
  @Post("write")
  async write(
    @Body() body: { prompt: string; field?: string; context?: string },
  ): Promise<{ text: string }> {
    return this.ai.write(body);
  }

  /**
   * Full SEO bundle generation — returns all SEO fields in one call.
   * Runs 6 parallel AiService.write() calls so every field uses the correct
   * field-specific instruction from FIELD_INSTRUCTIONS in ai.service.ts.
   */
  @Post("generate-seo")
  async generateSeo(
    @Body() body: { keyword: string; context?: string },
  ): Promise<{
    title: string;
    description: string;
    bullets: string[];
    metaTitle: string;
    metaDescription: string;
    keywords: string[];
  }> {
    const { keyword, context } = body;

    const [titleRes, descRes, bulletsRes, metaTitleRes, metaDescRes, keywordsRes] =
      await Promise.all([
        this.ai.write({ prompt: keyword, field: "title",               context }),
        this.ai.write({ prompt: keyword, field: "description",         context }),
        this.ai.write({ prompt: keyword, field: "seo_bullets",         context }),
        this.ai.write({ prompt: keyword, field: "seo_meta_title",      context }),
        this.ai.write({ prompt: keyword, field: "seo_meta_description", context }),
        this.ai.write({ prompt: keyword, field: "seo_keywords",        context }),
      ]);

    // seo_bullets returns a JSON array: ["Feature one", "Feature two", ...]
    let bullets: string[] = [];
    try {
      const parsed = JSON.parse(bulletsRes.text);
      bullets = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      // Fallback: strip bullet chars and split by newline
      bullets = bulletsRes.text
        .split("\n")
        .map((l) => l.replace(/^[•\-\*]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 5);
    }

    // seo_keywords returns comma-separated on a single line
    const keywords = keywordsRes.text
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    return {
      title:           titleRes.text,
      description:     descRes.text,
      bullets,
      metaTitle:       metaTitleRes.text,
      metaDescription: metaDescRes.text,
      keywords,
    };
  }
}
