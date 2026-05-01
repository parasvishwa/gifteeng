import { Module } from "@nestjs/common";
import { CatalogsController, CatalogsAdminController } from "./catalogs.controller";
import { CatalogsService } from "./catalogs.service";
import { AuthB2bModule } from "../auth-b2b/auth-b2b.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AuthB2bModule, NotificationsModule],
  controllers: [CatalogsController, CatalogsAdminController],
  providers: [CatalogsService],
  exports: [CatalogsService],
})
export class CatalogsModule {}
