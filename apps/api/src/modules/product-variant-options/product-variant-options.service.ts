import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type VariantOptionCreateInput = {
  variant_type: string;
  value: string;
  sort_order?: number;
  hex_color?: string;
  image_url?: string | null;
  is_active?: boolean;
};

export type VariantOptionUpdateInput = {
  value?: string;
  sort_order?: number;
  hex_color?: string;
  image_url?: string | null;
  is_active?: boolean;
};

function toSnakeCase(record: any): any {
  return {
    id: record.id,
    variant_type: record.variantType,
    value: record.value,
    hex_color: record.hexColor ?? null,
    image_url: record.imageUrl ?? null,
    sort_order: record.sortOrder,
    is_active: record.isActive,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

@Injectable()
export class ProductVariantOptionsService {
  constructor(private prisma: PrismaService) {}

  async list(pageSize?: number, variantType?: string): Promise<unknown[]> {
    const [records, counts] = await Promise.all([
      this.prisma.productVariantTemplate.findMany({
        where: variantType ? { variantType } : undefined,
        orderBy: [{ variantType: "asc" }, { sortOrder: "asc" }, { value: "asc" }],
        take: pageSize ?? undefined,
      }),
      // Per (name, value) product count — distinct products only so that
      // a product with 3 sizes+1 colour doesn't triple-count the colour.
      this.prisma.productVariantOption.groupBy({
        by: ["name", "value", "productId"],
        _count: { _all: true },
      }),
    ]);
    const key = (n: string, v: string) => `${n.toLowerCase()}|${v.toLowerCase()}`;
    const countMap = new Map<string, number>();
    for (const c of counts) {
      const k = key(c.name, c.value);
      countMap.set(k, (countMap.get(k) ?? 0) + 1);
    }
    return records.map((r) => ({
      ...toSnakeCase(r),
      product_count: countMap.get(key(r.variantType, r.value)) ?? 0,
    }));
  }

  async create(input: VariantOptionCreateInput): Promise<unknown> {
    const record = await this.prisma.productVariantTemplate.create({
      data: {
        variantType: input.variant_type,
        value: input.value,
        hexColor: input.hex_color,
        imageUrl: input.image_url ?? null,
        sortOrder: input.sort_order ?? 0,
        isActive: input.is_active ?? true,
      },
    });
    return toSnakeCase(record);
  }

  async update(id: string, input: VariantOptionUpdateInput): Promise<unknown> {
    const existing = await this.prisma.productVariantTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Variant option not found");
    const record = await this.prisma.productVariantTemplate.update({
      where: { id },
      data: {
        ...(input.value !== undefined ? { value: input.value } : {}),
        ...(input.sort_order !== undefined ? { sortOrder: input.sort_order } : {}),
        ...(input.hex_color !== undefined ? { hexColor: input.hex_color } : {}),
        ...(input.image_url !== undefined ? { imageUrl: input.image_url } : {}),
        ...(input.is_active !== undefined ? { isActive: input.is_active } : {}),
      },
    });
    return toSnakeCase(record);
  }

  async remove(id: string): Promise<unknown> {
    const existing = await this.prisma.productVariantTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Variant option not found");
    await this.prisma.productVariantTemplate.delete({ where: { id } });
    return { ok: true };
  }

  async removeByType(variantType: string): Promise<unknown> {
    const result = await this.prisma.productVariantTemplate.deleteMany({
      where: { variantType },
    });
    return { ok: true, deleted: result.count };
  }
}
