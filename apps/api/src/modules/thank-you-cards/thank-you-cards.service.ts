import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type ThankYouCardCreateInput = {
  size: string;
  template_label?: string;
  template_image?: string;
  background_image?: string;
  foreground_image?: string;
  price?: number;
  text_area_x?: number;
  text_area_y?: number;
  text_area_width?: number;
  text_area_height?: number;
  max_font_size?: number;
  min_font_size?: number;
  text_color?: string;
  text_align?: string;
  is_active?: boolean;
  sort_order?: number;
  canvas_json?: unknown;
};

export type ThankYouCardUpdateInput = Partial<ThankYouCardCreateInput>;

function mapOut(c: any) {
  return {
    id: c.id,
    size: c.size,
    template_label: c.templateLabel,
    template_image: c.templateImage,
    background_image: c.backgroundImage,
    foreground_image: c.foregroundImage,
    price: c.price,
    text_area_x: c.textAreaX,
    text_area_y: c.textAreaY,
    text_area_width: c.textAreaWidth,
    text_area_height: c.textAreaHeight,
    max_font_size: c.maxFontSize,
    min_font_size: c.minFontSize,
    text_color: c.textColor,
    text_align: c.textAlign,
    is_active: c.isActive,
    sort_order: c.sortOrder,
    canvas_json: c.canvasJson,
    preview_url: c.previewUrl,
    created_at: c.createdAt,
  };
}

@Injectable()
export class ThankYouCardsService {
  constructor(private prisma: PrismaService) {}

  async list(params: { active?: boolean }): Promise<unknown[]> {
    const where: Record<string, unknown> = {};
    if (params.active !== undefined) where.isActive = params.active;
    const items = await this.prisma.thankYouCard.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    return items.map(mapOut);
  }

  async getById(id: string): Promise<unknown> {
    const c = await this.prisma.thankYouCard.findUnique({ where: { id } });
    if (!c) throw new NotFoundException("Thank-you card not found");
    return mapOut(c);
  }

  async create(input: ThankYouCardCreateInput): Promise<unknown> {
    const c = await this.prisma.thankYouCard.create({
      data: {
        name: input.template_label ?? input.size,
        size: input.size,
        templateLabel: input.template_label,
        templateImage: input.template_image,
        backgroundImage: input.background_image,
        foregroundImage: input.foreground_image,
        price: input.price ?? 5,
        textAreaX: input.text_area_x ?? 10,
        textAreaY: input.text_area_y ?? 60,
        textAreaWidth: input.text_area_width ?? 80,
        textAreaHeight: input.text_area_height ?? 30,
        maxFontSize: input.max_font_size ?? 18,
        minFontSize: input.min_font_size ?? 8,
        textColor: input.text_color ?? "#1A1A2E",
        textAlign: input.text_align ?? "center",
        isActive: input.is_active ?? true,
        sortOrder: input.sort_order ?? 0,
        canvasJson: (input.canvas_json as any) ?? [],
        previewUrl: undefined,
      },
    });
    return mapOut(c);
  }

  async update(id: string, input: ThankYouCardUpdateInput): Promise<unknown> {
    const existing = await this.prisma.thankYouCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Thank-you card not found");
    const c = await this.prisma.thankYouCard.update({
      where: { id },
      data: {
        ...(input.size !== undefined && { size: input.size, name: input.template_label ?? input.size }),
        ...(input.template_label !== undefined && { templateLabel: input.template_label, name: input.template_label }),
        ...(input.template_image !== undefined && { templateImage: input.template_image }),
        ...(input.background_image !== undefined && { backgroundImage: input.background_image }),
        ...(input.foreground_image !== undefined && { foregroundImage: input.foreground_image }),
        ...(input.price !== undefined && { price: input.price }),
        ...(input.text_area_x !== undefined && { textAreaX: input.text_area_x }),
        ...(input.text_area_y !== undefined && { textAreaY: input.text_area_y }),
        ...(input.text_area_width !== undefined && { textAreaWidth: input.text_area_width }),
        ...(input.text_area_height !== undefined && { textAreaHeight: input.text_area_height }),
        ...(input.max_font_size !== undefined && { maxFontSize: input.max_font_size }),
        ...(input.min_font_size !== undefined && { minFontSize: input.min_font_size }),
        ...(input.text_color !== undefined && { textColor: input.text_color }),
        ...(input.text_align !== undefined && { textAlign: input.text_align }),
        ...(input.is_active !== undefined && { isActive: input.is_active }),
        ...(input.sort_order !== undefined && { sortOrder: input.sort_order }),
        ...(input.canvas_json !== undefined && { canvasJson: input.canvas_json as any }),
      },
    });
    return mapOut(c);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.thankYouCard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Thank-you card not found");
    await this.prisma.thankYouCard.delete({ where: { id } });
  }
}
