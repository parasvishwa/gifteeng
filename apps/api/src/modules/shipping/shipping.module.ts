import { Module } from "@nestjs/common";
import { ShippingController } from "./shipping.controller";
import { ShippingService } from "./shipping.service";
import { ShadowfaxService } from "./shadowfax.service";

@Module({
  controllers: [ShippingController],
  providers: [ShippingService, ShadowfaxService],
  exports: [ShippingService, ShadowfaxService],
})
export class ShippingModule {}
