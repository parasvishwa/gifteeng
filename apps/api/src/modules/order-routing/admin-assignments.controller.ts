import { Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { OrderRoutingService } from "./order-routing.service";

@ApiTags("order-assignments")
@ApiBearerAuth()
@UseGuards(JwtB2bGuard, RolesGuard)
@Roles("super_admin", "sales_admin")
@Controller("admin/order-assignments")
export class AdminAssignmentsController {
  constructor(private routing: OrderRoutingService) {}

  @Get()
  list(@Query("status") status?: string) {
    return this.routing.adminListAssignments(status);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.routing.adminGetAssignment(id);
  }

  @Patch(":id/force-reassign")
  forceReassign(@Param("id") id: string) {
    return this.routing.adminForceReassign(id);
  }
}
