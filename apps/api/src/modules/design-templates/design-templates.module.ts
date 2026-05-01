import { Module } from "@nestjs/common";
import { DesignTemplatesController } from "./design-templates.controller";
import { DesignTemplatesService } from "./design-templates.service";

@Module({
  controllers: [DesignTemplatesController],
  providers: [DesignTemplatesService],
  exports: [DesignTemplatesService],
})
export class DesignTemplatesModule {}
