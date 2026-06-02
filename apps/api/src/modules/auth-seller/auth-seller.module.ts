import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../../prisma/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuthSellerController } from "./auth-seller.controller";
import { SellersAdminController } from "./sellers-admin.controller";
import { AuthSellerService } from "./auth-seller.service";
import { JwtSellerStrategy } from "./jwt-seller.strategy";

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    PassportModule,
    // Secret is passed per-sign (signAsync options) — register empty.
    JwtModule.register({}),
  ],
  controllers: [AuthSellerController, SellersAdminController],
  providers: [AuthSellerService, JwtSellerStrategy],
  exports: [AuthSellerService],
})
export class AuthSellerModule {}
