import { Body, Controller, Get, NotFoundException, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { AuthB2bService } from "./auth-b2b.service";
import { B2bLoginSchema, B2bInviteSchema } from "@gifteeng/shared";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PrismaService } from "../../prisma/prisma.service";

const updateMeB2bSchema = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().min(3).optional(),
});

@ApiTags("auth-b2b")
@Controller("auth/b2b")
export class AuthB2bController {
  constructor(private service: AuthB2bService, private prisma: PrismaService) {}

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard)
  @Get("me")
  async me(@Req() req: any) {
    const u = await this.prisma.companyUser.findUnique({
      where: { id: req.user.companyUserId },
    });
    if (!u) throw new NotFoundException();
    const { passwordHash: _pw, ...rest } = u;
    return rest;
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard)
  @Patch("me")
  async patchMe(
    @Req() req: any,
    @Body(new ZodValidationPipe(updateMeB2bSchema))
    body: z.infer<typeof updateMeB2bSchema>,
  ) {
    const u = await this.prisma.companyUser.update({
      where: { id: req.user.companyUserId },
      data: { fullName: body.fullName, phone: body.phone },
    });
    const { passwordHash: _pw, ...rest } = u;
    return rest;
  }

  @Post("login")
  login(@Body(new ZodValidationPipe(B2bLoginSchema)) body: { email: string; password: string }) {
    return this.service.login(body.email, body.password);
  }

  /** One-time: set password for an invited user who has no passwordHash yet */
  @Post("set-password")
  setPassword(@Body() body: { email: string; password: string }) {
    return this.service.setPassword(body.email, body.password);
  }

  /**
   * Bootstrap: create the very first super-admin + company.
   * Automatically disabled once any super_admin exists.
   */
  @Post("bootstrap")
  bootstrap(@Body() body: { email: string; password: string; fullName: string; companyName: string }) {
    return this.service.bootstrap(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "hr_admin")
  @Post("invite")
  invite(
    @Req() req: any,
    @Body(new ZodValidationPipe(B2bInviteSchema))
    body: { email: string; fullName: string; role: any },
  ) {
    return this.service.invite(req.user.companyId, req.user.companyUserId, body);
  }
}
