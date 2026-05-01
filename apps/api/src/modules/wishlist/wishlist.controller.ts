import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Body,
  Req,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import { WishlistService } from "./wishlist.service";

const addSchema = z.object({ productId: z.string().uuid() });

@ApiTags("wishlist")
@ApiBearerAuth()
@UseGuards(JwtB2cGuard)
@Controller("wishlist")
export class WishlistController {
  constructor(private service: WishlistService) {}

  /** GET /wishlist — returns all saved products */
  @Get()
  getItems(@Req() req: any) {
    return this.service.getItems(req.user.customerId);
  }

  /** GET /wishlist/ids — returns just product ID array (fast check for UI) */
  @Get("ids")
  getIds(@Req() req: any) {
    return this.service.getProductIds(req.user.customerId);
  }

  /** GET /wishlist/check/:productId — true/false */
  @Get("check/:productId")
  async check(@Req() req: any, @Param("productId") productId: string) {
    const ok = await this.service.isWishlisted(req.user.customerId, productId);
    return { wishlisted: ok };
  }

  /** POST /wishlist/items — { productId } */
  @Post("items")
  addItem(
    @Req() req: any,
    @Body(new ZodValidationPipe(addSchema)) body: { productId: string },
  ) {
    return this.service.addItem(req.user.customerId, body.productId);
  }

  /** DELETE /wishlist/items/:productId */
  @Delete("items/:productId")
  removeItem(@Req() req: any, @Param("productId") productId: string) {
    return this.service.removeItem(req.user.customerId, productId);
  }
}
