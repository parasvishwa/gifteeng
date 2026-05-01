import { Controller, Get, Post, Body, Param, Req, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { z } from "zod";
import { DuetService } from "./duet.service";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const createSchema = z.object({ orderId: z.string().uuid() });

@ApiTags("duet")
@Controller("duet")
export class DuetController {
  constructor(private service: DuetService) {}

  /** POST /api/duet/create — sender generates invite */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("create")
  create(
    @Req() req: any,
    @Body(new ZodValidationPipe(createSchema))
    body: z.infer<typeof createSchema>,
  ) {
    return this.service.createInvite(req.user.customerId as string, body.orderId);
  }

  /** GET /api/duet/:token — public read */
  @Get(":token")
  get(@Param("token") token: string) {
    return this.service.getByToken(token);
  }

  /** POST /api/duet/:token/claim — authenticated claim */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post(":token/claim")
  claim(@Req() req: any, @Param("token") token: string) {
    return this.service.claim(token, req.user.customerId as string);
  }

  /** GET /api/duet/mine — user's history */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("mine/history")
  mine(@Req() req: any) {
    return this.service.listMine(req.user.customerId as string);
  }
}
