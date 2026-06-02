import { Module } from "@nestjs/common";
import { AuthB2cModule } from "../auth-b2c/auth-b2c.module";
import { AiCustomizerController } from "./ai-customizer.controller";
import { AiCustomizerService } from "./ai-customizer.service";
import { CanvasExportController } from "./canvas-export.controller";

@Module({
  imports: [
    // AuthB2cModule registers the jwt-b2c Passport strategy used by JwtB2cGuard.
    AuthB2cModule,
  ],
  controllers: [AiCustomizerController, CanvasExportController],
  providers: [AiCustomizerService],
})
export class CustomizerModule {}
