import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { CustomPagesService } from "./custom-pages.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const createSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  html_content: z.string().optional(),
  is_published: z.boolean().optional(),
});

const updateSchema = createSchema
  .partial()
  .extend({ updated_at: z.string().optional() });

// ──────────────────────────────────────────────────────────────────────────
// Public read-only endpoint — no auth, only returns published pages.
// Lives at /api/custom-pages/by-slug/:slug so the web app's /page/[slug]
// SSR route can render CMS-managed copy without needing an admin token.
// ──────────────────────────────────────────────────────────────────────────
@ApiTags("custom-pages-public")
@Controller("custom-pages")
export class PublicCustomPagesController {
  constructor(private readonly customPages: CustomPagesService) {}

  @Get("by-slug/:slug")
  async bySlug(@Param("slug") slug: string) {
    const rows = await this.customPages.findAll(slug);
    const match = rows.find((p) => p.slug === slug && p.is_published);
    if (!match) throw new NotFoundException();
    return match;
  }
}

@ApiTags("custom-pages")
@ApiBearerAuth()
@UseGuards(JwtB2bGuard, RolesGuard)
@Roles("super_admin")
@Controller("admin/custom-pages")
export class CustomPagesController {
  constructor(private readonly customPages: CustomPagesService) {}

  @Get()
  findAll(@Query("search") search?: string) {
    return this.customPages.findAll(search);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.customPages.findOne(id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createSchema))
  create(@Body() body: z.infer<typeof createSchema>) {
    return this.customPages.create(body);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>,
  ) {
    return this.customPages.update(id, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.customPages.remove(id);
  }

  /**
   * POST /api/admin/custom-pages/seed — one-shot seed of the six default
   * static pages (Privacy, ToS, Shipping, Returns, About, Contact).
   * Idempotent: skips any slug that already exists.
   */
  @Post("seed")
  seed() {
    return this.customPages.seedDefaults();
  }
}
