import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { ReferralsService } from "./referrals.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const claimSchema = z.object({ code: z.string().min(1) });

@ApiTags("referrals")
@Controller("referrals")
export class ReferralsController {
  constructor(private readonly service: ReferralsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Get()
  list(): Promise<unknown[]> {
    return this.service.listAll();
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("me")
  me(@Req() req: any): Promise<{ code: string; history: unknown[] }> {
    const customerId = req.user?.customerId ?? req.user?.sub;
    return this.service.listMine(customerId);
  }

  @Post("claim")
  @UsePipes(new ZodValidationPipe(claimSchema))
  claim(@Body() body: z.infer<typeof claimSchema>): Promise<unknown> {
    return this.service.claim(body.code);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("generate")
  generate(): Promise<unknown> {
    return this.service.generateAdminCode();
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post(":id/approve")
  approve(@Param("id") id: string): Promise<unknown> {
    return this.service.approve(id);
  }
}
