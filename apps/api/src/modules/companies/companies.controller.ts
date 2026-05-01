import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { CompaniesService } from "./companies.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CompanyScopeGuard } from "../../common/guards/company-scope.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const createSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  logoUrl: z.string().url().optional(),
  brandColor: z.string().optional(),
  billingEmail: z.string().email().optional(),
  billingAddress: z.any().optional(),
  status: z.enum(["active", "suspended", "pending"]).optional(),
});

const updateSchema = createSchema.partial();

@ApiTags("companies")
@ApiBearerAuth()
@Controller("companies")
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Get()
  list() {
    return this.companies.listAll();
  }

  @UseGuards(JwtB2bGuard)
  @Get("me")
  me(@Req() req: any) {
    return this.companies.getMe(req.user.companyId);
  }

  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "hr_admin")
  @Get("me/employees")
  myEmployees(@Req() req: any) {
    return this.companies.listEmployees(req.user.companyId);
  }

  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("hr_admin")
  @Patch("me")
  @UsePipes(new ZodValidationPipe(updateSchema))
  patchMe(@Req() req: any, @Body() body: z.infer<typeof updateSchema>) {
    return this.companies.update(req.user.companyId, body);
  }

  @UseGuards(JwtB2bGuard)
  @Get(":id")
  get(@Param("id") id: string, @Req() req: any) {
    return this.companies.getById(id, {
      role: req.user.role,
      companyId: req.user.companyId,
    });
  }

  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post()
  @UsePipes(new ZodValidationPipe(createSchema))
  create(@Body() body: z.infer<typeof createSchema>) {
    return this.companies.create(body);
  }

  @UseGuards(JwtB2bGuard, RolesGuard, CompanyScopeGuard)
  @Roles("super_admin", "hr_admin")
  @Patch(":id")
  @UsePipes(new ZodValidationPipe(updateSchema))
  patch(@Param("id") id: string, @Body() body: z.infer<typeof updateSchema>) {
    return this.companies.update(id, body);
  }
}
