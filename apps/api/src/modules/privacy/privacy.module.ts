import { Module } from "@nestjs/common";
import { PrivacyService } from "./privacy.service";
import { PrivacyCustomerController, PrivacyAdminController } from "./privacy.controller";

@Module({
  controllers: [PrivacyCustomerController, PrivacyAdminController],
  providers: [PrivacyService],
  exports: [PrivacyService],
})
export class PrivacyModule {}
