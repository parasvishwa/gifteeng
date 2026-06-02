import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { MarketplaceService } from "./marketplace.service";

/**
 * Super-admin facing marketplace verification — the seller-product
 * approval queue. Sellers list products in `pending` status; an admin
 * reviews and approves / rejects them here before they go live.
 */
@ApiTags("marketplace-admin")
@ApiBearerAuth()
@UseGuards(JwtB2bGuard, RolesGuard)
@Roles("super_admin", "sales_admin")
@Controller("admin/seller-products")
export class MarketplaceAdminController {
  constructor(private readonly service: MarketplaceService) {}

  @Get()
  list(@Query("status") status?: string) {
    return this.service.listOffers(status);
  }

  @Patch(":id/approve")
  approve(@Param("id") id: string) {
    return this.service.approveOffer(id);
  }

  @Patch(":id/reject")
  reject(@Param("id") id: string, @Body() body: { reason?: string }) {
    return this.service.rejectOffer(id, body?.reason ?? "");
  }
}
