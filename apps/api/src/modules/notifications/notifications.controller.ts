import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { NotificationsService } from "./notifications.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const registerTokenSchema = z.object({
  token:      z.string().min(10).max(4096),
  platform:   z.enum(["android", "ios", "web"]),
  appVersion: z.string().max(60).optional(),
  deviceName: z.string().max(120).optional(),
});

const unregisterTokenSchema = z.object({
  token: z.string().min(10).max(4096),
});

const broadcastSchema = z.object({
  title:    z.string().min(1).max(120),
  body:     z.string().min(1).max(500),
  data:     z.record(z.string()).optional(),
  platform: z.enum(["android", "ios", "web"]).optional(),
});

@ApiTags("notifications")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // ─── Admin inbox (existing endpoints, now scoped to admin guards) ───────

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "production", "hr_admin")
  @Get()
  list(
    @Query("recipient") recipient?: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.notifications.listInbox({
      recipient,
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "production", "hr_admin")
  @Patch(":id/mark-read")
  markRead(@Param("id") id: string) {
    return this.notifications.markRead(id);
  }

  // ─── Push: device token registration (mobile → backend) ────────────────

  /**
   * POST /api/notifications/register-token
   * Called from the mobile app after getting the FCM token. Upserts by token
   * so re-installs or token rotations stay clean.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("register-token")
  registerToken(
    @Req() req: any,
    @Body(new ZodValidationPipe(registerTokenSchema))
    body: z.infer<typeof registerTokenSchema>,
  ) {
    const customerId = req.user?.customerId ?? req.user?.sub;
    return this.notifications.registerDeviceToken(customerId, body);
  }

  /**
   * POST /api/notifications/unregister-token
   * Called on logout to stop pushing to the device.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("unregister-token")
  unregisterToken(
    @Req() req: any,
    @Body(new ZodValidationPipe(unregisterTokenSchema))
    body: z.infer<typeof unregisterTokenSchema>,
  ) {
    const customerId = req.user?.customerId ?? req.user?.sub;
    return this.notifications.unregisterDeviceToken(customerId, body.token);
  }

  // ─── Push: admin broadcast ──────────────────────────────────────────────

  /**
   * POST /api/admin/notifications/broadcast
   * Fan-out push to every registered device (optionally filtered by platform).
   * Super-admin only — be careful.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("admin/broadcast")
  broadcast(
    @Body(new ZodValidationPipe(broadcastSchema))
    body: z.infer<typeof broadcastSchema>,
  ) {
    return this.notifications.broadcast(body);
  }
}
