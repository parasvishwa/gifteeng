import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import type { CartItemInput } from "@gifteeng/shared";

type FreeGiftCfg = { minCartInr: number; shippingInr: number; maxPerOrder: number };

@Injectable()
export class CartService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
  ) {}

  async getOrCreate(customerId: string) {
    // include items.product so the mobile/web checkout review can render the
    // real title, image and price. Without nesting `product`, items came back
    // as bare {productId, qty, …} and the UI fell back to "Gift" + ₹0.
    return this.prisma.cart.upsert({
      where: { customerId },
      update: {},
      create: { customerId },
      include: {
        // Include variant options (image + value + name) on each product
        // so the cart UI can swap the thumbnail to the variant-specific
        // image when the customer picked a design — was always showing
        // the parent's first image regardless of which variant they picked.
        items: { include: { product: { include: { variantOptions: true } } } },
      },
    });
  }

  async addItem(customerId: string, input: CartItemInput) {
    const cart = await this.getOrCreate(customerId);
    const row = await this.prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: input.productId,
        sellerProductId: input.sellerProductId ?? null,
        qty: input.qty,
        variantOptions: input.variantOptions as any,
        customization: input.customization as any,
      },
    });
    // Tell every other open session for this customer to refresh.
    this.realtime.publish(customerId, "cart");
    return row;
  }

  async removeItem(customerId: string, itemId: string) {
    const cart = await this.getOrCreate(customerId);
    await this.prisma.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
    this.realtime.publish(customerId, "cart");
    return { ok: true };
  }

  /** Remove ALL items from a customer's cart (used by checkout pre-sync to flush stale items). */
  async clearItems(customerId: string) {
    const cart = await this.getOrCreate(customerId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    this.realtime.publish(customerId, "cart");
    return { ok: true };
  }

  async getOrCreateGuest(sessionKey: string) {
    return this.prisma.cart.upsert({
      where: { sessionKey },
      update: {},
      create: { sessionKey },
      include: {
        // Include variant options (image + value + name) on each product
        // so the cart UI can swap the thumbnail to the variant-specific
        // image when the customer picked a design — was always showing
        // the parent's first image regardless of which variant they picked.
        items: { include: { product: { include: { variantOptions: true } } } },
      },
    });
  }

  async addItemGuest(sessionKey: string, input: CartItemInput) {
    const cart = await this.getOrCreateGuest(sessionKey);
    return this.prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: input.productId,
        sellerProductId: input.sellerProductId ?? null,
        qty: input.qty,
        variantOptions: input.variantOptions as any,
        customization: input.customization as any,
      },
    });
  }

  async removeItemGuest(sessionKey: string, itemId: string) {
    const cart = await this.getOrCreateGuest(sessionKey);
    await this.prisma.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
    return { ok: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Free-gift eligibility — Deploy 122
  // ═══════════════════════════════════════════════════════════════════════
  //
  // Cart items get their free-gift status derived, not stored, so the rule
  // is enforced at one source (Product.metadata.freeGift) and stays in
  // sync as admin edits thresholds. Per free-gift product we compute:
  //   - alreadyInCart  : qty of that product already in the cart
  //   - subtotalWithoutGifts : what the customer's cart is worth EXCLUDING
  //                            any qualifying free-gift items (so adding
  //                            the gift doesn't inflate the threshold)
  //   - status: "in_cart" | "unlocked" | "locked"
  //   - remainingInr : ₹ more the customer needs to spend to unlock (locked only)
  //
  // The checkout service uses the same `isFreeGiftLine` check to price the
  // line item at shippingInr instead of basePrice.

  private extractGiftConfig(product: { metadata: unknown }): FreeGiftCfg | null {
    const m = (product.metadata ?? {}) as { freeGift?: { isActive?: boolean; minCartInr?: number; shippingInr?: number; maxPerOrder?: number } };
    const f = m?.freeGift;
    if (!f?.isActive) return null;
    return {
      minCartInr: Number(f.minCartInr ?? 0),
      shippingInr: Number(f.shippingInr ?? 0),
      maxPerOrder: Number(f.maxPerOrder ?? 1),
    };
  }

  async getFreeGiftState(cartId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      include: {
        // Include variant options (image + value + name) on each product
        // so the cart UI can swap the thumbnail to the variant-specific
        // image when the customer picked a design — was always showing
        // the parent's first image regardless of which variant they picked.
        items: { include: { product: { include: { variantOptions: true } } } },
      },
    });
    if (!cart) return { subtotalWithoutGifts: 0, eligibleGifts: [] };

    // Split items: free-gift candidates (product has an active gift config)
    // vs regular items. Subtotal is computed from regular items only.
    const giftItemsByProductId = new Map<string, { qty: number; cfg: FreeGiftCfg }>();
    let subtotalWithoutGifts = 0;
    for (const it of cart.items) {
      const cfg = this.extractGiftConfig(it.product);
      if (cfg) {
        const prev = giftItemsByProductId.get(it.productId);
        giftItemsByProductId.set(it.productId, {
          qty: (prev?.qty ?? 0) + it.qty,
          cfg,
        });
      } else {
        subtotalWithoutGifts += Number(it.product.basePrice) * it.qty;
      }
    }

    // List all currently-advertised free-gift products (active rules).
    const allActive = await this.prisma.product.findMany({
      where: {
        metadata: { path: ["freeGift", "isActive"], equals: true } as any,
      },
      select: {
        id: true, slug: true, title: true, basePrice: true, images: true, metadata: true,
      },
    });

    const eligibleGifts = allActive.map((p) => {
      const cfg = this.extractGiftConfig(p)!;
      const already = giftItemsByProductId.get(p.id);
      const inCart = already?.qty ?? 0;
      const unlocked = subtotalWithoutGifts >= cfg.minCartInr;
      const atCap = inCart >= cfg.maxPerOrder;
      const status =
        inCart > 0    ? "in_cart"
        : atCap       ? "in_cart"  // shouldn't happen but safe
        : unlocked    ? "unlocked"
                      : "locked";
      return {
        productId: p.id,
        product: {
          id: p.id, slug: p.slug, title: p.title,
          basePrice: Number(p.basePrice),
          images: p.images,
        },
        minCartInr: cfg.minCartInr,
        shippingInr: cfg.shippingInr,
        maxPerOrder: cfg.maxPerOrder,
        remainingInr: Math.max(0, cfg.minCartInr - subtotalWithoutGifts),
        alreadyInCart: inCart,
        unlocked,
        status,
      };
    });

    // Sort: unlocked first (most actionable), then closest-to-unlock, then in-cart.
    eligibleGifts.sort((a, b) => {
      const rank = (g: typeof a) => g.status === "unlocked" ? 0 : g.status === "locked" ? 1 : 2;
      const d = rank(a) - rank(b);
      return d !== 0 ? d : a.remainingInr - b.remainingInr;
    });

    return { subtotalWithoutGifts, eligibleGifts };
  }

  async getFreeGiftStateForCustomer(customerId: string) {
    const cart = await this.getOrCreate(customerId);
    return this.getFreeGiftState(cart.id);
  }

  async getFreeGiftStateForGuest(sessionKey: string) {
    const cart = await this.getOrCreateGuest(sessionKey);
    return this.getFreeGiftState(cart.id);
  }

  async mergeGuestIntoCustomer(sessionKey: string, customerId: string) {
    return this.prisma.$transaction(async (tx) => {
      const guest = await tx.cart.findUnique({
        where: { sessionKey },
        include: { items: true },
      });

      const customer = await tx.cart.upsert({
        where: { customerId },
        update: {},
        create: { customerId },
        include: { items: true },
      });

      if (!guest) {
        return tx.cart.findUnique({
          where: { id: customer.id },
          include: { items: true },
        });
      }

      const keyFor = (productId: string, variantOptions: unknown) =>
        `${productId}::${JSON.stringify(variantOptions ?? null)}`;

      const customerByKey = new Map<string, (typeof customer.items)[number]>();
      for (const item of customer.items) {
        customerByKey.set(keyFor(item.productId, item.variantOptions), item);
      }

      for (const gItem of guest.items) {
        const key = keyFor(gItem.productId, gItem.variantOptions);
        const existing = customerByKey.get(key);
        if (existing) {
          await tx.cartItem.update({
            where: { id: existing.id },
            data: { qty: existing.qty + gItem.qty },
          });
          await tx.cartItem.delete({ where: { id: gItem.id } });
        } else {
          const moved = await tx.cartItem.update({
            where: { id: gItem.id },
            data: { cartId: customer.id },
          });
          customerByKey.set(key, moved);
        }
      }

      await tx.cart.delete({ where: { id: guest.id } });

      return tx.cart.findUnique({
        where: { id: customer.id },
        include: { items: true },
      });
    });
  }
}
