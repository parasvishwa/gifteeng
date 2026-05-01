import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma } from "@gifteeng/db";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ReferralsService {
  constructor(private prisma: PrismaService) {}

  listAll(): Promise<unknown[]> {
    return this.prisma.referral.findMany({ orderBy: { createdAt: "desc" } });
  }

  async listMine(customerId: string): Promise<{ code: string; history: unknown[] }> {
    let own = await this.prisma.referral.findFirst({
      where: { referrerCustomerId: customerId, refereeCustomerId: null },
    });
    if (!own) {
      const code = `REF-${customerId.slice(0, 8).toUpperCase()}`;
      own = await this.prisma.referral.create({
        data: {
          referrerCustomerId: customerId,
          code,
          status: "pending",
        },
      });
    }
    const history = await this.prisma.referral.findMany({
      where: { referrerCustomerId: customerId },
      orderBy: { createdAt: "desc" },
    });
    return { code: own.code, history };
  }

  async claim(code: string): Promise<unknown> {
    const parent = await this.prisma.referral.findUnique({ where: { code } });
    if (!parent) throw new NotFoundException("Referral code not found");
    return this.prisma.referral.create({
      data: {
        referrerCustomerId: parent.referrerCustomerId,
        code: `${code}-${Date.now()}`,
        status: "pending",
      },
    });
  }

  /** Admin-generated referral code (not tied to a real customer) */
  async generateAdminCode(): Promise<unknown> {
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    const code = `GIFT-${rand}`;
    // Use a well-known system UUID as the referrer — no FK constraint on this column
    const systemId = "00000000-0000-0000-0000-000000000001";
    return this.prisma.referral.create({
      data: {
        referrerCustomerId: systemId,
        code,
        status: "pending",
      },
    });
  }

  async approve(id: string): Promise<unknown> {
    const existing = await this.prisma.referral.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Referral not found");
    if (existing.status === "claimed") {
      throw new BadRequestException("Already claimed");
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.referral.update({
        where: { id },
        data: {
          status: "claimed",
          claimedAt: new Date(),
          rewardAmount: existing.rewardAmount ?? new Prisma.Decimal(100),
        },
      });
      return updated;
    });
  }
}
