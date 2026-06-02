import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { HeroBannersService, HeroBannerInput } from "./hero-banners.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { PermissionsGuard, RequirePermissions } from "../auth-b2b/permissions.guard";
import { PERMISSIONS } from "../auth-b2b/permissions";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const bannerSchema = z.object({
  imageUrl:      z.string().min(1).max(500).optional(),
  linkUrl:       z.string().min(1).max(500).optional(),
  placement:     z.string().min(1).max(40).optional(),
  altText:       z.string().max(200).nullable().optional(),
  startsAt:      z.string().nullable().optional(),
  endsAt:        z.string().nullable().optional(),
  sortOrder:     z.number().int().optional(),
  isActive:      z.boolean().optional(),
  // Per-banner text overlay
  tagline:       z.string().max(80).nullable().optional(),
  heading:       z.string().max(160).nullable().optional(),
  headingAccent: z.string().max(80).nullable().optional(),
  subtitle:      z.string().max(240).nullable().optional(),
  button1Text:   z.string().max(40).nullable().optional(),
  button1Link:   z.string().max(500).nullable().optional(),
  button2Text:   z.string().max(40).nullable().optional(),
  button2Link:   z.string().max(500).nullable().optional(),
  // Per-banner color overrides — CSS color/gradient strings.
  textBgColor:   z.string().max(120).nullable().optional(),
  textColor:     z.string().max(40).nullable().optional(),
  accentColor:   z.string().max(40).nullable().optional(),
  buttonColor:   z.string().max(40).nullable().optional(),
});

const reorderSchema = z.object({
  placement: z.string().min(1).max(40),
  ids:       z.array(z.string().uuid()).min(1).max(50),
});

@ApiTags("hero-banners")
@Controller()
export class HeroBannersController {
  constructor(private readonly service: HeroBannersService) {}

  // ── Public — used by web + Flutter ──────────────────────────────────────

  /**
   * GET /api/banners?placement=home
   *
   * Returns active, time-windowed, sort-ordered banners. Single source of
   * truth for both web HeroSlider and Flutter home carousel.
   */
  @Get("banners")
  list(@Query("placement") placement?: string) {
    return this.service.listActive(placement ?? "home");
  }

  // ── Admin CRUD ──────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard, PermissionsGuard)
  @Roles("super_admin", "sales_admin", "hr_admin", "production", "employee")
  @RequirePermissions(PERMISSIONS.HERO_BANNERS_VIEW)
  @Get("admin/banners")
  adminList(@Query("placement") placement?: string) {
    return this.service.listAll(placement);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard, PermissionsGuard)
  @Roles("super_admin", "sales_admin", "hr_admin", "production", "employee")
  @RequirePermissions(PERMISSIONS.HERO_BANNERS_EDIT)
  @Post("admin/banners")
  create(@Body(new ZodValidationPipe(bannerSchema)) body: HeroBannerInput) {
    return this.service.create(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard, PermissionsGuard)
  @Roles("super_admin", "sales_admin", "hr_admin", "production", "employee")
  @RequirePermissions(PERMISSIONS.HERO_BANNERS_EDIT)
  @Patch("admin/banners/reorder")
  reorder(@Body(new ZodValidationPipe(reorderSchema)) body: { placement: string; ids: string[] }) {
    return this.service.reorder(body.placement, body.ids);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard, PermissionsGuard)
  @Roles("super_admin", "sales_admin", "hr_admin", "production", "employee")
  @RequirePermissions(PERMISSIONS.HERO_BANNERS_EDIT)
  @Patch("admin/banners/:id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(bannerSchema)) body: HeroBannerInput,
  ) {
    return this.service.update(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard, PermissionsGuard)
  @Roles("super_admin", "sales_admin", "hr_admin", "production", "employee")
  @RequirePermissions(PERMISSIONS.HERO_BANNERS_EDIT)
  @Delete("admin/banners/:id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}
