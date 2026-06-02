import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthB2bController } from "./auth-b2b.controller";
import { AuthB2bService } from "./auth-b2b.service";
import { JwtB2bStrategy } from "./jwt-b2b.strategy";
import { TeamController } from "./team.controller";
import { TeamService } from "./team.service";
import { PermissionsGuard } from "./permissions.guard";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [PassportModule, JwtModule.register({}), PrismaModule],
  controllers: [AuthB2bController, TeamController],
  providers: [AuthB2bService, JwtB2bStrategy, TeamService, PermissionsGuard],
  exports: [AuthB2bService, PermissionsGuard],
})
export class AuthB2bModule {}
