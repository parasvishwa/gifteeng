import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type VideoCreateInput = {
  title: string;
  description?: string;
  url: string;
  thumbnailUrl?: string;
  productId?: string;
  placement?: string;
  isActive?: boolean;
  isFloating?: boolean;
  sortOrder?: number;
};

export type VideoUpdateInput = Partial<VideoCreateInput>;

type RawVideo = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  thumbnailUrl: string | null;
  productId: string | null;
  placement: string;
  isActive: boolean;
  isFloating: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

function mapToSnakeCase(v: RawVideo): unknown {
  return {
    id: v.id,
    title: v.title,
    description: v.description,
    video_url: v.url,
    thumbnail_url: v.thumbnailUrl,
    product_id: v.productId,
    placement: v.placement,
    is_active: v.isActive,
    show_floating: v.isFloating,
    sort_order: v.sortOrder,
    created_at: v.createdAt,
    updated_at: v.updatedAt,
  };
}

@Injectable()
export class VideosService {
  constructor(private prisma: PrismaService) {}

  async list(params: {
    placement?: string;
    isActive?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: unknown[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, params.pageSize ?? 20);
    const where: Record<string, unknown> = {};
    if (params.placement) where.placement = params.placement;
    if (params.isActive !== undefined) where.isActive = params.isActive;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.video.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.video.count({ where }),
    ]);
    return { items: items.map((v) => mapToSnakeCase(v as RawVideo)), total, page, pageSize };
  }

  async getById(id: string): Promise<unknown> {
    const v = await this.prisma.video.findUnique({ where: { id } });
    if (!v) throw new NotFoundException("Video not found");
    return mapToSnakeCase(v as RawVideo);
  }

  async create(input: VideoCreateInput): Promise<unknown> {
    const v = await this.prisma.video.create({
      data: {
        title: input.title,
        description: input.description,
        url: input.url,
        thumbnailUrl: input.thumbnailUrl,
        productId: input.productId,
        placement: input.placement ?? "home",
        isActive: input.isActive ?? true,
        isFloating: input.isFloating ?? false,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    return mapToSnakeCase(v as RawVideo);
  }

  async update(id: string, input: VideoUpdateInput): Promise<unknown> {
    const existing = await this.prisma.video.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Video not found");
    const v = await this.prisma.video.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.url !== undefined && { url: input.url }),
        ...(input.thumbnailUrl !== undefined && { thumbnailUrl: input.thumbnailUrl }),
        ...(input.productId !== undefined && { productId: input.productId }),
        ...(input.placement !== undefined && { placement: input.placement }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.isFloating !== undefined && { isFloating: input.isFloating }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      },
    });
    return mapToSnakeCase(v as RawVideo);
  }

  async softDelete(id: string): Promise<unknown> {
    const existing = await this.prisma.video.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Video not found");
    const v = await this.prisma.video.update({ where: { id }, data: { isActive: false } });
    return mapToSnakeCase(v as RawVideo);
  }
}
