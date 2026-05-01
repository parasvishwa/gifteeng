import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type CreateLinkInput = {
  name: string;
  store_url: string;
  icon_url?: string;
  sort_order?: number;
  is_active?: boolean;
};

export type UpdateLinkInput = Partial<CreateLinkInput>;

@Injectable()
export class MarketplaceLinksService {
  constructor(private prisma: PrismaService) {}

  listAll() {
    return this.prisma.marketplaceLink.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  async create(input: CreateLinkInput) {
    const link = await this.prisma.marketplaceLink.create({
      data: {
        name: input.name,
        storeUrl: input.store_url,
        iconUrl: input.icon_url,
        sortOrder: input.sort_order ?? 0,
        isActive: input.is_active ?? true,
      },
    });
    return this.toSnake(link);
  }

  async update(id: string, input: UpdateLinkInput) {
    const existing = await this.prisma.marketplaceLink.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Marketplace link not found");
    const updated = await this.prisma.marketplaceLink.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.store_url !== undefined && { storeUrl: input.store_url }),
        ...(input.icon_url !== undefined && { iconUrl: input.icon_url }),
        ...(input.sort_order !== undefined && { sortOrder: input.sort_order }),
        ...(input.is_active !== undefined && { isActive: input.is_active }),
      },
    });
    return this.toSnake(updated);
  }

  async remove(id: string) {
    const existing = await this.prisma.marketplaceLink.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Marketplace link not found");
    await this.prisma.marketplaceLink.delete({ where: { id } });
    return { ok: true };
  }

  private toSnake(link: any) {
    return {
      id: link.id,
      name: link.name,
      icon_url: link.iconUrl,
      store_url: link.storeUrl,
      is_active: link.isActive,
      sort_order: link.sortOrder,
      created_at: link.createdAt,
    };
  }
}
