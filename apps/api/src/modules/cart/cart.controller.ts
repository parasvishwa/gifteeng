import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { CartService } from "./cart.service";
import { CartItemInputSchema, type CartItemInput } from "@gifteeng/shared";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

@ApiTags("cart")
@Controller("cart")
export class CartController {
  constructor(private service: CartService) {}

  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get()
  get(@Req() req: any) {
    return this.service.getOrCreate(req.user.customerId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("items")
  async add(
    @Req() req: any,
    @Headers("x-cart-session") sessionKey: string | undefined,
    @Body(new ZodValidationPipe(CartItemInputSchema)) body: CartItemInput,
  ) {
    if (sessionKey && sessionKey.length > 0) {
      await this.service.mergeGuestIntoCustomer(sessionKey, req.user.customerId);
    }
    return this.service.addItem(req.user.customerId, body);
  }

  /** DELETE /cart/items — clear ALL items (used by checkout pre-sync to flush stale server cart) */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Delete("items")
  clearAll(@Req() req: any) {
    return this.service.clearItems(req.user.customerId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Delete("items/:id")
  async remove(
    @Req() req: any,
    @Headers("x-cart-session") sessionKey: string | undefined,
    @Param("id") id: string,
  ) {
    if (sessionKey && sessionKey.length > 0) {
      await this.service.mergeGuestIntoCustomer(sessionKey, req.user.customerId);
    }
    return this.service.removeItem(req.user.customerId, id);
  }

  @Get("guest")
  getGuest(@Headers("x-cart-session") sessionKey: string | undefined) {
    if (!sessionKey || sessionKey.length === 0) {
      throw new BadRequestException("Missing X-Cart-Session header");
    }
    return this.service.getOrCreateGuest(sessionKey);
  }

  @Post("guest/items")
  addGuest(
    @Headers("x-cart-session") sessionKey: string | undefined,
    @Body(new ZodValidationPipe(CartItemInputSchema)) body: CartItemInput,
  ) {
    if (!sessionKey || sessionKey.length === 0) {
      throw new BadRequestException("Missing X-Cart-Session header");
    }
    return this.service.addItemGuest(sessionKey, body);
  }

  @Delete("guest/items/:id")
  removeGuest(
    @Headers("x-cart-session") sessionKey: string | undefined,
    @Param("id") id: string,
  ) {
    if (!sessionKey || sessionKey.length === 0) {
      throw new BadRequestException("Missing X-Cart-Session header");
    }
    return this.service.removeItemGuest(sessionKey, id);
  }

  /**
   * GET /api/cart/free-gift-state
   * Returns the list of admin-configured free-gift products and whether
   * the current cart has unlocked each one.
   *   - Logged-in: uses the customer's cart
   *   - Guest: uses the X-Cart-Session cart (if header present)
   *   - No cart at all: returns empty subtotal + the full list marked "locked"
   */
  @Get("free-gift-state")
  async freeGiftState(
    @Req() req: any,
    @Headers("x-cart-session") sessionKey: string | undefined,
  ) {
    const customerId = req.user?.customerId as string | undefined;
    if (customerId) return this.service.getFreeGiftStateForCustomer(customerId);
    if (sessionKey && sessionKey.length > 0) {
      return this.service.getFreeGiftStateForGuest(sessionKey);
    }
    // No cart context — just list the rules so the /cart page can still
    // render the "you could unlock a free gift" teaser.
    return { subtotalWithoutGifts: 0, eligibleGifts: [] };
  }
}
