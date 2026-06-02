import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { MarketplaceService } from "./marketplace.service";

/**
 * Public marketplace endpoints — no auth. Powers the buyer-facing
 * "Sold by" seller picker on the product page.
 */
@ApiTags("marketplace")
@Controller("marketplace")
export class MarketplacePublicController {
  constructor(private readonly service: MarketplaceService) {}

  /** Approved sellers offering a product, ranked nearest-then-best-rated. */
  @Get("products/:slugOrId/sellers")
  productSellers(
    @Param("slugOrId") slugOrId: string,
    @Query("pincode") pincode?: string,
  ) {
    return this.service.listProductSellers(slugOrId, pincode);
  }
}
