import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/** Guards seller-portal endpoints — requires a valid seller JWT (aud "seller"). */
@Injectable()
export class JwtSellerGuard extends AuthGuard("jwt-seller") {}
