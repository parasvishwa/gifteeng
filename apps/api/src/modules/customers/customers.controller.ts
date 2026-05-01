import { Body, Controller, Delete, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CustomersService } from "./customers.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

@ApiTags("customers")
@ApiBearerAuth()
@UseGuards(JwtB2bGuard, RolesGuard)
@Roles("super_admin")
@Controller("customers")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.customers.list({
      search,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.customers.getById(id);
  }

  // Admin delete. Body `{ mode: "hard" | "anonymize" }`. Defaults to "hard"
  // which attempts a real delete (freeing phone/email for re-registration)
  // and falls back to anonymize if FK constraints block it.
  @Delete(":id")
  delete(
    @Param("id") id: string,
    @Body() body: { mode?: "hard" | "anonymize" } = {},
  ) {
    return this.customers.deleteAdmin(id, body.mode ?? "hard");
  }
}
