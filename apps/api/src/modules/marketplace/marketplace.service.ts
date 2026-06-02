import {
  Injectable, BadRequestException, ForbiddenException, NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@gifteeng/db";
import { PrismaService } from "../../prisma/prisma.service";

// ── Input shapes ────────────────────────────────────────────────────────────

export interface OwnListingInput {
  title: string;
  description?: string;
  category?: string;
  sku?: string;
  images?: { url: string; alt?: string }[];
  isCustomizable?: boolean;
  customizationType?: "text" | "photo" | "design";
  variantOptions?: { name: string; values: string[] }[];
  metadata?: Record<string, unknown>;
  price: number;
  stock: number;
}

export interface SellerProductFullUpdateInput {
  price?: number;
  stock?: number;
  title?: string;
  description?: string | null;
  category?: string | null;
  sku?: string | null;
  images?: { url: string; alt?: string }[];
  isCustomizable?: boolean;
  basePrice?: number;
  inventory?: number;
  metadata?: Record<string, unknown>;
}

export interface SellerVariantInput {
  name: string;
  value: string;
  priceDelta?: number;
  sku?: string | null;
  inventory?: number;
  image?: string | null;
  images?: string[];
  customizationMode?: string | null;
}

export interface SellerVariantPatchInput {
  priceDelta?: number;
  sku?: string | null;
  inventory?: number;
  image?: string | null;
  images?: string[];
  customizationMode?: string | null;
}

export interface ExistingProductRequestInput {
  productId: string;
  price: number;
  stock: number;
}

@Injectable()
export class MarketplaceService {
  constructor(private prisma: PrismaService) {}

  // ── Guards ────────────────────────────────────────────────────────────────

  /** Loads the seller and asserts they are approved and may list products. */
  private async requireApprovedSeller(sellerId: string) {
    const seller = await this.prisma.seller.findUnique({ where: { id: sellerId } });
    if (!seller) throw new NotFoundException("Seller account not found");
    if (seller.status !== "approved") {
      throw new ForbiddenException(
        seller.status === "pending"
          ? "Your account is still under review — you can list products once approved."
          : "Your seller account is not active.",
      );
    }
    if (seller.mode === "vendor_only") {
      throw new ForbiddenException(
        "Your account is set up for manufacturing only. Contact Gifteeng to also sell your own products.",
      );
    }
    return seller;
  }

  private async generateSlug(title: string): Promise<string> {
    const base =
      title.toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "product";
    let candidate = base;
    let n = 1;
    while (await this.prisma.product.findUnique({ where: { slug: candidate } })) {
      n++;
      candidate = `${base}-${n}`;
    }
    return candidate;
  }

  private price(v: number): Prisma.Decimal {
    if (!Number.isFinite(v) || v <= 0) throw new BadRequestException("Enter a valid price");
    return new Prisma.Decimal(v.toFixed(2));
  }

  // ── Seller: own offers ────────────────────────────────────────────────────

  async listSellerProducts(sellerId: string) {
    await this.requireApprovedSeller(sellerId);
    const rows = await this.prisma.sellerProduct.findMany({
      where: { sellerId },
      orderBy: { createdAt: "desc" },
      include: {
        product: {
          select: {
            id: true, slug: true, title: true, category: true,
            images: true, basePrice: true, b2cEnabled: true,
          },
        },
      },
    });
    return rows;
  }

  /**
   * Catalogue products the seller can request to also sell — published
   * products they aren't already offering.
   */
  async browseCatalog(sellerId: string, search?: string) {
    await this.requireApprovedSeller(sellerId);
    const mine = await this.prisma.sellerProduct.findMany({
      where: { sellerId },
      select: { productId: true },
    });
    const excludeIds = mine.map((m) => m.productId);
    return this.prisma.product.findMany({
      where: {
        b2cEnabled: true,
        id: { notIn: excludeIds.length ? excludeIds : undefined },
        ...(search?.trim()
          ? { title: { contains: search.trim(), mode: "insensitive" } }
          : {}),
      },
      select: {
        id: true, slug: true, title: true, category: true,
        images: true, basePrice: true, brandName: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  /** Seller creates a brand-new product (own listing) — pending verification. */
  async createOwnListing(sellerId: string, input: OwnListingInput) {
    const seller = await this.requireApprovedSeller(sellerId);
    if (!input.title?.trim()) throw new BadRequestException("Product title is required");
    const price = this.price(input.price);
    const slug = await this.generateSlug(input.title);

    // The product stays hidden from the public catalogue (b2cEnabled = false)
    // until a super-admin verifies the seller's offer.
    const result = await this.prisma.$transaction(async (tx) => {
      const meta: Record<string, unknown> = { ...(input.metadata ?? {}) };
      if (input.customizationType) meta.customizationType = input.customizationType;

      const product = await tx.product.create({
        data: {
          slug,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          category: input.category?.trim() || null,
          sku: input.sku?.trim() || null,
          brandName: seller.brandName,
          basePrice: price,
          currency: "INR",
          inventory: input.stock ?? 0,
          isCustomizable: input.isCustomizable ?? false,
          images: (input.images as Prisma.InputJsonValue) ?? undefined,
          metadata: Object.keys(meta).length ? (meta as Prisma.InputJsonValue) : undefined,
          b2cEnabled: false,
          b2bEnabled: false,
        },
      });

      // Create one ProductVariantOption row per (name, value) pair
      if (input.variantOptions?.length) {
        await tx.productVariantOption.createMany({
          data: input.variantOptions.flatMap((opt) =>
            opt.values.map((value) => ({ productId: product.id, name: opt.name, value })),
          ),
        });
      }

      const offer = await tx.sellerProduct.create({
        data: {
          sellerId,
          productId: product.id,
          isOwnListing: true,
          price,
          stock: input.stock ?? 0,
          status: "pending",
        },
        include: { product: { include: { variantOptions: true } } },
      });
      return offer;
    });
    return result;
  }

  /** Seller requests to also sell an existing catalogue product. */
  async requestExistingProduct(sellerId: string, input: ExistingProductRequestInput) {
    await this.requireApprovedSeller(sellerId);
    const product = await this.prisma.product.findUnique({ where: { id: input.productId } });
    if (!product) throw new NotFoundException("Product not found");

    const existing = await this.prisma.sellerProduct.findUnique({
      where: { sellerId_productId: { sellerId, productId: input.productId } },
    });
    if (existing) throw new BadRequestException("You have already listed this product");

    return this.prisma.sellerProduct.create({
      data: {
        sellerId,
        productId: input.productId,
        isOwnListing: false,
        price: this.price(input.price),
        stock: input.stock ?? 0,
        status: "pending",
      },
      include: { product: true },
    });
  }

  /** Seller updates price / stock on one of their offers. */
  async updateSellerProduct(
    sellerId: string,
    id: string,
    patch: { price?: number; stock?: number },
  ) {
    await this.requireApprovedSeller(sellerId);
    const offer = await this.prisma.sellerProduct.findUnique({ where: { id } });
    if (!offer || offer.sellerId !== sellerId) throw new NotFoundException("Listing not found");

    const data: Prisma.SellerProductUpdateInput = {};
    if (patch.price !== undefined) data.price = this.price(patch.price);
    if (patch.stock !== undefined) {
      if (!Number.isInteger(patch.stock) || patch.stock < 0) {
        throw new BadRequestException("Stock must be a non-negative whole number");
      }
      data.stock = patch.stock;
    }
    return this.prisma.sellerProduct.update({ where: { id }, data, include: { product: true } });
  }

  async deleteSellerProduct(sellerId: string, id: string) {
    await this.requireApprovedSeller(sellerId);
    const offer = await this.prisma.sellerProduct.findUnique({ where: { id } });
    if (!offer || offer.sellerId !== sellerId) throw new NotFoundException("Listing not found");
    await this.prisma.sellerProduct.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Super-admin: verification queue ───────────────────────────────────────

  async listOffers(status?: string) {
    const valid = ["pending", "approved", "rejected"];
    return this.prisma.sellerProduct.findMany({
      where: status && valid.includes(status) ? { status: status as never } : {},
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { id: true, slug: true, title: true, images: true, category: true } },
        seller:  { select: { id: true, brandName: true, legalName: true, city: true, status: true } },
      },
    });
  }

  /** Approve an offer — makes it visible on the marketplace. */
  async approveOffer(id: string) {
    const offer = await this.prisma.sellerProduct.findUnique({ where: { id } });
    if (!offer) throw new NotFoundException("Listing not found");

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.sellerProduct.update({
        where: { id },
        data: { status: "approved", approvedAt: new Date(), rejectedReason: null },
        include: { product: true, seller: { select: { brandName: true } } },
      });
      // An own-listing product is hidden until its first offer is approved —
      // flip it live now so it shows in the public catalogue.
      if (offer.isOwnListing) {
        await tx.product.update({ where: { id: offer.productId }, data: { b2cEnabled: true } });
      }
      return updated;
    });
  }

  // ── Buyer-facing: sellers offering a product ──────────────────────────────

  /**
   * Pincode proximity score (0–6): how many leading digits of the buyer's
   * and seller's pincodes match. India pincodes are hierarchical — a longer
   * shared prefix means a geographically closer seller, so orders can be
   * routed to the nearest seller first.
   */
  private pincodeProximity(buyer?: string, seller?: string): number {
    if (!buyer || !seller) return 0;
    const a = buyer.replace(/\D/g, "");
    const b = seller.replace(/\D/g, "");
    let n = 0;
    for (let i = 0; i < Math.min(a.length, b.length, 6); i++) {
      if (a[i] === b[i]) n++;
      else break;
    }
    return n;
  }

  /**
   * Approved seller offers for a product, ranked for the buyer. Preference:
   * (1) nearest seller by pincode proximity, (2) higher product rating,
   * (3) higher seller rating, (4) lower price. Bank / KYC details are never
   * exposed — only the public brand, location and ratings.
   */
  async listProductSellers(slugOrId: string, pincode?: string) {
    const product = await this.prisma.product.findFirst({
      where: /^[0-9a-f]{8}-/i.test(slugOrId) ? { id: slugOrId } : { slug: slugOrId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException("Product not found");

    const offers = await this.prisma.sellerProduct.findMany({
      where: { productId: product.id, status: "approved" },
      include: {
        seller: {
          select: {
            id: true, brandName: true, slug: true, city: true, state: true, pincode: true,
            ratingAvg: true, ratingCount: true, status: true, chargesCourier: true,
          },
        },
      },
    });

    const live = offers.filter((o) => o.seller.status === "approved");
    const ranked = live
      .map((o) => ({
        offer: o,
        proximity: this.pincodeProximity(pincode, o.seller.pincode),
      }))
      .sort((a, b) => {
        if (b.proximity !== a.proximity) return b.proximity - a.proximity;
        if (b.offer.ratingAvg !== a.offer.ratingAvg) return b.offer.ratingAvg - a.offer.ratingAvg;
        if (b.offer.seller.ratingAvg !== a.offer.seller.ratingAvg) {
          return b.offer.seller.ratingAvg - a.offer.seller.ratingAvg;
        }
        return Number(a.offer.price) - Number(b.offer.price);
      });

    return ranked.map(({ offer, proximity }, i) => ({
      sellerProductId: offer.id,
      price:           Number(offer.price),
      stock:           offer.stock,
      inStock:         offer.stock > 0,
      productRating:   { avg: offer.ratingAvg, count: offer.ratingCount },
      isRecommended:   i === 0,
      chargesCourier:  offer.seller.chargesCourier,
      proximity,
      seller: {
        id:          offer.seller.id,
        brandName:   offer.seller.brandName,
        slug:        offer.seller.slug,
        city:        offer.seller.city,
        state:       offer.seller.state,
        rating:      { avg: offer.seller.ratingAvg, count: offer.seller.ratingCount },
      },
    }));
  }

  async rejectOffer(id: string, reason: string) {
    const offer = await this.prisma.sellerProduct.findUnique({ where: { id } });
    if (!offer) throw new NotFoundException("Listing not found");
    return this.prisma.sellerProduct.update({
      where: { id },
      data: { status: "rejected", rejectedReason: reason.trim() || "Not specified" },
      include: { product: true, seller: { select: { brandName: true } } },
    });
  }

  // ── Seller: full product management ──────────────────────────────────────

  /** Load a single offer with its full product (for the editor). */
  async getSellerProduct(sellerId: string, id: string) {
    const offer = await this.prisma.sellerProduct.findUnique({
      where: { id },
      include: { product: { include: { variantOptions: true } } },
    });
    if (!offer || offer.sellerId !== sellerId) throw new NotFoundException("Listing not found");
    return offer;
  }

  /** Full update: touches SellerProduct (price/stock) and, for own listings, the Product record. */
  async updateSellerProductFull(sellerId: string, id: string, patch: SellerProductFullUpdateInput) {
    await this.requireApprovedSeller(sellerId);
    const offer = await this.prisma.sellerProduct.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!offer || offer.sellerId !== sellerId) throw new NotFoundException("Listing not found");

    return this.prisma.$transaction(async (tx) => {
      // ── SellerProduct ─────────────────────────────────────────────────────
      const spData: Prisma.SellerProductUpdateInput = {};
      if (patch.price !== undefined) spData.price = this.price(patch.price);
      if (patch.stock !== undefined) {
        if (!Number.isInteger(patch.stock) || patch.stock < 0)
          throw new BadRequestException("Stock must be a non-negative whole number");
        spData.stock = patch.stock;
      }
      if (Object.keys(spData).length > 0) {
        await tx.sellerProduct.update({ where: { id }, data: spData });
      }

      // ── Product (own listings only) ───────────────────────────────────────
      if (offer.isOwnListing) {
        const pData: Prisma.ProductUpdateInput = {};
        if (patch.title?.trim()) pData.title = patch.title.trim();
        if (patch.description !== undefined) pData.description = patch.description?.trim() || null;
        if (patch.category !== undefined) pData.category = patch.category?.trim() || null;
        if (patch.sku !== undefined) pData.sku = patch.sku?.trim() || null;
        if (patch.images !== undefined) pData.images = patch.images as Prisma.InputJsonValue;
        if (patch.isCustomizable !== undefined) pData.isCustomizable = patch.isCustomizable;
        if (patch.basePrice !== undefined) pData.basePrice = this.price(patch.basePrice);
        if (patch.inventory !== undefined) pData.inventory = patch.inventory;
        if (patch.metadata !== undefined) {
          const existing = (offer.product.metadata as Record<string, unknown>) ?? {};
          pData.metadata = { ...existing, ...patch.metadata } as Prisma.InputJsonValue;
        }
        if (Object.keys(pData).length > 0) {
          await tx.product.update({ where: { id: offer.productId }, data: pData });
        }
      }

      return tx.sellerProduct.findUnique({
        where: { id },
        include: { product: { include: { variantOptions: true } } },
      });
    });
  }

  /** Add a variant to a seller's own listing. */
  async addSellerVariant(sellerId: string, sellerProductId: string, data: SellerVariantInput) {
    const offer = await this.prisma.sellerProduct.findUnique({ where: { id: sellerProductId } });
    if (!offer || offer.sellerId !== sellerId) throw new NotFoundException("Listing not found");
    if (!offer.isOwnListing) throw new ForbiddenException("Cannot add variants to catalogue products");
    return this.prisma.productVariantOption.create({
      data: {
        productId:         offer.productId,
        name:              data.name,
        value:             data.value,
        priceDelta:        new Prisma.Decimal((data.priceDelta ?? 0).toFixed(2)),
        sku:               data.sku ?? null,
        inventory:         data.inventory ?? 0,
        image:             data.image ?? data.images?.[0] ?? null,
        images:            (data.images ?? []) as Prisma.InputJsonValue,
        customizationMode: data.customizationMode ?? null,
      },
    });
  }

  /** Update a variant on a seller's own listing. */
  async updateSellerVariant(
    sellerId: string,
    sellerProductId: string,
    variantId: string,
    patch: SellerVariantPatchInput,
  ) {
    const offer = await this.prisma.sellerProduct.findUnique({ where: { id: sellerProductId } });
    if (!offer || offer.sellerId !== sellerId) throw new NotFoundException("Listing not found");
    const variant = await this.prisma.productVariantOption.findUnique({ where: { id: variantId } });
    if (!variant || variant.productId !== offer.productId) throw new NotFoundException("Variant not found");

    const data: Prisma.ProductVariantOptionUpdateInput = {};
    if (patch.priceDelta !== undefined) data.priceDelta = new Prisma.Decimal(patch.priceDelta.toFixed(2));
    if (patch.sku !== undefined) data.sku = patch.sku;
    if (patch.inventory !== undefined) data.inventory = patch.inventory;
    if (patch.image !== undefined) data.image = patch.image;
    if (patch.images !== undefined) data.images = patch.images as Prisma.InputJsonValue;
    if (patch.customizationMode !== undefined) data.customizationMode = patch.customizationMode;
    return this.prisma.productVariantOption.update({ where: { id: variantId }, data });
  }

  /** Resubmit a rejected listing — resets status to pending so admin reviews again. */
  async resubmitSellerProduct(sellerId: string, id: string) {
    const offer = await this.prisma.sellerProduct.findUnique({ where: { id } });
    if (!offer || offer.sellerId !== sellerId) throw new NotFoundException("Listing not found");
    if (offer.status !== "rejected") throw new BadRequestException("Only rejected listings can be resubmitted");
    return this.prisma.sellerProduct.update({
      where: { id },
      data: { status: "pending", rejectedReason: null },
      include: { product: { include: { variantOptions: true } } },
    });
  }

  /** Delete a variant from a seller's own listing. */
  async deleteSellerVariant(sellerId: string, sellerProductId: string, variantId: string) {
    const offer = await this.prisma.sellerProduct.findUnique({ where: { id: sellerProductId } });
    if (!offer || offer.sellerId !== sellerId) throw new NotFoundException("Listing not found");
    const variant = await this.prisma.productVariantOption.findUnique({ where: { id: variantId } });
    if (!variant || variant.productId !== offer.productId) throw new NotFoundException("Variant not found");
    await this.prisma.productVariantOption.delete({ where: { id: variantId } });
    return { deleted: true };
  }

  // ── Bulk upload ───────────────────────────────────────────────────────────

  /** Category-specific extra columns for the bulk upload template. */
  static readonly CATEGORY_EXTRA: Record<string, { cols: string[]; ex1: string[]; ex2: string[] }> = {
    "Photo Frames & Albums": {
      cols: ["frame_size", "frame_material"],
      ex1: ["4x6 inches", "Wooden"],
      ex2: ["5x7 inches", "Metal"],
    },
    "Mugs & Drinkware": {
      cols: ["capacity_ml", "mug_material"],
      ex1: ["350", "Ceramic"],
      ex2: ["250", "Steel"],
    },
    "Cushions & Pillows": {
      cols: ["cushion_size_inches", "filling_type"],
      ex1: ["16x16", "Hollow fibre"],
      ex2: ["12x12", "Polyester"],
    },
    "Wall Art & Canvas": {
      cols: ["dimensions_inches", "medium"],
      ex1: ["12x18", "Canvas print"],
      ex2: ["18x24", "Framed poster"],
    },
    "Personalised Jewelry": {
      cols: ["metal_type", "occasion"],
      ex1: ["Sterling silver", "Anniversary"],
      ex2: ["Gold plated", "Birthday"],
    },
    "Clothing & Apparels": {
      cols: ["sizes_available", "fabric"],
      ex1: ["S,M,L,XL", "Cotton"],
      ex2: ["M,L,XL,XXL", "Polyester"],
    },
    "Gift Hampers & Combos": {
      cols: ["hamper_contents", "box_type"],
      ex1: ["Chocolates x2 Mug x1", "Premium gift box"],
      ex2: ["Cookies x3 Frame x1", "Kraft box"],
    },
    "Stationery & Notebooks": {
      cols: ["item_type", "page_count"],
      ex1: ["Notebook", "200"],
      ex2: ["Planner", "160"],
    },
    "Home Décor": {
      cols: ["dimensions_cm", "material"],
      ex1: ["10x8x5", "Resin"],
      ex2: ["20x15", "Ceramic"],
    },
    "Keychains & Accessories": {
      cols: ["material", "attachment_type"],
      ex1: ["Metal", "Ring"],
      ex2: ["Acrylic", "Carabiner"],
    },
    "Calendars & Planners": {
      cols: ["year", "page_count"],
      ex1: ["2027", "14"],
      ex2: ["2027", "13"],
    },
    "Cakes & Edibles": {
      cols: ["weight_grams", "flavour"],
      ex1: ["500", "Chocolate"],
      ex2: ["1000", "Vanilla"],
    },
  };

  /** Return a CSV template sellers can fill in and upload. */
  generateBulkTemplate(category?: string): string {
    const extra = category ? (MarketplaceService.CATEGORY_EXTRA[category] ?? null) : null;

    const baseCols = ["title*", "description", "category", "sku", "price*", "stock*", "image_url_1", "image_url_2", "is_customizable"];
    const header   = [...baseCols, ...(extra?.cols ?? [])].join(",");

    const baseEx1  = ["Personalised Wooden Frame", "A beautiful wooden photo frame customised with your name", category ?? "Home Décor", "WF-001", "499", "10", "", "", "false"];
    const baseEx2  = ["Custom Name Keychain", "Laser engraved metal keychain with custom text", category ?? "Keychains & Accessories", "KC-002", "199", "25", "", "", "false"];

    const example1 = [...baseEx1, ...(extra?.ex1 ?? [])].join(",");
    const example2 = [...baseEx2, ...(extra?.ex2 ?? [])].join(",");

    const catLine  = category ? `# Category: ${category}` : "# Generic template — select a category for extra columns";

    return [
      "# Gifteeng Bulk Product Upload Template",
      catLine,
      "# Fill rows 5 onwards. Do not modify the header row (row 4).",
      "# Columns marked * are required. Delete example rows before uploading.",
      header,
      example1,
      example2,
    ].join("\n");
  }

  /** Parse uploaded CSV and bulk-create listings. Rows that fail are skipped and reported. */
  async bulkCreateListings(
    sellerId: string,
    csvText: string,
  ): Promise<{ created: number; skipped: number; errors: { row: number; reason: string }[] }> {
    await this.requireApprovedSeller(sellerId);

    const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    if (lines.length === 0) throw new BadRequestException("Empty file");

    // First non-comment line is header
    const header = lines[0]!.split(",").map(h => h.replace(/\*/g, "").trim());
    const idx = (name: string) => header.indexOf(name);

    const titleIdx    = idx("title");
    const priceIdx    = idx("price");
    const stockIdx    = idx("stock");
    const descIdx     = idx("description");
    const catIdx      = idx("category");
    const skuIdx      = idx("sku");
    const img1Idx     = idx("image_url_1");
    const img2Idx     = idx("image_url_2");
    const customIdx   = idx("is_customizable");

    if (titleIdx === -1 || priceIdx === -1 || stockIdx === -1) {
      throw new BadRequestException("CSV header must contain: title*, price*, stock*");
    }

    const dataRows = lines.slice(1);
    let created = 0, skipped = 0;
    const errors: { row: number; reason: string }[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const line = dataRows[i]!;
      if (!line.trim()) continue;

      // Simple CSV split (handles basic quoting)
      const cells = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));

      const title = cells[titleIdx]?.trim();
      const priceRaw = parseFloat(cells[priceIdx] ?? "");
      const stockRaw = parseInt(cells[stockIdx] ?? "", 10);

      if (!title) { errors.push({ row: i + 2, reason: "Missing title" }); skipped++; continue; }
      if (!isFinite(priceRaw) || priceRaw <= 0) { errors.push({ row: i + 2, reason: "Invalid price" }); skipped++; continue; }
      if (!Number.isInteger(stockRaw) || stockRaw < 0) { errors.push({ row: i + 2, reason: "Invalid stock" }); skipped++; continue; }

      const images: { url: string }[] = [];
      if (img1Idx !== -1 && cells[img1Idx]?.trim()) images.push({ url: cells[img1Idx]!.trim() });
      if (img2Idx !== -1 && cells[img2Idx]?.trim()) images.push({ url: cells[img2Idx]!.trim() });

      try {
        await this.createOwnListing(sellerId, {
          title,
          description: descIdx !== -1 ? (cells[descIdx]?.trim() || undefined) : undefined,
          category:    catIdx  !== -1 ? (cells[catIdx]?.trim()  || undefined) : undefined,
          sku:         skuIdx  !== -1 ? (cells[skuIdx]?.trim()  || undefined) : undefined,
          images:      images.length ? images : undefined,
          isCustomizable: customIdx !== -1 ? cells[customIdx]?.trim() === "true" : false,
          price: priceRaw,
          stock: stockRaw,
        });
        created++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ row: i + 2, reason: msg });
        skipped++;
      }
    }

    return { created, skipped, errors };
  }

  // ── Public seller store ──────────────────────────────────────────────────

  async getSellerStore(slug: string, customerId?: string) {
    const seller = await this.prisma.seller.findUnique({
      where: { slug },
      select: {
        id: true,
        brandName: true,
        slug: true,
        ratingAvg: true,
        ratingCount: true,
        followerCount: true,
        city: true,
        state: true,
        createdAt: true,
      },
    });
    if (!seller) throw new NotFoundException("Store not found");

    const [products, totalSold, isFollowing] = await Promise.all([
      this.prisma.sellerProduct.findMany({
        where: { sellerId: seller.id, status: "approved" },
        orderBy: { viewCount: "desc" },
        include: {
          product: {
            select: {
              id: true, title: true, slug: true, category: true,
              images: true, basePrice: true,
            },
          },
        },
      }),
      this.prisma.orderItemAssignment.count({
        where: { sellerId: seller.id, status: "delivered" },
      }),
      customerId
        ? this.prisma.sellerFollower.findUnique({
            where: { sellerId_customerId: { sellerId: seller.id, customerId } },
            select: { id: true },
          }).then(Boolean)
        : Promise.resolve(false),
    ]);

    return {
      ...seller,
      productCount: products.length,
      totalSold,
      isFollowing,
      products: products.map((sp) => ({
        sellerProductId: sp.id,
        price: Number(sp.price),
        stock: sp.stock,
        ratingAvg: sp.ratingAvg,
        ratingCount: sp.ratingCount,
        viewCount: sp.viewCount,
        product: sp.product,
      })),
    };
  }

  async followSeller(slug: string, customerId: string) {
    const seller = await this.prisma.seller.findUnique({ where: { slug }, select: { id: true } });
    if (!seller) throw new NotFoundException("Store not found");

    await this.prisma.sellerFollower.upsert({
      where: { sellerId_customerId: { sellerId: seller.id, customerId } },
      create: { sellerId: seller.id, customerId },
      update: {},
    });
    await this.prisma.seller.update({
      where: { id: seller.id },
      data: { followerCount: { increment: 1 } },
    });
    return { following: true };
  }

  async unfollowSeller(slug: string, customerId: string) {
    const seller = await this.prisma.seller.findUnique({ where: { slug }, select: { id: true } });
    if (!seller) throw new NotFoundException("Store not found");

    const deleted = await this.prisma.sellerFollower.deleteMany({
      where: { sellerId: seller.id, customerId },
    });
    if (deleted.count > 0) {
      await this.prisma.seller.update({
        where: { id: seller.id },
        data: { followerCount: { decrement: 1 } },
      });
    }
    return { following: false };
  }

  async trackProductView(sellerProductId: string) {
    await this.prisma.sellerProduct.update({
      where: { id: sellerProductId },
      data: { viewCount: { increment: 1 } },
    }).catch(() => { /* ignore if ID doesn't exist */ });
  }
}
