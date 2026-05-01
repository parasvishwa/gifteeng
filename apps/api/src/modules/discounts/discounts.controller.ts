import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { DiscountsService } from "./discounts.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const moneyLike = z.union([z.number(), z.string()]);

const createSchema = z.object({
  code: z.string().min(1),
  description: z.string().optional(),
  percent: moneyLike.optional(),
  amount: moneyLike.optional(),
  minOrderTotal: moneyLike.optional(),
  usageLimit: z.number().int().nonnegative().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

const validateSchema = z.object({
  code: z.string().min(1),
  orderTotal: z.number().nonnegative(),
});

@ApiTags("discounts")
@Controller("discounts")
export class DiscountsController {
  constructor(private readonly discounts: DiscountsService) {}

  @Post("validate")
  @UsePipes(new ZodValidationPipe(validateSchema))
  validate(@Body() body: z.infer<typeof validateSchema>) {
    return this.discounts.validate(body.code, body.orderTotal);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Get()
  list() {
    return this.discounts.list();
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Get(":id")
  get(@Param("id") id: string) {
    return this.discounts.getById(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post()
  @UsePipes(new ZodValidationPipe(createSchema))
  create(@Body() body: z.infer<typeof createSchema>) {
    return this.discounts.create(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>,
  ) {
    return this.discounts.update(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.discounts.remove(id);
  }
}
