import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CompanyScopeGuard } from "../../common/guards/company-scope.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CampaignsService, CreateCampaignInput } from "./campaigns.service";
import { PrismaService } from "../../prisma/prisma.service";

@ApiTags("campaigns")
@ApiBearerAuth()
@UseGuards(JwtB2bGuard, RolesGuard, CompanyScopeGuard)
@Controller("campaigns")
export class CampaignsController {
  constructor(
    private service: CampaignsService,
    private prisma: PrismaService,
  ) {}

  @Get("admin/all")
  @Roles("super_admin")
  adminAll(
    @Query("status") status?: string,
    @Query("companyId") companyId?: string,
  ): Promise<unknown[]> {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (companyId) where.companyId = companyId;
    return this.prisma.campaign.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        allocations: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  @Get()
  @Roles("hr_admin", "super_admin")
  list(@Req() req: any) {
    return this.service.listForCompany(req.user.companyId);
  }

  @Post()
  @Roles("hr_admin")
  create(@Req() req: any, @Body() body: CreateCampaignInput) {
    return this.service.createDraft(req.user.companyId, body);
  }

  @Post(":id/activate")
  @Roles("hr_admin")
  activate(@Req() req: any, @Param("id") id: string) {
    return this.service.activate(id, req.user.companyId);
  }

  @Post(":id/allocate")
  @Roles("hr_admin")
  allocate(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { companyUserIds: string[] },
  ) {
    return this.service.allocate(id, req.user.companyId, body.companyUserIds);
  }

  @Post(":id/complete")
  @Roles("hr_admin", "super_admin")
  complete(@Req() req: any, @Param("id") id: string) {
    return this.service.complete(id, req.user.companyId);
  }

  @Get("me/allocations")
  @Roles("employee")
  myAllocations(@Req() req: any) {
    return this.service.listMyAllocations(req.user.companyUserId ?? req.user.sub);
  }

  /** HR/super-admin: get all allocations for a campaign with redemption stats */
  @Get(":id/allocations")
  @Roles("hr_admin", "super_admin")
  getCampaignAllocations(@Req() req: any, @Param("id") id: string) {
    return this.service.getAllocations(id, req.user.companyId);
  }

  @Post("allocations/:id/redeem")
  @Roles("employee")
  redeem(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { orderTotal: string },
  ) {
    return this.service.redeem(
      id,
      req.user.companyUserId ?? req.user.sub,
      body.orderTotal,
    );
  }
}
