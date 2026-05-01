import { Controller, Get, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";

import { RealtimeService } from "./realtime.service";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";

/**
 * GET /api/me/events — Server-Sent Events stream for the logged-in
 * customer. The stream emits:
 *
 *   event: ready
 *   data: {"at":"…"}                       ← fired once on connect
 *
 *   event: invalidate
 *   data: {"scope":"cart|wishlist|goins|orders|profile","at":"…"}
 *
 *   : ping <ts>                            ← every 25 s, keep-alive
 *
 * Web uses `EventSource("/api/me/events")`, Flutter consumes it via a
 * streaming HTTP client. Both clients react to `invalidate` events by
 * refetching the matching local provider.
 */
@ApiTags("realtime")
@Controller()
export class RealtimeController {
  constructor(private readonly realtime: RealtimeService) {}

  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("me/events")
  events(@Req() req: Request & { user?: { customerId?: string } }, @Res() res: Response) {
    const customerId = req.user?.customerId;
    if (!customerId) {
      res.status(401).end("unauthenticated");
      return;
    }
    const teardown = this.realtime.attach(customerId, res);
    req.on("close", teardown);
    req.on("error", teardown);
  }

  /**
   * Global content broadcast stream — no auth required.
   *
   * Anonymous visitors and logged-in customers both connect here to
   * receive catalog / category / collection / customizer / banner
   * change notifications. Logged-in clients also keep a separate
   * per-customer connection at /me/events for cart / wishlist /
   * goins / orders.
   */
  @Get("public/events")
  publicEvents(@Req() req: Request, @Res() res: Response) {
    const teardown = this.realtime.attachGlobal(res);
    req.on("close", teardown);
    req.on("error", teardown);
  }
}
