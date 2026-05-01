import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags, ApiQuery } from "@nestjs/swagger";
import { ShippingService } from "./shipping.service";

@ApiTags("shipping")
@Controller("shipping")
export class ShippingController {
  constructor(private service: ShippingService) {}

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
   * GET /api/shipping/check?pincode=411027
   *
   * Public delivery-estimate endpoint. Consumed by the mobile product page
   * and web checkout for instant "Arrives by ..." copy. Returns:
   *   {
   *     deliverable: true,
   *     city: "Pune",
   *     zone: "Maharashtra",
   *     cod: true,                       // Cash on delivery available?
   *     dispatchInBusinessDays: 2,
   *     deliveryInBusinessDays: 5,
   *     dispatchDate: "2026-04-28",      // calendar date, Sundays skipped
   *     deliveryDate: "2026-05-04",
   *     etaLabel: "Arrives by Mon, 4 May"
   *   }
   *
   * Uses a local city-matrix (O(1), no external API) so the endpoint
   * responds in <10 ms. If pincode is unknown, returns `deliverable: false`
   * with a friendly message so the UI can hide the ETA chip gracefully.
   */
  @Get("check")
  @ApiQuery({ name: "pincode", required: true, example: "411027" })
  check(@Query("pincode") pincode?: string) {
    return this.service.estimate(pincode ?? "");
  }
}
