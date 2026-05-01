import {
  Body, Controller, Delete, Get, NotFoundException,
  Param, Post, Req, UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { PrismaService } from "../../prisma/prisma.service";

// Accept both `name` (canonical, web) and `fullName` (legacy mobile builds).
// `country` is informational and accepted but not stored — schema has no
// country column. State is also tolerant of empty string from forms that
// haven't picked one yet (we coerce to "" on the data layer).
const createAddressSchema = z
  .object({
    name:      z.string().min(1).optional(),
    fullName:  z.string().min(1).optional(),
    phone:     z.string().min(6),
    line1:     z.string().min(1),
    line2:     z.string().optional(),
    city:      z.string().min(1),
    state:     z.string().optional(),
    pincode:   z.string().min(4),
    country:   z.string().optional(),
    isDefault: z.boolean().optional(),
  })
  .refine(d => (d.name ?? d.fullName)?.trim().length, {
    message: "name is required",
    path:    ["name"],
  });

@ApiTags("addresses")
@ApiBearerAuth()
@UseGuards(JwtB2cGuard)
@Controller("addresses")
export class AddressesController {
  constructor(private prisma: PrismaService) {}

  // Always return both `name` and `fullName` so older mobile builds and the
  // newer web/admin clients can both read the response without branching.
  private serialise(r: {
    id: string; fullName: string; phone: string; line1: string;
    line2: string | null; city: string; state: string; pincode: string;
    isDefault: boolean;
  }) {
    return {
      id:        r.id,
      name:      r.fullName,
      fullName:  r.fullName,
      phone:     r.phone,
      line1:     r.line1,
      line2:     r.line2 ?? undefined,
      city:      r.city,
      state:     r.state,
      pincode:   r.pincode,
      isDefault: r.isDefault,
    };
  }

  @Get()
  async list(@Req() req: any) {
    const rows = await this.prisma.savedAddress.findMany({
      where: { customerId: req.user.customerId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(r => this.serialise(r));
  }

  @Post()
  async create(
    @Req() req: any,
    @Body(new ZodValidationPipe(createAddressSchema))
    body: z.infer<typeof createAddressSchema>,
  ) {
    const fullName = (body.name ?? body.fullName ?? "").trim();
    const row = await this.prisma.savedAddress.create({
      data: {
        customerId: req.user.customerId,
        fullName,
        phone:      body.phone,
        line1:      body.line1,
        line2:      body.line2,
        city:       body.city,
        state:      body.state ?? "",
        pincode:    body.pincode,
        isDefault:  body.isDefault ?? false,
      },
    });
    return this.serialise(row);
  }

  @Delete(":id")
  async remove(@Req() req: any, @Param("id") id: string) {
    const row = await this.prisma.savedAddress.findUnique({ where: { id } });
    if (!row || row.customerId !== req.user.customerId) throw new NotFoundException();
    await this.prisma.savedAddress.delete({ where: { id } });
    return { deleted: true };
  }
}
