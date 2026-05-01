import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthB2cController } from "./auth-b2c.controller";
import { AddressesController } from "./addresses.controller";
import { AuthB2cService } from "./auth-b2c.service";
import { JwtB2cStrategy } from "./jwt-b2c.strategy";
import { CartModule } from "../cart/cart.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { MilestoneRewardsModule } from "../milestone-rewards/milestone-rewards.module";

@Module({
  imports: [PassportModule, JwtModule.register({}), CartModule, NotificationsModule, MilestoneRewardsModule],
  controllers: [AuthB2cController, AddressesController],
  providers: [AuthB2cService, JwtB2cStrategy],
  exports: [AuthB2cService],
})
export class AuthB2cModule {}
