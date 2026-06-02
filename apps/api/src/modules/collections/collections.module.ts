import { Module } from "@nestjs/common";
import { CollectionsController } from "./collections.controller";
import { CollectionsService } from "./collections.service";
import { AuthB2bModule } from "../auth-b2b/auth-b2b.module";

@Module({
  imports: [AuthB2bModule],
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
