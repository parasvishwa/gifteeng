import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class JwtB2bGuard extends AuthGuard("jwt-b2b") {}
