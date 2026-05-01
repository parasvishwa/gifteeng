import { Controller, Get, Post, Body, Param, Req, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { z } from "zod";
import { BidsService } from "./bids.service";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const placeBidSchema = z.object({
  bidItemId: z.string().uuid(),
  bidAmount: z.number().int().positive(),
});

const createItemSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  productId: z.string().uuid().optional(),
  prizeLabel: z.string().min(3),
  minBidGoins: z.number().int().positive().optional(),
  maxBidGoins: z.number().int().positive().optional(),
  costPerEntry: z.number().int().positive().optional(),
  opensAt: z.string(),
  closesAt: z.string(),
});

@ApiTags("bids")
@Controller("bids")
export class BidsController {
  constructor(private service: BidsService) {}

  /** GET /api/bids/current — current live bid item + user's entries */
  @Get("current")
  current(@Req() req: any) {
    const customerId = req.user?.customerId ?? null;
    return this.service.getCurrent(customerId);
  }

  /** POST /api/bids/place — place a bid */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("place")
  place(
    @Req() req: any,
    @Body(new ZodValidationPipe(placeBidSchema))
    body: z.infer<typeof placeBidSchema>,
  ) {
    return this.service.placeBid(
      req.user.customerId as string,
      body.bidItemId,
      body.bidAmount,
    );
  }

  /** GET /api/bids/my — user's bid history */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("my")
  myBids(@Req() req: any) {
    return this.service.listMyBids(req.user.customerId as string);
  }

  /** POST /api/bids/resolve/:id — manually resolve (also auto-resolves on view) */
  @Post("resolve/:id")
  resolve(@Param("id") id: string) {
    return this.service.resolveBid(id);
  }

  /** GET /api/bids/admin/items — admin list */
  @Get("admin/items")
  adminList() {
    return this.service.adminListItems();
  }

  /** POST /api/bids/admin/item — admin create */
  @Post("admin/item")
  adminCreate(
    @Body(new ZodValidationPipe(createItemSchema))
    body: z.infer<typeof createItemSchema>,
  ) {
    return this.service.adminCreateItem({
      ...body,
      opensAt: new Date(body.opensAt),
      closesAt: new Date(body.closesAt),
    });
  }

  /** POST /api/bids/admin/seed-daily — seed a default daily item */
  @Post("admin/seed-daily")
  adminSeed() {
    return this.service.adminSeedDaily();
  }
}
