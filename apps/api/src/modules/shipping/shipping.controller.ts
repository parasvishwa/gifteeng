import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiTags, ApiQuery } from "@nestjs/swagger";
import { ShippingService } from "./shipping.service";
import { ShadowfaxService } from "./shadowfax.service";

@ApiTags("shipping")
@Controller("shipping")
export class ShippingController {
  constructor(
    private service: ShippingService,
    private shadowfax: ShadowfaxService,
  ) {}

  // ── Shiprocket (legacy) ───────────────────────────────────────────────────

  @Post("create")
  create(@Body() body: Record<string, unknown>) {
    return this.service.createOrder(body);
  }

  @Get("track/:awb")
  track(@Param("awb") awb: string) {
    return this.service.track(awb);
  }

  @Post("webhook")
  webhook(@Body() body: unknown) {
    // TODO: persist delivery status updates to `shipments`
    return { received: true };
  }

  /**
   * GET /api/shipping/check?pincode=400001
   *
   * Public delivery-estimate endpoint. Returns ETA + sameDay flag so the
   * mobile app and web can render "⚡ Same-day delivery" for Mumbai or
   * "Arrives by Mon, 4 May" for everywhere else.
   */
  @Get("check")
  @ApiQuery({ name: "pincode", required: true, example: "400001" })
  check(@Query("pincode") pincode?: string) {
    return this.service.estimate(pincode ?? "");
  }

  // ── Shadowfax (same-day Mumbai metro) ─────────────────────────────────────

  /**
   * GET /api/shipping/shadowfax/serviceability?pincode=400001
   *
   * Supports comma-separated pincodes (Shadowfax batches up to ~50 at once).
   * Optional `service` query overrides the default `seller_delivery`.
   */
  @Get("shadowfax/serviceability")
  @ApiQuery({ name: "pincode", required: true, example: "400001" })
  @ApiQuery({ name: "service", required: false, example: "seller_delivery" })
  sfxServiceability(
    @Query("pincode") pincode?: string,
    @Query("service") service?: string,
  ) {
    if (!pincode) {
      throw new HttpException("pincode required", HttpStatus.BAD_REQUEST);
    }
    return this.shadowfax.serviceability(pincode, service);
  }

  /** POST /api/shipping/shadowfax/awbs?count=10 — reserve AWB numbers */
  @Post("shadowfax/awbs")
  @ApiQuery({ name: "count", required: false, example: 10 })
  sfxAwbs(@Query("count") count?: string) {
    const n = Math.max(1, Math.min(parseInt(count ?? "1", 10) || 1, 100));
    return this.shadowfax.generateAwbNumbers(n);
  }

  /** POST /api/shipping/shadowfax/order — create forward shipment */
  @Post("shadowfax/order")
  sfxCreateOrder(@Body() body: Record<string, unknown>) {
    return this.shadowfax.createOrder(body as never);
  }

  /** GET /api/shipping/shadowfax/track/:awb */
  @Get("shadowfax/track/:awb")
  sfxTrack(@Param("awb") awb: string) {
    return this.shadowfax.track(awb);
  }

  /** POST /api/shipping/shadowfax/bulk-track  body: { awbs: [...] } */
  @Post("shadowfax/bulk-track")
  sfxBulkTrack(@Body() body: { awbs?: string[] }) {
    return this.shadowfax.bulkTrack(body.awbs ?? []);
  }

  /** POST /api/shipping/shadowfax/order-update — update / cancel order */
  @Post("shadowfax/order-update")
  sfxUpdateOrder(@Body() body: Record<string, unknown>) {
    return this.shadowfax.updateOrder(body);
  }

  /**
   * POST /api/shipping/shadowfax/webhook
   *
   * Shadowfax posts status updates here (e.g. "OUT_FOR_DELIVERY", "DELIVERED",
   * "RTO"). We verify the HMAC signature, then update the matching order.
   *
   * Configure this URL in the Shadowfax merchant portal under Webhooks →
   * Shipment Events.
   */
  @Post("shadowfax/webhook")
  async sfxWebhook(
    @Headers("authorization") auth: string | undefined,
    @Body() body: unknown,
  ) {
    const ok = this.shadowfax.verifyWebhook(auth);
    if (!ok) {
      throw new HttpException("invalid authorization", HttpStatus.UNAUTHORIZED);
    }

    // TODO: route the event to the orders module to update tracking status.
    // Expected payload shape (per Shadowfax docs):
    //   { awb, status, status_code, event_time, order_id, ... }
    return { received: true };
  }
}
