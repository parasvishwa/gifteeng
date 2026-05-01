import { Body, Controller, Get, HttpException, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AiService, AiWriteBody, AiImageBody, AiDiagnostic } from "./ai.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

@ApiTags("ai")
@Controller("ai")
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * POST /api/ai/write
   * Generate text using the configured provider (OpenAI or Anthropic auto-detected from key).
   * Body: { prompt, field?, context? }
   *
   * NOTE: Never throws — errors are returned in the `text` field prefixed with "⚠️"
   * so the frontend can surface them directly.
   */
  @Post("write")
  async write(@Body() body: AiWriteBody) {
    return this.aiService.write(body);
  }

  /**
   * GET /api/ai/diagnostic
   * Returns what the server sees in AI settings (no secrets leaked).
   * Used by the AI Settings → Test tab to surface silent misconfigurations.
   */
  @Get("diagnostic")
  async diagnostic(): Promise<AiDiagnostic> {
    return this.aiService.getDiagnostic();
  }

  /**
   * POST /api/ai/generate-image
   * Generate an image using DALL-E 3 (OpenAI-only — Anthropic doesn't support images).
   * Body: { prompt, quality?, style?, size? }
   * Requires super_admin role.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("generate-image")
  async generateImage(@Body() body: AiImageBody) {
    try {
      return await this.aiService.generateImage(body);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpException({ message: msg }, HttpStatus.BAD_GATEWAY);
    }
  }
}
