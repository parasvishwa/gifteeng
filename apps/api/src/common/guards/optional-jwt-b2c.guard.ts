import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class OptionalJwtB2cGuard extends AuthGuard("jwt-b2c") {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return (await super.canActivate(context)) as boolean;
    } catch {
      // No token or invalid token — unauthenticated is fine for optional auth
      return true;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleRequest<T = any>(_err: any, user: any): T {
    return (user ?? null) as T;
  }
}
