import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@gifteeng/db";
import { PrismaService } from "../../prisma/prisma.service";

export type CreateCompanyInput = {
  name: string;
  slug: string;
  logoUrl?: string;
  brandColor?: string;
  billingEmail?: string;
  billingAddress?: unknown;
  status?: "active" | "suspended" | "pending";
};

export type UpdateCompanyInput = Partial<CreateCompanyInput>;

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  listAll() {
    return this.prisma.company.findMany({ orderBy: { createdAt: "desc" } });
  }

  async getById(id: string, caller: { role: string; companyId?: string | null }) {
    const isStaff = caller.role === "super_admin" || caller.role === "sales_admin";
    if (!isStaff && caller.companyId !== id) throw new ForbiddenException();
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException();
    return company;
  }

  getMe(companyId: string) {
    return this.prisma.company.findUnique({ where: { id: companyId } });
  }

  listEmployees(companyId: string) {
    return this.prisma.companyUser.findMany({
      where: { companyId },
      select: {
        id: true,
        companyId: true,
        email: true,
        phone: true,
        fullName: true,
        role: true,
        isActive: true,
        invitedAt: true,
        activatedAt: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(input: CreateCompanyInput) {
    return this.prisma.company.create({
      data: {
        name: input.name,
        slug: input.slug,
        logoUrl: input.logoUrl,
        brandColor: input.brandColor,
        billingEmail: input.billingEmail,
        billingAddress: (input.billingAddress as Prisma.InputJsonValue) ?? undefined,
        status: input.status ?? "active",
      },
    });
  }

  async update(id: string, input: UpdateCompanyInput) {
    const existing = await this.prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    return this.prisma.company.update({
      where: { id },
      data: {
        name: input.name,
        slug: input.slug,
        logoUrl: input.logoUrl,
        brandColor: input.brandColor,
        billingEmail: input.billingEmail,
        billingAddress: input.billingAddress !== undefined
          ? (input.billingAddress as Prisma.InputJsonValue)
          : undefined,
        status: input.status,
      },
    });
  }
}
