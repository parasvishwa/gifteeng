import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { ReviewsService } from "./reviews.service";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

/**
 * Best-effort customerId extraction from a Bearer JWT — same trick as the
 * analytics controller. Lets a public endpoint return additional rows that
 * belong to the requesting customer (e.g. their own pending reviews) without
 * forcing the entire endpoint to require auth.
 */
function extractCustomerIdFromAuth(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined;
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return undefined;
  try {
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4) payload += "=";
    const json = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    if (json.aud !== "b2c") return undefined;
    return typeof json.sub === "string" ? json.sub : undefined;
  } catch {
    return undefined;
  }
}

const createSchema = z.object({
  productId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().optional(),
  body: z.string().optional(),
  // Review media: customer can attach up to 5 images + 1 short video clip.
  // Each entry is a URL returned from the /files/upload endpoint.
  photoUrls: z.array(z.string().url()).max(5).optional(),
  videoUrl: z.string().url().optional(),
  // Allow frontend to submit `text` as an alias for `body` (matches the public API).
  text: z.string().optional(),
});

@ApiTags("reviews")
@Controller("reviews")
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get("product/:productId")
  byProduct(
    @Param("productId") productId: string,
    @Headers("authorization") auth?: string,
  ) {
    // Auth-optional: if a logged-in customer is calling, also return their
    // own pending reviews so they get immediate feedback after submitting.
    const requesterId = extractCustomerIdFromAuth(auth);
    return this.reviews.listApprovedWithOwnPending(productId, requesterId);
  }

  /**
   * GET /api/reviews?limit=N
   *
   * Approved reviews across all products — used by the homepage
   * "What customers say" testimonials section. Sorted newest-first.
   */
  @Get()
  listPublic(@Query("limit") limit?: string) {
    const n = limit ? Math.max(1, Math.min(100, Number(limit))) : 12;
    return this.reviews.listApproved(undefined, n);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin")
  listAdmin(@Query("pageSize") pageSize?: string) {
    return this.reviews.listAll(pageSize ? Number(pageSize) : 200);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Patch("admin/:id")
  updateAdmin(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.reviews.updateAdmin(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post()
  @UsePipes(new ZodValidationPipe(createSchema))
  create(@Req() req: any, @Body() body: z.infer<typeof createSchema>) {
    return this.reviews.create(req.user.customerId, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post("admin/:id/approve")
  approve(@Param("id") id: string) {
    return this.reviews.approve(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Delete("admin/:id")
  remove(@Param("id") id: string) {
    return this.reviews.remove(id);
  }
}
