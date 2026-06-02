import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IsString, IsNumber, IsOptional, Min } from "class-validator";
import { Type } from "class-transformer";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ProductionService } from "./production.service";

class RenderDto {
  @IsString()
  orderId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  itemIndex?: number;
}

@ApiTags("production")
@ApiBearerAuth()
@UseGuards(JwtB2bGuard, RolesGuard)
@Roles("super_admin")
@Controller("production")
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Post("render")
  @HttpCode(HttpStatus.OK)
  async render(@Body() dto: RenderDto): Promise<{ url: string }> {
    return this.productionService.renderOrderItem(
      dto.orderId,
      dto.itemIndex ?? 0,
    );
  }
}
