import { Module } from "@nestjs/common";

import { AiTargetingService } from "./ai-targeting.service";
import { AiTargetingController } from "./ai-targeting.controller";
import { PrismaModule } from "../../prisma/prisma.module";
import { AiModule } from "../ai/ai.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [PrismaModule, AiModule, NotificationsModule],
  controllers: [AiTargetingController],
  providers: [AiTargetingService],
})
export class AiTargetingModule {}
