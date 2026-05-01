import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards, UsePipes } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import { OrdersService, type CallerContext } from "./orders.service";
import { ProductsService } from "../products/products.service";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CompanyScopeGuard } from "../../common/guards/company-scope.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import type { OrderStatus } from "@gifteeng/shared";

const orderStatusSchema = z.object({
  status: z.enum([
    "new_order",
    "confirmed",
    "in_production",
    "ready_to_ship",
    "shipped",
    "delivered",
    "cancelled",
    "returned",
  ]),
});

/**
 * One service, five portals. Every handler constructs a CallerContext from
 * the JWT and defers filtering to OrdersService.listOrders, which is the
 * single source of truth for tenant isolation.
 */
@ApiTags("orders")
@Controller("orders")
export class OrdersController {
  constructor(
    private orders: OrdersService,
    private products: ProductsService,
  ) {}

  // ---- B2C customer: their own orders ----

  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("b2c/mine")
  mineB2c(@Req() req: any, @Query() q: any) {
    const caller: CallerContext = { audience: "b2c", customerId: req.user.customerId };
    return this.orders.listOrders(caller, q);
  }

  // ---- B2B employee store: their own orders ----

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard, CompanyScopeGuard)
  @Roles("employee")
  @Get("b2b/employee/mine")
  mineEmployee(@Req() req: any, @Query() q: any) {
    const caller = this.b2bCaller(req);
    return this.orders.listOrders(caller, q);
  }

  // ---- B2B HR admin: their company's orders ----

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard, CompanyScopeGuard)
  @Roles("hr_admin")
  @Get("b2b/company")
  companyOrders(@Req() req: any, @Query() q: any) {
    const caller = this.b2bCaller(req);
    return this.orders.listOrders(caller, q);
  }

  // ---- Production team: channel-agnostic status queue ----
  // Production sees BOTH B2C and B2B orders whose status is in-production.
  // Only super_admin / production roles can hit this.

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin", "production")
  @Get("production/queue")
  productionQueue(@Req() req: any, @Query() q: any) {
    const caller = this.b2bCaller(req);
    return this.orders.listOrders(caller, {
      ...q,
      status: q.status ?? ["confirmed", "in_production", "ready_to_ship"],
    });
  }

  // ---- Super-admin: the whole fleet (both channels) ----

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/all")
  adminAll(@Req() req: any, @Query() q: any) {
    const caller = this.b2bCaller(req);
    return this.orders.listOrders(caller, q);
  }

  // ---- Shared: single order by id (guarded by assertVisible in the service) ----

  @Get(":id")
  @UseGuards(JwtB2bGuard) // b2c callers should use /b2c/mine/:id variant in future; kept single for now
  @ApiBearerAuth()
  async getOne(@Param("id") id: string, @Req() req: any) {
    const caller = this.b2bCaller(req);
    return this.orders.getById(id, caller);
  }

  /**
   * PATCH /api/orders/:id/admin-meta — admin-only patch for tags, the
   * staff-visible note, and one-off metadata fields. Stored under the
   * existing `metadata` JSONB so no migration is needed.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Patch(":id/admin-meta")
  async patchAdminMeta(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: { tags?: string[]; note?: string | null },
  ) {
    const caller = this.b2bCaller(req);
    return this.orders.patchAdminMeta(id, body, caller);
  }

  /**
   * POST /api/orders/:id/comments — append an internal staff comment.
   * Comments are pushed onto `metadata.internalComments` as
   * { author, text, at } so they show up in the timeline.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin", "production")
  @Post(":id/comments")
  async addComment(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: { text: string },
  ) {
    const caller = this.b2bCaller(req);
    const author = (req.user?.email || req.user?.userId || "staff") as string;
    return this.orders.addInternalComment(id, body.text ?? "", author, caller);
  }

  /** B2C single order — guarded by JwtB2cGuard, scoped to caller's customerId */
  @Get("b2c/mine/:id")
  @UseGuards(JwtB2cGuard)
  @ApiBearerAuth()
  async getOneB2c(@Param("id") id: string, @Req() req: any) {
    return this.orders.getById(id, {
      audience: "b2c",
      customerId: req.user.customerId as string,
    });
  }

  /** POST /api/orders/b2c/mine/:id/cancel — customer-initiated cancellation */
  @Post("b2c/mine/:id/cancel")
  @UseGuards(JwtB2cGuard)
  @ApiBearerAuth()
  async cancelB2c(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: { reason?: string },
  ) {
    const caller: CallerContext = { audience: "b2c", customerId: req.user.customerId as string };
    return this.orders.cancelOrder(id, body.reason ?? "", caller);
  }

  /**
   * PATCH /api/orders/b2c/mine/:id/items/:itemId
   * Customer updates the customization (canvas design) on a single order item.
   * Only allowed while the order is still in an editable status (pending / confirmed).
   */
  @Patch("b2c/mine/:id/items/:itemId")
  @UseGuards(JwtB2cGuard)
  @ApiBearerAuth()
  async updateItemCustomizationB2c(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Req() req: any,
    @Body() body: { customization: unknown },
  ) {
    const caller: CallerContext = { audience: "b2c", customerId: req.user.customerId as string };
    return this.orders.updateItemCustomization(id, itemId, body.customization, caller);
  }

  /** PATCH /api/orders/b2c/mine/:id/request-delivery-date — postpone delivery (never prepone) */
  @Patch("b2c/mine/:id/request-delivery-date")
  @UseGuards(JwtB2cGuard)
  @ApiBearerAuth()
  async requestDeliveryDateB2c(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: { requestedDate: string },
  ) {
    const caller: CallerContext = { audience: "b2c", customerId: req.user.customerId as string };
    return this.orders.requestDeliveryDate(id, body.requestedDate, caller);
  }

  /**
   * GET /api/orders/:id/recommendations?limit=8
   * Post-purchase upsell — products related to the order's items.
   * Used by the mobile order-success screen + web order-detail page.
   * Guarded by JwtB2cGuard since it reveals which categories the buyer
   * purchased (low sensitivity but still scoped to the owner).
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get(":id/recommendations")
  async recommendations(
    @Param("id") id: string,
    @Req() req: any,
    @Query("limit") limit?: string,
  ) {
    // Ownership check — service throws if the caller can't see this order.
    await this.orders.getById(id, {
      audience: "b2c",
      customerId: req.user.customerId as string,
    });
    const n = limit ? parseInt(limit, 10) : 8;
    return this.products.getOrderRecommendations(
      id,
      Number.isFinite(n) && n > 0 ? n : 8,
    );
  }

  // ---- Status update (admin/production) ----

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard, CompanyScopeGuard)
  @Roles("super_admin", "sales_admin", "hr_admin", "production")
  @Patch(":id/status")
  @UsePipes(new ZodValidationPipe(orderStatusSchema))
  async patchStatus(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: { status: OrderStatus },
  ) {
    const caller = this.b2bCaller(req);
    return this.orders.updateStatus(id, body.status, caller);
  }

  // ---- Invoice PDF ----

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard)
  @Get(":id/invoice.pdf")
  async invoicePdf(@Param("id") id: string, @Res() res: Response): Promise<void> {
    const buf = await this.orders.generateInvoicePdf(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="invoice-${id}.pdf"`);
    res.send(buf);
  }

  /**
   * Packing slip PDF — for the dispatch desk. No prices, no GST. Includes
   * shipping address (large), items, qty, SKU, variant, and any
   * customer-service note from order.metadata.adminNote.
   *
   * Available regardless of payment status (packing happens before
   * money clears for COD anyway).
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin", "production")
  @Get(":id/packing-slip.pdf")
  async packingSlipPdf(@Param("id") id: string, @Res() res: Response): Promise<void> {
    const buf = await this.orders.generatePackingSlipPdf(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="packing-slip-${id}.pdf"`);
    res.send(buf);
  }

  /**
   * Admin cancel with optional inventory restock. Always allowed except
   * on already-cancelled or delivered orders (delivered orders go
   * through the refund flow, not cancel).
   *
   * Body: { reason?: string; restock?: boolean }
   *   restock=true  → increments product/variant inventory by line qty
   *   restock=false → just marks cancelled, no inventory side-effect
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post(":id/admin-cancel")
  async adminCancel(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: { reason?: string; restock?: boolean },
  ) {
    const caller = this.b2bCaller(req);
    return this.orders.cancelOrderByAdmin(
      id,
      { reason: body?.reason, restock: !!body?.restock },
      caller,
    );
  }

  /**
   * Resend the order-confirmation SMS (and push if customer is logged in).
   * Idempotent on the customer side — they may receive a duplicate but
   * MSG91 / FCM do their own dedupe.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post(":id/resend-confirmation")
  async resendConfirmation(@Param("id") id: string) {
    return this.orders.resendOrderConfirmation(id);
  }

  /**
   * Edit a placed order — per-line qty change, line removal, and address
   * updates. Only allowed on pre-shipment statuses (new_order, confirmed,
   * in_production, ready_to_ship). Atomically restocks / deducts
   * inventory and recomputes totals. Does NOT auto-refund or auto-charge
   * any balance change — admin handles money side via the refund flow.
   *
   * Body:
   *   items?: [{ id: orderItemId, qty: number, remove?: boolean }]
   *   shippingAddress?: Address
   *   billingAddress?:  Address
   *   notifyCustomer?:  boolean — push notification on save
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post(":id/edit")
  async editOrder(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: {
      items?: Array<{ id: string; qty: number; remove?: boolean }>;
      shippingAddress?: Record<string, unknown>;
      billingAddress?:  Record<string, unknown>;
      notifyCustomer?:  boolean;
    },
  ) {
    return this.orders.editOrder(id, body, this.b2bCaller(req));
  }

  /**
   * Refund an order — full or partial — with optional Goins credit.
   *
   * Body: { amountInr?: number; reason: string; asGoins?: boolean }
   *   amountInr  — partial amount in rupees. Omit / 0 for full refund.
   *   reason     — required. Stored in audit log + customer push.
   *   asGoins    — true → credit Goins instead of original payment method
   *                       (no Razorpay call). For COD orders this is
   *                       implied (there's no payment to reverse).
   *
   * Restricted to super_admin / sales_admin — refunds are money-out and
   * should not be reachable from any other role.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post(":id/refund")
  async refundOrder(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: { amountInr?: number; reason: string; asGoins?: boolean },
  ) {
    const caller = this.b2bCaller(req);
    return this.orders.refundOrder(id, body, caller);
  }

  // ---- helper ----
  private b2bCaller(req: any): CallerContext {
    return {
      audience: "b2b",
      companyId: req.user?.scopedCompanyId ?? req.user?.companyId ?? null,
      companyUserId: req.user?.companyUserId,
      role: req.user?.role,
    };
  }
}
