// ─── TeamController ──────────────────────────────────────────────────────────
//
// Scoped to /api/b2b/team — list, invite, edit, and deactivate team members.
// All routes require the b2b JWT plus an appropriate permission:
//   GET    /team               → users.view
//   POST   /team/invite        → users.invite
//   PATCH  /team/:id           → users.edit
//   POST   /team/:id/reset-pw  → users.edit
//   DELETE /team/:id           → users.delete   (soft — flips isActive false)
//
// GET /team/permissions-catalog returns the canonical permission list +
// groupings so the admin UI can render the matrix without hard-coding strings.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import type { Request } from "express";
import type { UserRole } from "@gifteeng/shared";
import { TeamService } from "./team.service";
import { PermissionsGuard, RequirePermissions } from "./permissions.guard";
import { PERMISSIONS, PERMISSION_GROUPS, ALL_PERMISSIONS } from "./permissions";
import type { B2bCurrentUser } from "./jwt-b2b.strategy";

function user(req: Request): B2bCurrentUser {
  return (req as unknown as { user: B2bCurrentUser }).user;
}

@ApiTags("b2b-team")
@ApiBearerAuth()
@Controller("b2b/team")
@UseGuards(AuthGuard("jwt-b2b"), PermissionsGuard)
export class TeamController {
  constructor(private team: TeamService) {}

  /** Public-to-authenticated — returns the permission catalog for the matrix UI. */
  @Get("permissions-catalog")
  catalog() {
    return { all: ALL_PERMISSIONS, groups: PERMISSION_GROUPS };
  }

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  list(@Req() req: Request) {
    return this.team.list(user(req).companyId);
  }

  @Post("invite")
  @RequirePermissions(PERMISSIONS.USERS_INVITE)
  invite(
    @Req() req: Request,
    @Body() body: {
      email: string;
      role: UserRole;
      fullName?: string;
      phone?: string;
      permissions?: string[];
    },
  ) {
    const u = user(req);
    return this.team.invite(u.companyId, u.companyUserId, body);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.USERS_EDIT)
  update(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: {
      role?: UserRole;
      permissions?: string[];
      isActive?: boolean;
      fullName?: string;
      phone?: string;
    },
  ) {
    return this.team.update(user(req).companyId, id, body);
  }

  @Post(":id/reset-password")
  @RequirePermissions(PERMISSIONS.USERS_EDIT)
  resetPw(@Req() req: Request, @Param("id") id: string) {
    return this.team.resetPassword(user(req).companyId, id);
  }

  // Re-issue an invite link for an unredeemed invitation (link lost/expired).
  // Same permission as creating a new invite — purely a UX convenience.
  @Post(":id/resend-invite")
  @RequirePermissions(PERMISSIONS.USERS_INVITE)
  resendInvite(@Req() req: Request, @Param("id") id: string) {
    return this.team.resendInvite(user(req).companyId, id);
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.USERS_DELETE)
  deactivate(@Req() req: Request, @Param("id") id: string) {
    return this.team.deactivate(user(req).companyId, id);
  }
}
