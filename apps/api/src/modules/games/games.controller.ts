import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, Header, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { z } from "zod";
import { GamesService } from "./games.service";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const playScratchSchema = z.object({
  triggerRef: z.string().optional(),
});

const adminUpdateConfigSchema = z.object({
  type: z.enum([
    "scratch_card", "jackpot", "mystery_box", "spin_wheel", "streak",
    "daily_quest", "streak_ladder", "treasure_hunt", "goin_wager", "product_drop",
  ]),
  title: z.string().optional(),
  description: z.string().optional(),
  rewardPool: z.array(z.any()).optional(),
  dailyLimit: z.number().int().min(0).max(100).optional(),
  costGoins: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const claimDailyQuestSchema = z.object({
  step: z.enum(["1", "2", "3", "bonus"]),
});

const claimStreakLadderSchema = z.object({
  day: z.number().int().positive(),
});

const treasureHuntSchema = z.object({
  pickIndex: z.number().int().min(0).max(11),
});

const goinWagerSchema = z.object({
  stake: z.number().int().positive(),
});

// ── Deploy 120 — Product Drop schemas ────────────────────────────────────
const playProductDropSchema = z.object({
  dropId: z.string().uuid(),
});

const adminCreateProductDropSchema = z.object({
  productId: z.string().uuid(),
  shippingInr: z.number().int().min(0).max(10_000),
  gameMode: z.enum(["drop", "guess_price", "daily_deal", "product_wheel"]).optional(),
  modeConfig: z.record(z.any()).nullable().optional(),
  winOddsPct: z.number().min(0.01).max(100).optional(),
  dailyLimit: z.number().int().min(1).max(10).optional(),
  maxWinners: z.number().int().min(1).nullable().optional(),
  claimWindowHours: z.number().int().min(1).max(24 * 30).optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  title: z.string().max(80).optional(),
  subtitle: z.string().max(160).optional(),
  bannerImage: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

const guessPriceSchema = z.object({
  dropId: z.string().uuid(),
  guessInr: z.number().positive(),
});

const simpleDropIdSchema = z.object({
  dropId: z.string().uuid(),
});

const adminUpdateProductDropSchema = adminCreateProductDropSchema
  .omit({ productId: true })
  .partial();

const claimProductDropSchema = z.object({
  shippingAddress: z.object({
    name: z.string().min(1),
    phone: z.string().min(7),
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().min(1),
    pincode: z.string().min(4),
    country: z.string().default("IN"),
  }).passthrough(),
});

@ApiTags("games")
@Controller("games")
export class GamesController {
  constructor(private service: GamesService) {}

  /** GET /api/games/hub — game hub data (cards, streak, balance, recent plays) */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("hub")
  hub(@Req() req: any) {
    return this.service.getHub(req.user.customerId as string);
  }

  /** GET /api/games/tree — Gifter's Tree state (level from order count) */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("tree")
  tree(@Req() req: any) {
    return this.service.getTree(req.user.customerId as string);
  }

  /**
   * GET /api/games/winners — public feed of recent winners (social proof).
   *
   * Query params:
   *   pageSize (optional) — default 10, max 50
   *
   * Returns: [{ id, name, prize, gameType, rewardType, at, ago }]
   *   - `name` is privacy-truncated to "First L." format
   *   - `ago` is a pre-computed age in minutes (saves client math)
   *
   * No auth — consumed by mobile Play screen + web games hub social banner.
   */
  @Get("winners")
  // Public social-proof feed — cache for 30s. Winners update frequently so
  // a tight TTL balances freshness vs load. `stale-while-revalidate` keeps
  // users on a snappy response while we refresh in the background.
  @Header("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=30")
  winners(@Query("pageSize") pageSize?: string) {
    const limit = Number.parseInt(pageSize ?? "10", 10);
    return this.service.getRecentWinners(
      Number.isFinite(limit) && limit > 0 ? limit : 10,
    );
  }

  /** POST /api/games/scratch — play a scratch card (free, daily + post-order) */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("scratch")
  scratch(
    @Req() req: any,
    @Body(new ZodValidationPipe(playScratchSchema))
    body: z.infer<typeof playScratchSchema>,
  ) {
    return this.service.playScratchCard(
      req.user.customerId as string,
      body.triggerRef,
    );
  }

  /** POST /api/games/jackpot — play jackpot (costs Goins) */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("jackpot")
  jackpot(@Req() req: any) {
    return this.service.playJackpot(req.user.customerId as string);
  }

  /** POST /api/games/mystery-box — free daily pick */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("mystery-box")
  mysteryBox(@Req() req: any) {
    return this.service.playMysteryBox(req.user.customerId as string);
  }

  /** POST /api/games/streak — daily login check-in */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("streak")
  streak(@Req() req: any) {
    return this.service.streakCheckIn(req.user.customerId as string);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Deploy 118 — Daily Quest
  // ───────────────────────────────────────────────────────────────────────

  /** GET /api/games/daily-quest — current quest progress + bonus eligibility */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("daily-quest")
  dailyQuestState(@Req() req: any) {
    return this.service.getDailyQuestState(req.user.customerId as string);
  }

  /** POST /api/games/daily-quest/claim — claim a step or the all-3 bonus */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("daily-quest/claim")
  dailyQuestClaim(
    @Req() req: any,
    @Body(new ZodValidationPipe(claimDailyQuestSchema))
    body: z.infer<typeof claimDailyQuestSchema>,
  ) {
    return this.service.claimDailyQuestStep(req.user.customerId as string, body.step);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Deploy 118 — Streak Ladder
  // ───────────────────────────────────────────────────────────────────────

  /** GET /api/games/streak-ladder — 8-rung ladder state (streak + per-rung claim) */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("streak-ladder")
  streakLadderState(@Req() req: any) {
    return this.service.getStreakLadderState(req.user.customerId as string);
  }

  /** POST /api/games/streak-ladder/claim — claim an unlocked rung */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("streak-ladder/claim")
  streakLadderClaim(
    @Req() req: any,
    @Body(new ZodValidationPipe(claimStreakLadderSchema))
    body: z.infer<typeof claimStreakLadderSchema>,
  ) {
    return this.service.claimStreakLadderRung(req.user.customerId as string, body.day);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Deploy 119 — Treasure Hunt & Goin Wager
  // ───────────────────────────────────────────────────────────────────────

  /** POST /api/games/treasure-hunt — pick 1 of N boxes, resolve reward */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("treasure-hunt")
  treasureHunt(
    @Req() req: any,
    @Body(new ZodValidationPipe(treasureHuntSchema))
    body: z.infer<typeof treasureHuntSchema>,
  ) {
    return this.service.playTreasureHunt(req.user.customerId as string, body.pickIndex);
  }

  /** POST /api/games/goin-wager — stake N Goins, double-or-nothing */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("goin-wager")
  goinWager(
    @Req() req: any,
    @Body(new ZodValidationPipe(goinWagerSchema))
    body: z.infer<typeof goinWagerSchema>,
  ) {
    return this.service.playGoinWager(req.user.customerId as string, body.stake);
  }

  /** POST /api/games/admin/seed — seed default reward pools (idempotent) */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("admin/seed")
  seed() {
    return this.service.seedDefaults();
  }

  /** GET /api/games/admin/configs — list all game configs */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/configs")
  adminList() {
    return this.service.adminListConfigs();
  }

  /** POST /api/games/admin/config — upsert game config */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("admin/config")
  adminUpdate(
    @Body(new ZodValidationPipe(adminUpdateConfigSchema))
    body: z.infer<typeof adminUpdateConfigSchema>,
  ) {
    return this.service.adminUpdateConfig(body.type as any, body);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Deploy 120 — Product Drop
  // ───────────────────────────────────────────────────────────────────────

  /** GET /api/games/product-drops — public list of currently-active drops */
  @Get("product-drops")
  listProductDrops() {
    return this.service.listActiveProductDrops();
  }

  /** GET /api/games/product-drops/:id/state — per-customer state for a drop */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("product-drops/:id/state")
  productDropState(@Req() req: any, @Param("id") id: string) {
    return this.service.getProductDropState(req.user.customerId as string, id);
  }

  /** POST /api/games/product-drop — roll for a product drop */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("product-drop")
  playProductDrop(
    @Req() req: any,
    @Body(new ZodValidationPipe(playProductDropSchema))
    body: z.infer<typeof playProductDropSchema>,
  ) {
    return this.service.playProductDrop(req.user.customerId as string, body.dropId);
  }

  /** POST /api/games/guess-price — Deploy 121 */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("guess-price")
  playGuessPrice(
    @Req() req: any,
    @Body(new ZodValidationPipe(guessPriceSchema))
    body: z.infer<typeof guessPriceSchema>,
  ) {
    return this.service.playGuessPrice(
      req.user.customerId as string, body.dropId, body.guessInr,
    );
  }

  /** POST /api/games/daily-deal — Deploy 121. Guaranteed voucher per day. */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("daily-deal")
  playDailyDeal(
    @Req() req: any,
    @Body(new ZodValidationPipe(simpleDropIdSchema))
    body: z.infer<typeof simpleDropIdSchema>,
  ) {
    return this.service.playDailyDeal(req.user.customerId as string, body.dropId);
  }

  /** POST /api/games/product-wheel — Deploy 121 */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("product-wheel")
  spinProductWheel(
    @Req() req: any,
    @Body(new ZodValidationPipe(simpleDropIdSchema))
    body: z.infer<typeof simpleDropIdSchema>,
  ) {
    return this.service.spinProductWheel(req.user.customerId as string, body.dropId);
  }

  // ── Admin CRUD for product drops ────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/product-drops")
  adminListDrops() {
    return this.service.adminListProductDrops();
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post("admin/product-drops")
  adminCreateDrop(
    @Body(new ZodValidationPipe(adminCreateProductDropSchema))
    body: z.infer<typeof adminCreateProductDropSchema>,
  ) {
    return this.service.adminCreateProductDrop({
      ...body,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt:   body.endsAt   ? new Date(body.endsAt)   : null,
    });
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Patch("admin/product-drops/:id")
  adminUpdateDrop(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(adminUpdateProductDropSchema))
    body: z.infer<typeof adminUpdateProductDropSchema>,
  ) {
    return this.service.adminUpdateProductDrop(id, {
      ...body,
      startsAt: body.startsAt ? new Date(body.startsAt) : body.startsAt as any,
      endsAt:   body.endsAt   ? new Date(body.endsAt)   : body.endsAt as any,
    });
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Delete("admin/product-drops/:id")
  adminDeleteDrop(@Param("id") id: string) {
    return this.service.adminDeleteProductDrop(id);
  }

  /**
   * POST /api/games/product-drops/claim/:code — place a single-item COD
   * order at the shipping-only price. Customer provides their shipping
   * address in the body.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("product-drops/claim/:code")
  claimProductDrop(
    @Req() req: any,
    @Param("code") code: string,
    @Body(new ZodValidationPipe(claimProductDropSchema))
    body: z.infer<typeof claimProductDropSchema>,
  ) {
    return this.service.claimProductDrop(req.user.customerId as string, code, body);
  }
}
