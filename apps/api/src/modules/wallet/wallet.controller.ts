import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CompanyScopeGuard } from "../../common/guards/company-scope.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { WalletService } from "./wallet.service";
import { WalletTopupInputSchema } from "@gifteeng/shared";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import { PrismaService } from "../../prisma/prisma.service";
import { NotFoundException } from "@nestjs/common";

@ApiTags("wallet")
@ApiBearerAuth()
@UseGuards(JwtB2bGuard, RolesGuard)
@Controller("wallet")
export class WalletController {
  constructor(private service: WalletService, private prisma: PrismaService) {}

  @Get("company")
  @Roles("super_admin", "hr_admin", "sales_admin")
  company(@Req() req: any) {
    return this.service.getCompanyWallet(req.user.companyId);
  }

  @Post("topup")
  @Roles("super_admin", "hr_admin")
  topup(
    @Body(new ZodValidationPipe(WalletTopupInputSchema))
    body: { walletId: string; amount: number; reference?: string },
  ) {
    return this.service.topup(body.walletId, body.amount, body.reference);
  }

  @Get("company/transactions")
  @UseGuards(CompanyScopeGuard)
  @Roles("super_admin", "hr_admin", "sales_admin")
  async companyTransactions(
    @Req() req: any,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ): Promise<{ items: unknown[]; total: number; page: number; pageSize: number }> {
    const p = Math.max(1, page ? Number(page) : 1);
    const ps = Math.min(100, pageSize ? Number(pageSize) : 20);
    const wallet = await this.prisma.wallet.findFirst({
      where: { companyId: req.user.companyId, ownerType: "company" },
    });
    if (!wallet) throw new NotFoundException("Company wallet not found");
    const [items, total] = await this.prisma.$transaction([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: "desc" },
        skip: (p - 1) * ps,
        take: ps,
      }),
      this.prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);
    return { items, total, page: p, pageSize: ps };
  }

  @Get("admin/all")
  @Roles("super_admin")
  async adminAll(): Promise<
    Array<{
      id: string;
      ownerType: string;
      companyId: string | null;
      companyName: string | null;
      balance: string;
      lockedBalance: string;
      currency: string;
    }>
  > {
    const wallets = await this.prisma.wallet.findMany({
      include: { company: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return wallets.map((w) => ({
      id: w.id,
      ownerType: w.ownerType,
      companyId: w.companyId,
      companyName: w.company?.name ?? null,
      balance: w.balance.toString(),
      lockedBalance: w.lockedBalance.toString(),
      currency: w.currency,
    }));
  }

  @Get("employee")
  @Roles("employee")
  employee(@Req() req: any) {
    return this.service.getEmployeeWallet(req.user.companyUserId);
  }

  @Get("employee/transactions")
  @Roles("employee")
  async employeeTransactions(
    @Req() req: any,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ): Promise<{ items: unknown[]; total: number; page: number; pageSize: number }> {
    const p = Math.max(1, page ? Number(page) : 1);
    const ps = Math.min(100, pageSize ? Number(pageSize) : 20);
    const wallet = await this.service.getEmployeeWallet(req.user.companyUserId);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: "desc" },
        skip: (p - 1) * ps,
        take: ps,
      }),
      this.prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);
    return { items, total, page: p, pageSize: ps };
  }
}
