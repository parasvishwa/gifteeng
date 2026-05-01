import {
  Body, Controller, Get, Param, Post, Query, Req, UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ReturnsService } from "./returns.service";
import type { CallerContext } from "../orders/orders.service";

// ─────────────────────────────────────────────────────────────────────────
// Customer-side endpoints — mounted under /api/orders/b2c/mine to keep
// path consistency with the existing customer order routes.
// ─────────────────────────────────────────────────────────────────────────
@ApiTags("returns-customer")
@Controller("orders/b2c/mine")
export class ReturnsCustomerController {
  constructor(private returns: ReturnsService) {}

  /** POST /api/orders/b2c/mine/:id/return — file a return request. */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post(":id/return")
  async createReturn(
    @Param("id") orderId: string,
    @Req() req: any,
    @Body() body: {
      orderItemId?: string;
      qty?: number;
      reason: string;
      details?: string;
      photos?: string[];
    },
  ) {
    return this.returns.createForCustomer(req.user.customerId, orderId, body);
  }

  /** GET /api/orders/b2c/mine/:id/returns — list customer's RMAs for one order. */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get(":id/returns")
  async listReturns(@Param("id") orderId: string, @Req() req: any) {
    return this.returns.listForCustomerOrder(req.user.customerId, orderId);
  }

  /** POST /api/orders/b2c/mine/returns/:rmaId/cancel — customer cancels their own pending request. */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("returns/:rmaId/cancel")
  async cancelReturn(@Param("rmaId") rmaId: string, @Req() req: any) {
    return this.returns.cancelByCustomer(req.user.customerId, rmaId);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Admin-side endpoints
// ─────────────────────────────────────────────────────────────────────────
@ApiTags("returns-admin")
@Controller("admin/returns")
export class ReturnsAdminController {
  constructor(private returns: ReturnsService) {}

  /** Browse & filter all return requests across the platform. */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get()
  async list(
    @Query("status") status?: string,
    @Query("customerId") customerId?: string,
    @Query("orderId") orderId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.returns.listForAdmin({
      status,
      customerId,
      orderId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  /** Inline list for the order detail page. */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin", "production")
  @Get("by-order/:orderId")
  async byOrder(@Param("orderId") orderId: string) {
    return this.returns.listForOrder(orderId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post(":id/approve")
  async approve(@Param("id") id: string, @Req() req: any) {
    return this.returns.approve(id, this.b2bCaller(req));
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post(":id/reject")
  async reject(@Param("id") id: string, @Req() req: any, @Body() body: { reason: string }) {
    return this.returns.reject(id, body?.reason, this.b2bCaller(req));
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin", "production")
  @Post(":id/mark-received")
  async markReceived(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: { carrier?: string; trackingNumber?: string },
  ) {
    return this.returns.markReceived(id, body ?? {}, this.b2bCaller(req));
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post(":id/refund")
  async finalizeRefund(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: { amountInr?: number; reason?: string; asGoins?: boolean },
  ) {
    return this.returns.finalizeRefund(id, body ?? {}, this.b2bCaller(req));
  }

  private b2bCaller(req: any): CallerContext {
    return {
      audience: "b2b",
      companyId: req.user?.scopedCompanyId ?? req.user?.companyId ?? null,
      companyUserId: req.user?.companyUserId,
      role: req.user?.role,
    };
  }
}
