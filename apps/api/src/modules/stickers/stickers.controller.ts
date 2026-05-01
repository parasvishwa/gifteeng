import {
  Controller,
  Get,
  Post,
  Body,
  Header,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { z } from "zod";

import { StickersService } from "./stickers.service";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const claimVolumeSchema = z.object({
  volume: z.string().min(1).max(80),
});

@ApiTags("stickers")
@Controller("stickers")
export class StickersController {
  constructor(private service: StickersService) {}

  // ─── New pack-based API (mobile) ─────────────────────────────────────────

  /** GET /api/stickers/catalog — public catalog (pack-based) */
  @Get("catalog")
  // Catalog is nearly static — admin seeds + rare edits only. Cache hard.
  @Header("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=120")
  catalog() {
    return this.service.getPackCatalog();
  }

  /** GET /api/stickers/user — calling user's album state (pack-based) */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("user")
  user(@Req() req: any) {
    return this.service.getUserAlbum(req.user.customerId as string);
  }

  /** POST /api/stickers/open-pack — opens one pack, reveals 3 stickers */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("open-pack")
  openPack(@Req() req: any) {
    return this.service.openPack(req.user.customerId as string);
  }

  /** POST /api/stickers/claim-volume { volume } — claim volume prize */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("claim-volume")
  claimVolume(
    @Req() req: any,
    @Body(new ZodValidationPipe(claimVolumeSchema))
    body: z.infer<typeof claimVolumeSchema>,
  ) {
    return this.service.claimVolume(
      req.user.customerId as string,
      body.volume,
    );
  }

  // ─── Legacy row-based API (kept for backward compat) ─────────────────────

  /** GET /api/stickers/album — user's full album (row-based, legacy) */
  @Get("album")
  album(@Req() req: any) {
    return this.service.getAlbum(req.user?.customerId ?? null);
  }

  /** POST /api/stickers/claim-row/:theme — claim row prize (legacy) */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("claim-row/:theme")
  claimRow(@Req() req: any, @Param("theme") theme: string) {
    return this.service.claimRow(req.user.customerId as string, theme);
  }

  /** POST /api/stickers/claim-album — claim full-album prize (legacy) */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("claim-album")
  claimAlbum(@Req() req: any) {
    return this.service.claimAlbum(req.user.customerId as string);
  }

  // ─── Admin seeds ─────────────────────────────────────────────────────────

  /** POST /api/stickers/admin/seed — seed legacy 50-sticker theme catalog */
  @Post("admin/seed")
  seed() {
    return this.service.seedCatalog();
  }

  /** POST /api/stickers/admin/seed-packs — seed new 24-sticker volume catalog */
  @Post("admin/seed-packs")
  seedPacks() {
    return this.service.seedPackCatalog();
  }
}
