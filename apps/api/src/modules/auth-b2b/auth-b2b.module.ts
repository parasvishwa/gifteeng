import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthB2bController } from "./auth-b2b.controller";
import { AuthB2bService } from "./auth-b2b.service";
import { JwtB2bStrategy } from "./jwt-b2b.strategy";

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthB2bController],
  providers: [AuthB2bService, JwtB2bStrategy],
  exports: [AuthB2bService],
})
export class AuthB2bModule {}
