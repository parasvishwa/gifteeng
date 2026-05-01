import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@gifteeng/db";
import { PrismaService } from "../../prisma/prisma.service";

export type DiscountCreateInput = {
  code: string;
  description?: string;
  percent?: number | string;
  amount?: number | string;
  minOrderTotal?: number | string;
  usageLimit?: number;
  startsAt?: string | Date;
  endsAt?: string | Date;
  isActive?: boolean;
};

export type DiscountUpdateInput = Partial<DiscountCreateInput>;

@Injectable()
export class DiscountsService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.discount.findMany({ orderBy: { createdAt: "desc" } });
  }

  async getById(id: string) {
    const d = await this.prisma.discount.findUnique({ where: { id } });
    if (!d) throw new NotFoundException();
    return d;
  }

  create(input: DiscountCreateInput) {
    return this.prisma.discount.create({
      data: {
        code: input.code,
        description: input.description,
        percent: input.percent !== undefined ? new Prisma.Decimal(input.percent as any) : null,
        amount: input.amount !== undefined ? new Prisma.Decimal(input.amount as any) : null,
        minOrderTotal:
          input.minOrderTotal !== undefined ? new Prisma.Decimal(input.minOrderTotal as any) : null,
        usageLimit: input.usageLimit,
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
        isActive: input.isActive ?? true,
      },
    });
  }

  async update(id: string, input: DiscountUpdateInput) {
    const existing = await this.prisma.discount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    return this.prisma.discount.update({
      where: { id },
      data: {
        code: input.code,
        description: input.description,
        percent:
          input.percent !== undefined ? new Prisma.Decimal(input.percent as any) : undefined,
        amount: input.amount !== undefined ? new Prisma.Decimal(input.amount as any) : undefined,
        minOrderTotal:
          input.minOrderTotal !== undefined
            ? new Prisma.Decimal(input.minOrderTotal as any)
            : undefined,
        usageLimit: input.usageLimit,
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
        isActive: input.isActive,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.discount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    return this.prisma.discount.delete({ where: { id } });
  }

  async validate(code: string, orderTotal: number) {
    const d = await this.prisma.discount.findUnique({ where: { code } });
    if (!d || !d.isActive) return { valid: false };
    if (d.endsAt && d.endsAt < new Date()) return { valid: false };
    if (d.usageLimit != null && d.usedCount >= d.usageLimit) return { valid: false };
    if (d.minOrderTotal != null && orderTotal < Number(d.minOrderTotal)) return { valid: false };
    return { valid: true, percent: d.percent, amount: d.amount };
  }
}
