// ─── PermissionsGuard ────────────────────────────────────────────────────────
//
// Reads `@RequirePermissions(...)` metadata from a controller method and
// rejects the request if the caller's effective permissions don't include all
// listed permissions. Pairs with the b2b JWT guard — apply this AFTER auth.
//
// Usage:
//   @UseGuards(AuthGuard("jwt-b2b"), PermissionsGuard)
//   @RequirePermissions("products.create")
//   create(@Body() body: ...) { ... }
//
// super_admin always passes (handled inside hasPermission).
// ─────────────────────────────────────────────────────────────────────────────

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { UserRole } from "@gifteeng/shared";
import { hasPermission, Permission } from "./permissions";

const PERMISSIONS_META_KEY = "required-permissions";

export const RequirePermissions = (...perms: Permission[]) =>
  SetMetadata(PERMISSIONS_META_KEY, perms);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required: Permission[] | undefined = this.reflector.getAllAndOverride(
      PERMISSIONS_META_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req: { user?: { role?: UserRole; permissions?: string[] } } =
      ctx.switchToHttp().getRequest();
    const role = req.user?.role;
    if (!role) throw new ForbiddenException("Not authenticated");

    const grants = req.user?.permissions ?? [];
    const missing = required.filter(
      (p) => !hasPermission(role, grants, p),
    );
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Missing permission${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
      );
    }
    return true;
  }
}
