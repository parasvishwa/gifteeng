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
    const result = await this.prisma.siteSetting.upsert({
      where: { key },
      create: { key, value: body.value as Prisma.InputJsonValue },
      update: { value: body.value as Prisma.InputJsonValue },
    });
    // Bust AiService settings cache so newly-saved ai_* keys take effect
    // immediately on the very next /api/ai/write call.
    if (key.startsWith("ai_")) {
      this.ai.clearSettingsCache();
    }
    return result;
  }
}
