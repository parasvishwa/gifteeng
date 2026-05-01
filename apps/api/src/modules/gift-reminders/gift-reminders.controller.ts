import {
  Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { GiftRemindersService } from "./gift-reminders.service";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const upsertSchema = z.object({
  occasion:            z.string().min(1).max(40),
  recipientName:       z.string().max(120).nullable().optional(),
  eventDate:           z.string().datetime(),
  recurring:           z.boolean().optional(),
  notifyDaysBefore:    z.number().int().min(0).max(60).optional(),
  budgetMin:           z.number().int().min(0).nullable().optional(),
  budgetMax:           z.number().int().min(0).nullable().optional(),
  preferredCategoryId: z.string().uuid().nullable().optional(),
  productId:           z.string().uuid().nullable().optional(),
  autoOrder:           z.boolean().optional(),
  savedAddressId:      z.string().uuid().nullable().optional(),
  note:                z.string().max(500).nullable().optional(),
  active:              z.boolean().optional(),
});

const patchSchema = upsertSchema.partial();

@ApiTags("gift-reminders")
@Controller()
export class GiftRemindersController {
  constructor(private readonly service: GiftRemindersService) {}

  // ─── Customer CRUD (own reminders) ───────────────────────────────────────

  /** GET /api/gift-reminders — list the caller's reminders */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("gift-reminders")
  list(@Req() req: any) {
    return this.service.listMine(req.user.customerId as string);
  }

  /** POST /api/gift-reminders — create a reminder */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("gift-reminders")
  create(
    @Req() req: any,
    @Body(new ZodValidationPipe(upsertSchema))
    body: z.infer<typeof upsertSchema>,
  ) {
    return this.service.create(req.user.customerId as string, body);
  }

  /** PATCH /api/gift-reminders/:id */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Patch("gift-reminders/:id")
  update(
    @Req() req: any,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(patchSchema))
    body: z.infer<typeof patchSchema>,
  ) {
    return this.service.update(
      req.user.customerId as string,
      id,
      body,
    );
  }

  /** DELETE /api/gift-reminders/:id */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Delete("gift-reminders/:id")
  remove(@Req() req: any, @Param("id") id: string) {
    return this.service.remove(req.user.customerId as string, id);
  }

  // ─── Admin daily cron ────────────────────────────────────────────────────

  /**
   * POST /api/admin/gift-reminders/run-daily
   *
   * Scans every active reminder and dispatches notifications (and, when
   * configured, auto-order prompts) for occasions within the next N days.
   *
   * Hook this to your infra's scheduler (Vercel Cron / Render Cron /
   * GitHub Actions workflow_schedule / etc.) at ~08:00 IST. Idempotent
   * within a 24h window (dedup via lastNotifiedAt).
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("admin/gift-reminders/run-daily")
  runDaily() {
    return this.service.runDaily();
  }
}
