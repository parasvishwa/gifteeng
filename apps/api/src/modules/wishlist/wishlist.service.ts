import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";

@Injectable()
export class WishlistService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Get or create the customer's default wishlist. */
  private async getOrCreate(customerId: string) {
    let wl = await this.prisma.wishlist.findFirst({
      where: { customerId },
    });
    if (!wl) {
      wl = await this.prisma.wishlist.create({
        data: { customerId, name: "Default" },
      });
    }
    return wl;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /** Returns all wishlist items with full product details. */
  async getItems(customerId: string) {
    const wl = await this.getOrCreate(customerId);

    // Step 1 – rows (ordered newest first)
    const rows = await this.prisma.wishlistItem.findMany({
      where: { wishlistId: wl.id },
      orderBy: { addedAt: "desc" },
      select: { productId: true, addedAt: true },
    });
    if (rows.length === 0) return [];

    // Step 2 – hydrate products
    const ids = rows.map((r) => r.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        title: true,
        slug: true,
        basePrice: true,
        images: true,
        isCustomizable: true,
        b2cEnabled: true,
      },
    });

    const byId = new Map(products.map((p) => [p.id, p]));
    return rows
      .map((r) => {
        const p = byId.get(r.productId);
        return p ? { ...p, addedAt: r.addedAt } : null;
      })
      .filter(Boolean);
  }

  /** Returns just the set of product IDs in the wishlist — for fast UI checks. */
  async getProductIds(customerId: string): Promise<string[]> {
    const wl = await this.getOrCreate(customerId);
    const items = await this.prisma.wishlistItem.findMany({
      where: { wishlistId: wl.id },
      select: { productId: true },
    });
    return items.map((i) => i.productId);
  }

  /** Add a product. Silently ignores duplicates. */
  async addItem(customerId: string, productId: string) {
    const wl = await this.getOrCreate(customerId);
    await this.prisma.wishlistItem.upsert({
      where: { wishlistId_productId: { wishlistId: wl.id, productId } },
      create: { wishlistId: wl.id, productId },
      update: {}, // already exists — no-op
    });
    this.realtime.publish(customerId, "wishlist");
    return { ok: true };
  }

  /** Remove a product. Silently ignores if not present. */
  async removeItem(customerId: string, productId: string) {
    const wl = await this.getOrCreate(customerId);
    await this.prisma.wishlistItem
      .delete({
        where: { wishlistId_productId: { wishlistId: wl.id, productId } },
      })
      .catch(() => {}); // ignore not-found
    this.realtime.publish(customerId, "wishlist");
    return { ok: true };
  }

  /** Check whether a single product is wishlisted. */
  async isWishlisted(customerId: string, productId: string): Promise<boolean> {
    const wl = await this.getOrCreate(customerId);
    const count = await this.prisma.wishlistItem.count({
      where: { wishlistId: wl.id, productId },
    });
    return count > 0;
  }
}
