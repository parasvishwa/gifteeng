import { Module } from "@nestjs/common";
import { DiscountsController } from "./discounts.controller";
import { DiscountsService } from "./discounts.service";
import { AuthB2bModule } from "../auth-b2b/auth-b2b.module";

@Module({
  imports: [AuthB2bModule],
  controllers: [DiscountsController],
  providers: [DiscountsService],
  exports: [DiscountsService],
})
export class DiscountsModule {}
