import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { AuthSellerService } from "./auth-seller.service";

/**
 * Super-admin facing seller management — the approval queue. Sellers
 * onboard via /seller/auth/* in `pending` status; an admin reviews their
 * KYC here and approves / rejects / suspends.
 */
@ApiTags("sellers-admin")
@ApiBearerAuth()
@UseGuards(JwtB2bGuard, RolesGuard)
@Roles("super_admin", "sales_admin")
@Controller("admin/sellers")
export class SellersAdminController {
  constructor(private readonly service: AuthSellerService) {}

  @Get()
  list(@Query("status") status?: string) {
    return this.service.listSellers(status);
  }

  @Patch(":id/approve")
  approve(@Param("id") id: string) {
    return this.service.approveSeller(id);
  }

  @Patch(":id/reject")
  reject(@Param("id") id: string, @Body() body: { reason?: string }) {
    return this.service.rejectSeller(id, body?.reason ?? "");
  }

  @Patch(":id/suspend")
  suspend(@Param("id") id: string, @Body() body: { reason?: string }) {
    return this.service.suspendSeller(id, body?.reason ?? "");
  }
}
