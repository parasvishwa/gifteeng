import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

export const COMPANY_SCOPE_KEY = "companyScope";

/**
 * Marker decorator — any controller handler that reads/writes company-scoped
 * data should be annotated with @CompanyScoped() so CompanyScopeGuard kicks in.
 */
export const CompanyScoped = () => (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
  if (descriptor) {
    Reflect.defineMetadata(COMPANY_SCOPE_KEY, true, descriptor.value);
  } else {
    Reflect.defineMetadata(COMPANY_SCOPE_KEY, true, target);
  }
};

/**
 * Enforces tenant isolation for B2B handlers.
 *
 * Rules:
 *  - super_admin and sales_admin bypass scoping (platform-wide staff)
 *  - every other role must have req.user.companyId set
 *  - if the request carries a `:companyId` route param or `companyId` query/body
 *    field, it must match the JWT's companyId (else 403)
 *  - the guard also mutates req.user.scopedCompanyId — use that in services
 *    instead of reading companyId directly, so the intent is explicit.
 */
@Injectable()
export class CompanyScopeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new ForbiddenException("No authenticated user");

    // Platform staff — no tenant scoping
    if (user.role === "super_admin" || user.role === "sales_admin") {
      req.user.scopedCompanyId = null;
      return true;
    }

    const jwtCompanyId = user.companyId;
    if (!jwtCompanyId) throw new ForbiddenException("Missing companyId in token");

    const paramCompanyId = req.params?.companyId;
    const bodyCompanyId = req.body?.companyId;
    const queryCompanyId = req.query?.companyId;
    const requested = paramCompanyId ?? bodyCompanyId ?? queryCompanyId;

    if (requested && requested !== jwtCompanyId) {
      throw new ForbiddenException("Company scope mismatch");
    }

    req.user.scopedCompanyId = jwtCompanyId;
    return true;
  }
}
