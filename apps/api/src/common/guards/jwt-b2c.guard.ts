import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class JwtB2cGuard extends AuthGuard("jwt-b2c") {}
