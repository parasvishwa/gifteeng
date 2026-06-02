import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { Prisma } from "@gifteeng/db";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import { AiService } from "../ai/ai.service";
import { sanitizeHtml, sanitizeCss } from "../../common/sanitize-html";

/**
 * Walk a settings value and sanitize any embedded admin-supplied HTML/CSS
 * before it lands in the DB. Homepage-config sections of type `custom-html`
 * carry { html, css } strings that we currently render via
 * `dangerouslySetInnerHTML` on the public storefront — without this guard
 * a content_editor could persist a `<script>alert(1)</script>` and have it
 * execute in every shopper's browser. See SECURITY_AUDIT.md H-1.
 */
function sanitizeSettingsValue(key: string, value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => sanitizeSettingsValue(key, v));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "html" && typeof v === "string") {
        out[k] = sanitizeHtml(v);
      } else if (k === "css" && typeof v === "string") {
        out[k] = sanitizeCss(v);
      } else {
        out[k] = sanitizeSettingsValue(key, v);
      }
    }
    return out;
  }
  return value;
}

const upsertSchema = z.object({ value: z.any() });

@ApiTags("admin-settings")
@ApiBearerAuth()
@UseGuards(JwtB2bGuard, RolesGuard)
@Roles("super_admin")
@Controller("admin/settings")
export class SettingsController {
  constructor(
    private prisma: PrismaService,
    private ai: AiService,
  ) {}

  @Get()
  async all(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.siteSetting.findMany();
    const out: Record<string, unknown> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  }

  @Get(":key")
  async one(@Param("key") key: string) {
    return this.prisma.siteSetting.findUnique({ where: { key } });
  }

  @Patch(":key")
  async upsert(
    @Param("key") key: string,
    @Body(new ZodValidationPipe(upsertSchema)) body: { value: unknown },
  ) {
    // Recursively sanitize any embedded { html, css } admin content.
    const cleaned = sanitizeSettingsValue(key, body.value) as Prisma.InputJsonValue;
    const result = await this.prisma.siteSetting.upsert({
      where: { key },
      create: { key, value: cleaned },
      update: { value: cleaned },
    });
    // Bust AiService settings cache so newly-saved ai_* keys take effect
    // immediately on the very next /api/ai/write call.
    if (key.startsWith("ai_")) {
      this.ai.clearSettingsCache();
    }
    return result;
  }
}
