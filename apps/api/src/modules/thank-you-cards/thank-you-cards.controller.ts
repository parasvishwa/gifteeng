import {
  Body, Controller, Delete, Get, Param, Patch,
  Post, Query, UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ThankYouCardsService } from "./thank-you-cards.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

@ApiTags("thank-you-cards")
@Controller("thank-you-cards")
export class ThankYouCardsController {
  constructor(private readonly svc: ThankYouCardsService) {}

  /** Public: checkout/cart reads active cards */
  @Get()
  list(@Query("active") active?: string) {
    return this.svc.list({
      active: active !== undefined ? active !== "false" : undefined,
    });
  }

  @Get(":id")
  getOne(@Param("id") id: string) {
    return this.svc.getById(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post()
  create(@Body() body: any) {
    return this.svc.create(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: any) {
    return this.svc.update(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }
}
