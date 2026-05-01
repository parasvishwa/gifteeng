import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { AmazonReviewsService } from "./amazon-reviews.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const importSchema = z.object({
  productId: z.string().uuid(),
  sourceUrl: z.string().url(),
});

@ApiTags("amazon-reviews")
@ApiBearerAuth()
@UseGuards(JwtB2bGuard, RolesGuard)
@Roles("super_admin")
@Controller("amazon-reviews")
export class AmazonReviewsController {
  constructor(private readonly service: AmazonReviewsService) {}

  @Get()
  list(
    @Query("productId") productId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ): Promise<{ items: unknown[]; total: number; page: number; pageSize: number }> {
    return this.service.list({
      productId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post("import")
  @UsePipes(new ZodValidationPipe(importSchema))
  import(
    @Body() body: z.infer<typeof importSchema>,
  ): Promise<{ drafts: unknown[]; importResult: unknown }> {
    return this.service.importFromUrl(body.productId, body.sourceUrl);
  }

  @Delete(":id")
  remove(@Param("id") id: string): Promise<unknown> {
    return this.service.remove(id);
  }
}
