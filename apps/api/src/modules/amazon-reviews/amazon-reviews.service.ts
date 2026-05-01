import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ImportsService } from "../imports/imports.service";

@Injectable()
export class AmazonReviewsService {
  constructor(
    private prisma: PrismaService,
    private imports: ImportsService,
  ) {}

  async list(params: {
    productId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: unknown[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, params.pageSize ?? 20);
    const where: Record<string, unknown> = {};
    if (params.productId) where.productId = params.productId;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.amazonReview.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.amazonReview.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async importFromUrl(
    productId: string,
    sourceUrl: string,
  ): Promise<{ drafts: unknown[]; importResult: unknown }> {
    const importResult = await this.imports.importFromUrl(sourceUrl);
    const drafts = await this.prisma.$transaction(async (tx) => {
      const created = await tx.amazonReview.create({
        data: {
          productId,
          rating: 5,
          title: "Imported review draft",
          body: "Pending review content extraction",
          sourceUrl,
          isImported: true,
        },
      });
      return [created];
    });
    return { drafts, importResult };
  }

  async remove(id: string): Promise<unknown> {
    const existing = await this.prisma.amazonReview.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Amazon review not found");
    return this.prisma.amazonReview.delete({ where: { id } });
  }
}
