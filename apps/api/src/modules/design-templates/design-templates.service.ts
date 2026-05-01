import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type DesignTemplateCreateInput = {
  label: string;
  category?: string;
  thumbnail?: string;
  canvas_json?: unknown;
  is_active?: boolean;
  sort_order?: number;
};

export type DesignTemplateUpdateInput = Partial<DesignTemplateCreateInput>;

function mapOut(t: any) {
  return {
    id: t.id,
    label: t.name,
    category: t.category,
    thumbnail: t.previewUrl,
    canvas_json: t.canvasJson,
    is_active: t.isActive,
    sort_order: t.sortOrder,
    created_at: t.createdAt,
  };
}

@Injectable()
export class DesignTemplatesService {
  constructor(private prisma: PrismaService) {}

  async list(params: { category?: string; active?: boolean }): Promise<unknown[]> {
    const where: Record<string, unknown> = {};
    if (params.category) where.category = params.category;
    if (params.active !== undefined) where.isActive = params.active;
    const items = await this.prisma.designTemplate.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    return items.map(mapOut);
  }

  async getById(id: string): Promise<unknown> {
    const t = await this.prisma.designTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException("Design template not found");
    return mapOut(t);
  }

  async create(input: DesignTemplateCreateInput): Promise<unknown> {
    const t = await this.prisma.designTemplate.create({
      data: {
        name: input.label,
        category: input.category,
        previewUrl: input.thumbnail,
        canvasJson: (input.canvas_json as any) ?? {},
        isActive: input.is_active ?? true,
        sortOrder: input.sort_order ?? 0,
      },
    });
    return mapOut(t);
  }

  async update(id: string, input: DesignTemplateUpdateInput): Promise<unknown> {
    const existing = await this.prisma.designTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Design template not found");
    const t = await this.prisma.designTemplate.update({
      where: { id },
      data: {
        ...(input.label !== undefined && { name: input.label }),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.thumbnail !== undefined && { previewUrl: input.thumbnail }),
        ...(input.canvas_json !== undefined && { canvasJson: input.canvas_json as any }),
        ...(input.is_active !== undefined && { isActive: input.is_active }),
        ...(input.sort_order !== undefined && { sortOrder: input.sort_order }),
      },
    });
    return mapOut(t);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.designTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Design template not found");
    await this.prisma.designTemplate.delete({ where: { id } });
  }

  /** Bulk-insert preset templates; skips if already exists by name */
  async seedPresets(presets: DesignTemplateCreateInput[]): Promise<{ created: number }> {
    let created = 0;
    for (const p of presets) {
      const existing = await this.prisma.designTemplate.findFirst({ where: { name: p.label } });
      if (!existing) {
        await this.create(p);
        created++;
      }
    }
    return { created };
  }
}
