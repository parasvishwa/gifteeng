import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { RecommendationsController } from "./recommendations.controller";
import { RecommendationsService } from "./recommendations.service";
import { AiModule } from "../ai/ai.module";

@Module({
  imports: [
    AiModule,
    // Local JWT verifier — the controller soft-decodes B2C tokens so this
    // public endpoint works for both anonymous and logged-in callers.
    JwtModule.register({}),
  ],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
