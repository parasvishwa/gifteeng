import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@gifteeng/db";
import { PrismaService } from "../../prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";

export interface CreateCampaignInput {
  type: "festival" | "reward" | "onboarding" | "milestone" | "custom";
  title: string;
  description?: string;
  budgetTotal: string | number;
  perEmployeeAmount?: string | number;
  startsAt?: string | Date;
  endsAt?: string | Date;
}

@Injectable()
export class CampaignsService {
  constructor(
    private prisma: PrismaService,
    private walletService: WalletService,
  ) {}

  listForCompany(companyId: string) {
    return this.prisma.campaign.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createDraft(companyId: string, input: CreateCampaignInput) {
    const budgetTotal = new Prisma.Decimal(input.budgetTotal as any);
    if (budgetTotal.lte(0))
      throw new BadRequestException("budgetTotal must be positive");

    const perEmployeeAmount =
      input.perEmployeeAmount != null
        ? new Prisma.Decimal(input.perEmployeeAmount as any)
        : null;

    return this.prisma.campaign.create({
      data: {
        companyId,
        type: input.type,
        status: "draft",
        title: input.title,
        description: input.description,
        budgetTotal,
        perEmployeeAmount: perEmployeeAmount ?? undefined,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
      },
    });
  }

  async activate(campaignId: string, companyId: string) {
    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.findUnique({
        where: { id: campaignId },
      });
      if (!campaign) throw new NotFoundException("Campaign not found");
      if (campaign.companyId !== companyId)
        throw new ForbiddenException("Campaign does not belong to company");
      if (campaign.status !== "draft")
        throw new BadRequestException(
          `Cannot activate campaign in status '${campaign.status}'`,
        );

      const wallet = await tx.wallet.findFirst({
        where: { companyId, ownerType: "company" },
      });
      if (!wallet) throw new BadRequestException("Company wallet not found");

      const available = new Prisma.Decimal(wallet.balance).minus(
        new Prisma.Decimal(wallet.lockedBalance),
      );
      const budget = new Prisma.Decimal(campaign.budgetTotal);
      if (available.lt(budget))
        throw new BadRequestException(
          "Insufficient company wallet balance to activate campaign",
        );

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { lockedBalance: { increment: budget } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "lock",
          amount: budget,
          reference: `campaign:${campaign.id}:activate`,
        },
      });

      return tx.campaign.update({
        where: { id: campaignId },
        data: { status: "active" },
      });
    });
  }

  async allocate(
    campaignId: string,
    companyId: string,
    companyUserIds: string[],
  ) {
    if (!companyUserIds.length)
      throw new BadRequestException("companyUserIds must not be empty");

    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.findUnique({
        where: { id: campaignId },
      });
      if (!campaign) throw new NotFoundException("Campaign not found");
      if (campaign.companyId !== companyId)
        throw new ForbiddenException("Campaign does not belong to company");
      if (campaign.status !== "active")
        throw new BadRequestException("Campaign must be active to allocate");
      if (!campaign.perEmployeeAmount)
        throw new BadRequestException(
          "Campaign has no perEmployeeAmount configured",
        );

      const per = new Prisma.Decimal(campaign.perEmployeeAmount);
      const budget = new Prisma.Decimal(campaign.budgetTotal);

      const existing = await tx.campaignAllocation.findMany({
        where: { campaignId },
      });
      const existingTotal = existing.reduce(
        (acc, a) => acc.plus(new Prisma.Decimal(a.amount)),
        new Prisma.Decimal(0),
      );

      const newTotal = per.times(companyUserIds.length);
      if (existingTotal.plus(newTotal).gt(budget))
        throw new BadRequestException(
          "Total allocations would exceed campaign budgetTotal",
        );

      const created = [] as Array<{ id: string }>;
      for (const companyUserId of companyUserIds) {
        const row = await tx.campaignAllocation.create({
          data: {
            campaignId,
            companyUserId,
            amount: per,
            redeemedAmount: new Prisma.Decimal(0),
            status: "pending",
            expiresAt: campaign.endsAt ?? undefined,
          },
        });
        created.push({ id: row.id });
      }
      return { count: created.length, allocations: created };
    });
  }

  async redeem(
    allocationId: string,
    companyUserId: string,
    orderTotal: Prisma.Decimal | string | number,
  ) {
    const order = new Prisma.Decimal(orderTotal as any);
    if (order.lte(0))
      throw new BadRequestException("orderTotal must be positive");

    return this.prisma.$transaction(async (tx) => {
      const allocation = await tx.campaignAllocation.findUnique({
        where: { id: allocationId },
        include: { campaign: true },
      });
      if (!allocation) throw new NotFoundException("Allocation not found");
      if (allocation.companyUserId !== companyUserId)
        throw new ForbiddenException("Allocation does not belong to caller");
      if (allocation.status !== "pending" && allocation.status !== "partial")
        throw new BadRequestException(
          `Allocation status '${allocation.status}' cannot be redeemed`,
        );
      if (allocation.expiresAt && allocation.expiresAt.getTime() < Date.now())
        throw new BadRequestException("Allocation has expired");

      const remaining = new Prisma.Decimal(allocation.amount).minus(
        new Prisma.Decimal(allocation.redeemedAmount),
      );
      const applied = remaining.lte(order) ? remaining : order;
      if (applied.lte(0))
        throw new BadRequestException("No remaining allocation to apply");

      const companyWallet = await tx.wallet.findFirst({
        where: {
          companyId: allocation.campaign.companyId,
          ownerType: "company",
        },
      });
      if (!companyWallet)
        throw new BadRequestException("Company wallet not found");

      if (new Prisma.Decimal(companyWallet.lockedBalance).lt(applied))
        throw new BadRequestException(
          "Insufficient locked balance on company wallet",
        );
      if (new Prisma.Decimal(companyWallet.balance).lt(applied))
        throw new BadRequestException(
          "Insufficient balance on company wallet",
        );

      await tx.wallet.update({
        where: { id: companyWallet.id },
        data: {
          balance: { decrement: applied },
          lockedBalance: { decrement: applied },
        },
      });
      const walletTxn = await tx.walletTransaction.create({
        data: {
          walletId: companyWallet.id,
          type: "debit",
          amount: applied,
          reference: `campaign:${allocation.campaignId}:allocation:${allocation.id}:redeem`,
        },
      });

      const newRedeemed = new Prisma.Decimal(allocation.redeemedAmount).plus(
        applied,
      );
      const fullyConsumed = newRedeemed.gte(
        new Prisma.Decimal(allocation.amount),
      );
      const updated = await tx.campaignAllocation.update({
        where: { id: allocation.id },
        data: {
          redeemedAmount: newRedeemed,
          status: fullyConsumed ? "redeemed" : "partial",
        },
      });

      return { applied, allocation: updated, walletTxn };
    });
  }

  async complete(campaignId: string, companyId: string) {
    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.findUnique({
        where: { id: campaignId },
      });
      if (!campaign) throw new NotFoundException("Campaign not found");
      if (campaign.companyId !== companyId)
        throw new ForbiddenException("Campaign does not belong to company");
      if (campaign.status === "completed" || campaign.status === "cancelled")
        throw new BadRequestException(
          `Campaign already in status '${campaign.status}'`,
        );

      // Sum still-locked amount: budgetTotal minus amounts already redeemed (debited)
      const allocations = await tx.campaignAllocation.findMany({
        where: { campaignId },
      });
      const redeemedTotal = allocations.reduce(
        (acc, a) => acc.plus(new Prisma.Decimal(a.redeemedAmount)),
        new Prisma.Decimal(0),
      );
      const stillLocked = new Prisma.Decimal(campaign.budgetTotal).minus(
        redeemedTotal,
      );

      if (stillLocked.gt(0)) {
        const wallet = await tx.wallet.findFirst({
          where: { companyId, ownerType: "company" },
        });
        if (!wallet)
          throw new BadRequestException("Company wallet not found");

        const actualUnlock = new Prisma.Decimal(wallet.lockedBalance).lt(
          stillLocked,
        )
          ? new Prisma.Decimal(wallet.lockedBalance)
          : stillLocked;

        if (actualUnlock.gt(0)) {
          await tx.wallet.update({
            where: { id: wallet.id },
            data: { lockedBalance: { decrement: actualUnlock } },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: "unlock",
              amount: actualUnlock,
              reference: `campaign:${campaign.id}:complete`,
            },
          });
        }
      }

      // Expire any pending allocations
      await tx.campaignAllocation.updateMany({
        where: { campaignId, status: "pending" },
        data: { status: "expired" },
      });

      return tx.campaign.update({
        where: { id: campaignId },
        data: { status: "completed" },
      });
    });
  }

  listMyAllocations(companyUserId: string) {
    return this.prisma.campaignAllocation.findMany({
      where: {
        companyUserId,
        status: { in: ["pending", "partial"] },
      },
      include: { campaign: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async getAllocations(campaignId: string, companyId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException("Campaign not found");
    if (campaign.companyId !== companyId)
      throw new ForbiddenException("Campaign does not belong to company");

    const allocations = await this.prisma.campaignAllocation.findMany({
      where: { campaignId },
      include: {
        companyUser: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return allocations.map((a) => ({
      employeeId: a.companyUserId,
      employeeName: a.companyUser.fullName ?? a.companyUser.email,
      employeeEmail: a.companyUser.email,
      allocatedAmount: Number(a.amount),
      usedAmount: Number(a.redeemedAmount),
      remainingAmount: Number(a.amount) - Number(a.redeemedAmount),
      hasOrdered: a.status === "redeemed" || a.status === "partial",
    }));
  }
}
