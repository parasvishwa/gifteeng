import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type StockImageCreateInput = {
  url: string;
  alt?: string;
  label?: string;
  category?: string;
  tags?: unknown;
  width?: number;
  height?: number;
  isActive?: boolean;
  sortOrder?: number;
};

export type StockImageUpdateInput = {
  alt?: string;
  label?: string;
  is_active?: boolean;
  sort_order?: number;
};

type RawStockImage = {
  id: string;
  url: string;
  alt: string | null;
  label: string | null;
  category: string | null;
  tags: unknown;
  width: number | null;
  height: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
};

function mapToSnakeCase(img: RawStockImage): unknown {
  return {
    id: img.id,
    image_url: img.url,
    alt: img.alt,
    label: img.label,
    category: img.category,
    tags: img.tags,
    width: img.width,
    height: img.height,
    is_active: img.isActive,
    sort_order: img.sortOrder,
    created_at: img.createdAt,
  };
}

@Injectable()
export class StockImagesService {
  constructor(private prisma: PrismaService) {}

  async list(params: {
    category?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: unknown[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, params.pageSize ?? 20);
    const where: Record<string, unknown> = {};
    if (params.category) where.category = params.category;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockImage.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.stockImage.count({ where }),
    ]);
    return { items: items.map((img) => mapToSnakeCase(img as RawStockImage)), total, page, pageSize };
  }

  async getById(id: string): Promise<unknown> {
    const img = await this.prisma.stockImage.findUnique({ where: { id } });
    if (!img) throw new NotFoundException("Stock image not found");
    return mapToSnakeCase(img as RawStockImage);
  }

  async create(input: StockImageCreateInput): Promise<unknown> {
    const img = await this.prisma.stockImage.create({
      data: {
        url: input.url,
        alt: input.alt,
        label: input.label,
        category: input.category,
        tags: (input.tags as any) ?? undefined,
        width: input.width,
        height: input.height,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    return mapToSnakeCase(img as RawStockImage);
  }

  async update(id: string, input: StockImageUpdateInput): Promise<unknown> {
    const existing = await this.prisma.stockImage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Stock image not found");
    const img = await this.prisma.stockImage.update({
      where: { id },
      data: {
        ...(input.alt !== undefined && { alt: input.alt }),
        ...(input.label !== undefined && { label: input.label }),
        ...(input.is_active !== undefined && { isActive: input.is_active }),
        ...(input.sort_order !== undefined && { sortOrder: input.sort_order }),
      },
    });
    return mapToSnakeCase(img as RawStockImage);
  }

  async remove(id: string): Promise<unknown> {
    const existing = await this.prisma.stockImage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Stock image not found");
    return this.prisma.stockImage.delete({ where: { id } });
  }
}
