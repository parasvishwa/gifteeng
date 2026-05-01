import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@gifteeng/db";
import { PrismaService } from "../../prisma/prisma.service";

export type CustomerListQuery = {
  search?: string;
  page?: number;
  pageSize?: number;
};

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async list(q: CustomerListQuery) {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, q.pageSize ?? 20);
    const where: Prisma.CustomerWhereInput = {};
    if (q.search) {
      where.OR = [
        { email: { contains: q.search, mode: "insensitive" } },
        { phone: { contains: q.search, mode: "insensitive" } },
        { fullName: { contains: q.search, mode: "insensitive" } },
      ];
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          phone: true,
          fullName: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      email: r.email,
      phone: r.phone,
      fullName: r.fullName,
      createdAt: r.createdAt,
      ordersCount: r._count.orders,
    }));
    return { items, total, page, pageSize };
  }

  async getById(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        orders: { orderBy: { placedAt: "desc" }, take: 50 },
        savedAddresses: true,
        reviews: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
    if (!customer) throw new NotFoundException();
    return customer;
  }

  /**
   * Admin delete. Tries a real DELETE first so the phone/email become free
   * for re-registration. If an FK from Order/Review blocks the delete, we
   * fall back to the anonymize path (null out PII, scrub OTPs, keep the row
   * for order history integrity).
   */
  async deleteAdmin(id: string, mode: "hard" | "anonymize" = "hard") {
    const existing = await this.prisma.customer.findUnique({
      where: { id },
      select: { id: true, phone: true, email: true },
    });
    if (!existing) throw new NotFoundException();

    // Always purge PhoneOtp rows for the customer's phone so a re-registration
    // with the same number isn't stuck with stale rate-limit / verified state.
    if (existing.phone) {
      await this.prisma.phoneOtp.deleteMany({ where: { phone: existing.phone } });
    }

    if (mode === "anonymize") {
      return this.anonymize(id);
    }

    try {
      await this.prisma.customer.delete({ where: { id } });
      return { deleted: true, anonymized: false };
    } catch (err) {
      const code = (err as { code?: string })?.code;
      // P2003 = FK constraint, P2014 = required relation
      if (code === "P2003" || code === "P2014") {
        await this.anonymize(id);
        return { deleted: false, anonymized: true };
      }
      throw err;
    }
  }

  /**
   * Anonymize = keep the customer row (so past orders/reviews remain valid)
   * but null every PII field and flip a metadata flag so they're hidden from
   * admin lists. Frees phone + email for a brand-new customer to claim them.
   */
  private async anonymize(id: string) {
    await this.prisma.customer.update({
      where: { id },
      data: {
        phone: null,
        email: null,
        fullName: "Deleted Customer",
        passwordHash: null,
        googleId: null,
        avatarUrl: null,
        emailVerified: false,
        phoneVerified: false,
        metadata: { __deleted: true, __deletedAt: new Date().toISOString() },
      },
    });
    return { deleted: false, anonymized: true };
  }
}
