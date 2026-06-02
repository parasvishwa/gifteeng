import { Body, Controller, ForbiddenException, Get, NotFoundException, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { AuthB2bService } from "./auth-b2b.service";
import { TeamService } from "./team.service";
import { B2bLoginSchema, B2bInviteSchema } from "@gifteeng/shared";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { effectivePermissions } from "./permissions";
import type { UserRole } from "@gifteeng/shared";

const updateMeB2bSchema = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().min(3).optional(),
});

@ApiTags("auth-b2b")
@Controller("auth/b2b")
export class AuthB2bController {
  constructor(
    private service: AuthB2bService,
    private prisma: PrismaService,
    private team: TeamService,
  ) {}

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard)
  @Get("me")
  async me(@Req() req: any) {
    const u = await this.prisma.companyUser.findUnique({
      where: { id: req.user.companyUserId },
    });
    if (!u) throw new NotFoundException();
    const { passwordHash: _pw, ...rest } = u;
    // Include effective permissions (role defaults ∪ per-user grants) so
    // the admin sidebar can hide nav items the user can't access.
    // super_admin → returns full catalog. Others → role base + their grants.
    return {
      ...rest,
      permissions: effectivePermissions(u.role as UserRole, u.permissions),
    };
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

  // Tight throttle on B2B login — without it an attacker can brute-force
  // admin passwords unimpeded. 5 attempts / minute / IP. Combined with the
  // service-layer per-account fail counter (TODO) this gives defence in
  // depth against credential stuffing.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post("login")
  login(@Body(new ZodValidationPipe(B2bLoginSchema)) body: { email: string; password: string }) {
    return this.service.login(body.email, body.password);
  }

  /**
   * Single-use invite-token acceptance. Replaces the legacy
   * `set-password(email, password)` flow which was vulnerable to anyone
   * who could guess an invited user's email claiming their account.
   *
   * Body: { token, password }
   * The `token` is the one delivered by /b2b/team/invite (in the inviteUrl).
   * Lookup is by sha256(token) — a stolen DB doesn't yield usable links.
   */
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post("accept-invite")
  acceptInvite(@Body() body: { token: string; password: string }) {
    return this.team.acceptInvite(body?.token ?? "", body?.password ?? "");
  }

  /**
   * @deprecated Use POST /auth/b2b/accept-invite with a token instead.
   * Kept as a thin compatibility shim so old admin shells don't 404 during
   * deploy, but the underlying service method now refuses to set a
   * password for a row that has an active invite token outstanding. New
   * code should never call this — and after the next deploy we can delete
   * the route entirely.
   */
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post("set-password")
  setPassword(@Body() body: { email: string; password: string }) {
    return this.service.setPassword(body.email, body.password);
  }

  /**
   * Bootstrap: create the very first super-admin + company.
   * Automatically disabled once any super_admin exists.
   *
   * Additional gate: requires the `BOOTSTRAP_SECRET` env var to be present
   * AND match the request body's `bootstrapSecret`. The env var is unset on
   * the server immediately after first use, closing the route entirely.
   * Without this gate, the brief window between deploy and the operator's
   * first call is a wide-open path to platform takeover.
   */
  @Throttle({ default: { ttl: 3600_000, limit: 3 } })
  @Post("bootstrap")
  bootstrap(
    @Body()
    body: {
      email: string;
      password: string;
      fullName: string;
      companyName: string;
      bootstrapSecret?: string;
    },
  ) {
    const required = process.env.BOOTSTRAP_SECRET;
    if (!required || required.length < 16) {
      throw new ForbiddenException(
        "Bootstrap is disabled. Set BOOTSTRAP_SECRET (>= 16 chars) on the server and supply it in the request.",
      );
    }
    if (body.bootstrapSecret !== required) {
      throw new ForbiddenException("Invalid bootstrap secret");
    }
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
