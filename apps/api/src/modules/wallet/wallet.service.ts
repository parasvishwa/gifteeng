import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@gifteeng/db";
import { PrismaService } from "../../prisma/prisma.service";

type DecimalInput = Prisma.Decimal | string | number;

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  getCompanyWallet(companyId: string) {
    return this.prisma.wallet.findFirst({
      where: { companyId, ownerType: "company" },
    });
  }

  async getEmployeeWallet(companyUserId: string) {
    const existing = await this.prisma.wallet.findFirst({
      where: { companyUserId, ownerType: "employee" },
    });
    if (existing) return existing;

    const companyUser = await this.prisma.companyUser.findUnique({
      where: { id: companyUserId },
    });
    if (!companyUser) throw new NotFoundException("Company user not found");

    return this.prisma.wallet.create({
      data: {
        ownerType: "employee",
        companyId: companyUser.companyId,
        companyUserId,
        balance: new Prisma.Decimal(0),
        lockedBalance: new Prisma.Decimal(0),
      },
    });
  }

  async topup(walletId: string, amount: number, reference?: string) {
    if (amount <= 0) throw new BadRequestException("Amount must be positive");
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.update({
        where: { id: walletId },
        data: { balance: { increment: amount } },
      });
      await tx.walletTransaction.create({
        data: { walletId, type: "topup", amount, reference },
      });
      return wallet;
    });
  }

  async lock(walletId: string, amount: number, reference: string): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const w = await tx.wallet.findUnique({ where: { id: walletId } });
      if (!w) throw new BadRequestException("Wallet not found");
      if (Number(w.balance) - Number(w.lockedBalance) < amount)
        throw new BadRequestException("Insufficient available balance");
      await tx.wallet.update({
        where: { id: walletId },
        data: { lockedBalance: { increment: amount } },
      });
      await tx.walletTransaction.create({
        data: { walletId, type: "lock", amount, reference },
      });
    });
  }

  async unlock(
    walletId: string,
    amount: DecimalInput,
    reference: string,
  ): Promise<void> {
    const amt = new Prisma.Decimal(amount as any);
    if (amt.lte(0)) throw new BadRequestException("Amount must be positive");
    return this.prisma.$transaction(async (tx) => {
      const w = await tx.wallet.findUnique({ where: { id: walletId } });
      if (!w) throw new BadRequestException("Wallet not found");
      if (new Prisma.Decimal(w.lockedBalance).lt(amt))
        throw new BadRequestException("Insufficient locked balance");
      await tx.wallet.update({
        where: { id: walletId },
        data: { lockedBalance: { decrement: amt } },
      });
      await tx.walletTransaction.create({
        data: { walletId, type: "unlock", amount: amt, reference },
      });
    });
  }

  async debit(
    walletId: string,
    amount: DecimalInput,
    reference: string,
    txClient?: Prisma.TransactionClient,
  ): Promise<{ walletTxnId: string }> {
    const amt = new Prisma.Decimal(amount as any);
    if (amt.lte(0)) throw new BadRequestException("Amount must be positive");

    const run = async (tx: Prisma.TransactionClient) => {
      const w = await tx.wallet.findUnique({ where: { id: walletId } });
      if (!w) throw new BadRequestException("Wallet not found");
      if (new Prisma.Decimal(w.lockedBalance).lt(amt))
        throw new BadRequestException("Insufficient locked balance to debit");
      if (new Prisma.Decimal(w.balance).lt(amt))
        throw new BadRequestException("Insufficient balance to debit");
      await tx.wallet.update({
        where: { id: walletId },
        data: {
          balance: { decrement: amt },
          lockedBalance: { decrement: amt },
        },
      });
      const txn = await tx.walletTransaction.create({
        data: { walletId, type: "debit", amount: amt, reference },
      });
      return { walletTxnId: txn.id };
    };

    if (txClient) return run(txClient);
    return this.prisma.$transaction(run);
  }

  async refund(
    walletId: string,
    amount: DecimalInput,
    reference: string,
    txClient?: Prisma.TransactionClient,
  ): Promise<void> {
    const amt = new Prisma.Decimal(amount as any);
    if (amt.lte(0)) throw new BadRequestException("Amount must be positive");

    const run = async (tx: Prisma.TransactionClient) => {
      await tx.wallet.update({
        where: { id: walletId },
        data: { balance: { increment: amt } },
      });
      await tx.walletTransaction.create({
        data: { walletId, type: "refund", amount: amt, reference },
      });
    };

    if (txClient) return run(txClient);
    return this.prisma.$transaction(run);
  }

  async transferCompanyToEmployee(
    companyWalletId: string,
    employeeWalletId: string,
    amount: DecimalInput,
    reference: string,
  ): Promise<void> {
    const amt = new Prisma.Decimal(amount as any);
    if (amt.lte(0)) throw new BadRequestException("Amount must be positive");
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.wallet.findUnique({ where: { id: companyWalletId } });
      if (!company) throw new BadRequestException("Company wallet not found");
      if (new Prisma.Decimal(company.balance).lt(amt))
        throw new BadRequestException("Insufficient company wallet balance");

      await tx.wallet.update({
        where: { id: companyWalletId },
        data: { balance: { decrement: amt } },
      });
      await tx.walletTransaction.create({
        data: { walletId: companyWalletId, type: "debit", amount: amt, reference },
      });

      await tx.wallet.update({
        where: { id: employeeWalletId },
        data: { balance: { increment: amt } },
      });
      await tx.walletTransaction.create({
        data: { walletId: employeeWalletId, type: "topup", amount: amt, reference },
      });
    });
  }
}
