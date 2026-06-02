import {
  Body, Controller, Delete, Get, NotFoundException,
  Param, Patch, Post, Req, UseGuards,
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

// Partial update payload — every field optional. Used by PATCH /addresses/:id.
// Declared BEFORE the controller class so it's hoisted/accessible by the
// @Body() decorator on the update() handler (TS would otherwise error TS2448).
const updateAddressSchema = z.object({
  name:      z.string().min(1).optional(),
  fullName:  z.string().min(1).optional(),
  phone:     z.string().min(6).optional(),
  line1:     z.string().min(1).optional(),
  line2:     z.string().optional(),
  city:      z.string().min(1).optional(),
  state:     z.string().optional(),
  pincode:   z.string().min(4).optional(),
  country:   z.string().optional(),
  isDefault: z.boolean().optional(),
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

  // ── Update an address (incl. setting it as default) ─────────────────────
  //
  // Mobile clients send PATCH /addresses/:id with `{isDefault: true}` to
  // promote an address. They also try POST /addresses/:id/default as a
  // fallback (covered below).
  //
  // When `isDefault: true` is set, we run a transaction that flips every
  // OTHER address for this customer to `isDefault: false` first — so the
  // "exactly one default per customer" invariant holds.
  @Patch(":id")
  async update(
    @Req()             req: any,
    @Param("id")       id: string,
    @Body(new ZodValidationPipe(updateAddressSchema))
                       body: z.infer<typeof updateAddressSchema>,
  ) {
    const row = await this.prisma.savedAddress.findUnique({ where: { id } });
    if (!row || row.customerId !== req.user.customerId) throw new NotFoundException();

    const fullName =
      body.name?.trim() || body.fullName?.trim() || row.fullName;

    // Build the partial update payload, dropping `undefined` keys so we
    // don't accidentally null out an unrelated field.
    const data: Record<string, unknown> = { fullName };
    if (body.phone     !== undefined) data.phone     = body.phone;
    if (body.line1     !== undefined) data.line1     = body.line1;
    if (body.line2     !== undefined) data.line2     = body.line2;
    if (body.city      !== undefined) data.city      = body.city;
    if (body.state     !== undefined) data.state     = body.state;
    if (body.pincode   !== undefined) data.pincode   = body.pincode;
    if (body.isDefault !== undefined) data.isDefault = body.isDefault;

    // Promotion case → atomic: clear other defaults, then set this one.
    const updated = body.isDefault === true
      ? await this.prisma.$transaction(async (tx) => {
          await tx.savedAddress.updateMany({
            where: { customerId: req.user.customerId, isDefault: true },
            data:  { isDefault: false },
          });
          return tx.savedAddress.update({ where: { id }, data });
        })
      : await this.prisma.savedAddress.update({ where: { id }, data });

    return this.serialise(updated);
  }

  // Dedicated "promote to default" endpoint — kept for legacy clients that
  // send POST /addresses/:id/default (older mobile builds). New code should
  // use PATCH with `{isDefault: true}` above.
  @Post(":id/default")
  async makeDefault(@Req() req: any, @Param("id") id: string) {
    const row = await this.prisma.savedAddress.findUnique({ where: { id } });
    if (!row || row.customerId !== req.user.customerId) throw new NotFoundException();

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.savedAddress.updateMany({
        where: { customerId: req.user.customerId, isDefault: true },
        data:  { isDefault: false },
      });
      return tx.savedAddress.update({
        where: { id },
        data:  { isDefault: true },
      });
    });

    return this.serialise(updated);
  }
}
