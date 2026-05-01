import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

// ═══════════════════════════════════════════════════════════════════════════
// NEW (pack-based) catalog — 24 stickers, 4 volumes, 5 rarity tiers
// ═══════════════════════════════════════════════════════════════════════════
// This is the source-of-truth catalog for the mobile pack-based album UI.
// Each volume has 6 stickers. Rarities use 5 tiers: common / rare / epic /
// legendary / mythic. We store volume names in the existing `theme` column
// for simplicity — backend field is "theme", mobile field is "volume".
//
// Rarity drop weights when opening a pack (weighted-RNG):
//   common    55%
//   rare      25%
//   epic      14%
//   legendary  5%
//   mythic     1%
//
// Duplicate conversion rates (Goins per duplicate):
//   common 5 | rare 12 | epic 30 | legendary 75 | mythic 150

const PACK_CATALOG: {
  code: string; name: string; emoji: string; theme: string; rarity: string; sortOrder: number;
}[] = [
  // ── Volume 1: Festive Spirit ────────────────────────────────────────────
  { code: "V1_01", name: "Diya",          emoji: "🪔", theme: "Festive Spirit",  rarity: "common",    sortOrder: 1 },
  { code: "V1_02", name: "Fireworks",     emoji: "🎆", theme: "Festive Spirit",  rarity: "common",    sortOrder: 2 },
  { code: "V1_03", name: "Gift Box",      emoji: "🎁", theme: "Festive Spirit",  rarity: "common",    sortOrder: 3 },
  { code: "V1_04", name: "Marigold",      emoji: "🌺", theme: "Festive Spirit",  rarity: "rare",      sortOrder: 4 },
  { code: "V1_05", name: "Sparkler",      emoji: "🎇", theme: "Festive Spirit",  rarity: "rare",      sortOrder: 5 },
  { code: "V1_06", name: "Lantern",       emoji: "🏮", theme: "Festive Spirit",  rarity: "epic",      sortOrder: 6 },

  // ── Volume 2: Love & Romance ───────────────────────────────────────────
  { code: "V2_01", name: "Rose",          emoji: "🌹", theme: "Love & Romance",  rarity: "common",    sortOrder: 1 },
  { code: "V2_02", name: "Heart Arrow",   emoji: "💘", theme: "Love & Romance",  rarity: "common",    sortOrder: 2 },
  { code: "V2_03", name: "Bouquet",       emoji: "💐", theme: "Love & Romance",  rarity: "common",    sortOrder: 3 },
  { code: "V2_04", name: "Ring",          emoji: "💍", theme: "Love & Romance",  rarity: "rare",      sortOrder: 4 },
  { code: "V2_05", name: "Kiss",          emoji: "💋", theme: "Love & Romance",  rarity: "rare",      sortOrder: 5 },
  { code: "V2_06", name: "Heart Gift",    emoji: "💝", theme: "Love & Romance",  rarity: "epic",      sortOrder: 6 },

  // ── Volume 3: Celebration ──────────────────────────────────────────────
  { code: "V3_01", name: "Cake",          emoji: "🎂", theme: "Celebration",     rarity: "common",    sortOrder: 1 },
  { code: "V3_02", name: "Party Popper",  emoji: "🎉", theme: "Celebration",     rarity: "common",    sortOrder: 2 },
  { code: "V3_03", name: "Balloon",       emoji: "🎈", theme: "Celebration",     rarity: "common",    sortOrder: 3 },
  { code: "V3_04", name: "Champagne",     emoji: "🍾", theme: "Celebration",     rarity: "rare",      sortOrder: 4 },
  { code: "V3_05", name: "Confetti Ball", emoji: "🎊", theme: "Celebration",     rarity: "rare",      sortOrder: 5 },
  { code: "V3_06", name: "Trophy",        emoji: "🏆", theme: "Celebration",     rarity: "epic",      sortOrder: 6 },

  // ── Volume 4: Mystic Legends ───────────────────────────────────────────
  { code: "V4_01", name: "Star",          emoji: "⭐", theme: "Mystic Legends",  rarity: "rare",      sortOrder: 1 },
  { code: "V4_02", name: "Sparkles",      emoji: "✨", theme: "Mystic Legends",  rarity: "rare",      sortOrder: 2 },
  { code: "V4_03", name: "Crystal Ball",  emoji: "🔮", theme: "Mystic Legends",  rarity: "epic",      sortOrder: 3 },
  { code: "V4_04", name: "Unicorn",       emoji: "🦄", theme: "Mystic Legends",  rarity: "epic",      sortOrder: 4 },
  { code: "V4_05", name: "Dragon",        emoji: "🐉", theme: "Mystic Legends",  rarity: "legendary", sortOrder: 5 },
  { code: "V4_06", name: "Crown",         emoji: "👑", theme: "Mystic Legends",  rarity: "mythic",    sortOrder: 6 },
];

const VOLUMES = [
  "Festive Spirit",
  "Love & Romance",
  "Celebration",
  "Mystic Legends",
] as const;

type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";

// Weighted rarity roll on pack-open. Sum doesn't need to equal 1.
const RARITY_WEIGHTS: Record<Rarity, number> = {
  common:     55,
  rare:       25,
  epic:       14,
  legendary:   5,
  mythic:      1,
};

// Duplicate Goin conversion rate by rarity.
const DUPLICATE_COINS: Record<Rarity, number> = {
  common:      5,
  rare:       12,
  epic:       30,
  legendary:  75,
  mythic:    150,
};

const PACK_SIZE       = 3;   // stickers revealed per pack-open
const STARTER_PACKS   = 3;   // packs granted to a new user on first read
const VOLUME_PRIZE    = 500; // Goins awarded when a user claims a full volume

// ── 50 sticker catalog (5 themes × 10 stickers) ─────────────────────────────
// Legacy catalog — kept for `seedCatalog()` backward-compat. The new seed
// `seedPackCatalog()` uses PACK_CATALOG above.
// Rarity per theme: 6 common, 3 rare, 1 legendary → 30/15/5 total.
const CATALOG: {
  code: string; name: string; emoji: string; theme: string; rarity: string; sortOrder: number;
}[] = [
  // Animals
  { code: "ANI_01", name: "Puppy",     emoji: "🐶", theme: "animals", rarity: "common",    sortOrder: 1 },
  { code: "ANI_02", name: "Kitty",     emoji: "🐱", theme: "animals", rarity: "common",    sortOrder: 2 },
  { code: "ANI_03", name: "Bunny",     emoji: "🐰", theme: "animals", rarity: "common",    sortOrder: 3 },
  { code: "ANI_04", name: "Fox",       emoji: "🦊", theme: "animals", rarity: "common",    sortOrder: 4 },
  { code: "ANI_05", name: "Bear",      emoji: "🐻", theme: "animals", rarity: "common",    sortOrder: 5 },
  { code: "ANI_06", name: "Panda",     emoji: "🐼", theme: "animals", rarity: "common",    sortOrder: 6 },
  { code: "ANI_07", name: "Lion",      emoji: "🦁", theme: "animals", rarity: "rare",      sortOrder: 7 },
  { code: "ANI_08", name: "Tiger",     emoji: "🐯", theme: "animals", rarity: "rare",      sortOrder: 8 },
  { code: "ANI_09", name: "Koala",     emoji: "🐨", theme: "animals", rarity: "rare",      sortOrder: 9 },
  { code: "ANI_10", name: "Unicorn",   emoji: "🦄", theme: "animals", rarity: "legendary", sortOrder: 10 },

  // Festivals
  { code: "FST_01", name: "Fireworks", emoji: "🎆", theme: "festivals", rarity: "common",    sortOrder: 1 },
  { code: "FST_02", name: "Diya",      emoji: "🪔", theme: "festivals", rarity: "common",    sortOrder: 2 },
  { code: "FST_03", name: "Holi",      emoji: "🎨", theme: "festivals", rarity: "common",    sortOrder: 3 },
  { code: "FST_04", name: "Christmas", emoji: "🎄", theme: "festivals", rarity: "common",    sortOrder: 4 },
  { code: "FST_05", name: "Bouquet",   emoji: "💐", theme: "festivals", rarity: "common",    sortOrder: 5 },
  { code: "FST_06", name: "Confetti",  emoji: "🎊", theme: "festivals", rarity: "common",    sortOrder: 6 },
  { code: "FST_07", name: "Pumpkin",   emoji: "🎃", theme: "festivals", rarity: "rare",      sortOrder: 7 },
  { code: "FST_08", name: "Red Packet", emoji: "🧧", theme: "festivals", rarity: "rare",      sortOrder: 8 },
  { code: "FST_09", name: "Blossom",   emoji: "🌸", theme: "festivals", rarity: "rare",      sortOrder: 9 },
  { code: "FST_10", name: "Golden Garland", emoji: "🎇", theme: "festivals", rarity: "legendary", sortOrder: 10 },

  // Food
  { code: "FOD_01", name: "Pizza",     emoji: "🍕", theme: "food", rarity: "common",    sortOrder: 1 },
  { code: "FOD_02", name: "Cake",      emoji: "🍰", theme: "food", rarity: "common",    sortOrder: 2 },
  { code: "FOD_03", name: "Chocolate", emoji: "🍫", theme: "food", rarity: "common",    sortOrder: 3 },
  { code: "FOD_04", name: "Cupcake",   emoji: "🧁", theme: "food", rarity: "common",    sortOrder: 4 },
  { code: "FOD_05", name: "Donut",     emoji: "🍩", theme: "food", rarity: "common",    sortOrder: 5 },
  { code: "FOD_06", name: "Cookie",    emoji: "🍪", theme: "food", rarity: "common",    sortOrder: 6 },
  { code: "FOD_07", name: "Croissant", emoji: "🥐", theme: "food", rarity: "rare",      sortOrder: 7 },
  { code: "FOD_08", name: "Honey",     emoji: "🍯", theme: "food", rarity: "rare",      sortOrder: 8 },
  { code: "FOD_09", name: "Tea",       emoji: "🍵", theme: "food", rarity: "rare",      sortOrder: 9 },
  { code: "FOD_10", name: "Birthday Cake", emoji: "🎂", theme: "food", rarity: "legendary", sortOrder: 10 },

  // Things
  { code: "THN_01", name: "Gift",      emoji: "🎁", theme: "things", rarity: "common",    sortOrder: 1 },
  { code: "THN_02", name: "Teddy",     emoji: "🧸", theme: "things", rarity: "common",    sortOrder: 2 },
  { code: "THN_03", name: "Football",  emoji: "⚽", theme: "things", rarity: "common",    sortOrder: 3 },
  { code: "THN_04", name: "Game",      emoji: "🎮", theme: "things", rarity: "common",    sortOrder: 4 },
  { code: "THN_05", name: "Guitar",    emoji: "🎸", theme: "things", rarity: "common",    sortOrder: 5 },
  { code: "THN_06", name: "Book",      emoji: "📚", theme: "things", rarity: "common",    sortOrder: 6 },
  { code: "THN_07", name: "Rocket",    emoji: "🚀", theme: "things", rarity: "rare",      sortOrder: 7 },
  { code: "THN_08", name: "Magic Hat", emoji: "🎩", theme: "things", rarity: "rare",      sortOrder: 8 },
  { code: "THN_09", name: "Dartboard", emoji: "🎯", theme: "things", rarity: "rare",      sortOrder: 9 },
  { code: "THN_10", name: "Diamond",   emoji: "💎", theme: "things", rarity: "legendary", sortOrder: 10 },

  // Nature
  { code: "NAT_01", name: "Flower",    emoji: "🌸", theme: "nature", rarity: "common",    sortOrder: 1 },
  { code: "NAT_02", name: "Clover",    emoji: "🍀", theme: "nature", rarity: "common",    sortOrder: 2 },
  { code: "NAT_03", name: "Sunflower", emoji: "🌻", theme: "nature", rarity: "common",    sortOrder: 3 },
  { code: "NAT_04", name: "Rainbow",   emoji: "🌈", theme: "nature", rarity: "common",    sortOrder: 4 },
  { code: "NAT_05", name: "Star",      emoji: "⭐", theme: "nature", rarity: "common",    sortOrder: 5 },
  { code: "NAT_06", name: "Moon",      emoji: "🌙", theme: "nature", rarity: "common",    sortOrder: 6 },
  { code: "NAT_07", name: "Butterfly", emoji: "🦋", theme: "nature", rarity: "rare",      sortOrder: 7 },
  { code: "NAT_08", name: "Wave",      emoji: "🌊", theme: "nature", rarity: "rare",      sortOrder: 8 },
  { code: "NAT_09", name: "Mountain",  emoji: "🏔️", theme: "nature", rarity: "rare",      sortOrder: 9 },
  { code: "NAT_10", name: "Phoenix",   emoji: "🦚", theme: "nature", rarity: "legendary", sortOrder: 10 },
];

const THEMES = ["animals", "festivals", "food", "things", "nature"] as const;

// Row prize (per theme): 50 Goins + 10% discount coupon (min cart ₹500)
// Album prize: 2000 Goins + ₹500 flat-off + premium status
const ROW_PRIZE_GOINS = 50;
const ALBUM_PRIZE_GOINS = 2000;

@Injectable()
export class StickersService {
  constructor(private prisma: PrismaService) {}

  /** Idempotent seed of the 50-sticker catalog */
  async seedCatalog() {
    const existing = await this.prisma.sticker.findMany();
    const existingCodes = new Set(existing.map((s) => s.code));
    const toCreate = CATALOG.filter((s) => !existingCodes.has(s.code));
    if (toCreate.length === 0) return { seeded: 0 };
    await this.prisma.sticker.createMany({ data: toCreate, skipDuplicates: true });
    return { seeded: toCreate.length };
  }

  /** Award a random sticker to a user (called on order placement) */
  async awardRandom(customerId: string, triggerOrderId?: string) {
    // Weighted pick: common 60, rare 35, legendary 5
    const roll = Math.random() * 100;
    const rarity = roll < 60 ? "common" : roll < 95 ? "rare" : "legendary";
    const pool = await this.prisma.sticker.findMany({ where: { rarity } });
    if (pool.length === 0) {
      // Fall back to any sticker
      const fallback = await this.prisma.sticker.findMany({ take: 1 });
      if (fallback.length === 0) return null;
      pool.push(fallback[0]!);
    }
    const picked = pool[Math.floor(Math.random() * pool.length)]!;

    // Upsert user sticker (increment qty if already owned)
    const existing = await this.prisma.userSticker.findUnique({
      where: { customerId_stickerId: { customerId, stickerId: picked.id } },
    });
    if (existing) {
      await this.prisma.userSticker.update({
        where: { id: existing.id },
        data: { qty: { increment: 1 } },
      });
    } else {
      await this.prisma.userSticker.create({
        data: {
          customerId,
          stickerId: picked.id,
          firstEarnedFromOrder: triggerOrderId ?? null,
        },
      });
    }

    return {
      sticker: {
        code:   picked.code,
        name:   picked.name,
        emoji:  picked.emoji,
        theme:  picked.theme,
        rarity: picked.rarity,
      },
      isDuplicate: !!existing,
    };
  }

  /** Get user's complete album state */
  async getAlbum(customerId: string | null) {
    const stickers = await this.prisma.sticker.findMany({
      orderBy: [{ theme: "asc" }, { sortOrder: "asc" }],
    });
    const mine = customerId
      ? await this.prisma.userSticker.findMany({ where: { customerId } })
      : [];
    const claims = customerId
      ? await this.prisma.albumClaim.findMany({ where: { customerId } })
      : [];
    const mineMap = new Map(mine.map((m) => [m.stickerId, m]));
    const claimedRows = new Set(claims.map((c) => c.kind));

    const byTheme: Record<string, {
      theme: string;
      stickers: {
        code: string; name: string; emoji: string; rarity: string;
        collected: boolean; qty: number; collectedAt: Date | null;
      }[];
      collectedCount: number;
      total: number;
      rowComplete: boolean;
      prizeClaimed: boolean;
    }> = {};

    for (const s of stickers) {
      const user = mineMap.get(s.id);
      if (!byTheme[s.theme]) {
        byTheme[s.theme] = {
          theme: s.theme,
          stickers: [],
          collectedCount: 0,
          total: 0,
          rowComplete: false,
          prizeClaimed: claimedRows.has(`row:${s.theme}`),
        };
      }
      const row = byTheme[s.theme]!;
      row.total += 1;
      const collected = !!user;
      if (collected) row.collectedCount += 1;
      row.stickers.push({
        code:        s.code,
        name:        s.name,
        emoji:       s.emoji,
        rarity:      s.rarity,
        collected,
        qty:         user?.qty ?? 0,
        collectedAt: user?.collectedAt ?? null,
      });
    }
    for (const row of Object.values(byTheme)) {
      row.rowComplete = row.collectedCount === row.total;
    }

    const totalCollected = mine.length;
    const totalStickers  = stickers.length;
    const albumComplete  = totalCollected === totalStickers;
    const albumClaimed   = claimedRows.has("album");

    return {
      themes: THEMES.map((t) => byTheme[t]).filter(Boolean),
      totalCollected,
      totalStickers,
      albumComplete,
      albumClaimed,
    };
  }

  /** Claim a completed row's prize */
  async claimRow(customerId: string, theme: string) {
    if (!THEMES.includes(theme as any)) {
      throw new BadRequestException("Invalid theme");
    }
    const kind = `row:${theme}`;
    const existing = await this.prisma.albumClaim.findUnique({
      where: { customerId_kind: { customerId, kind } },
    });
    if (existing) throw new BadRequestException("Row prize already claimed");

    // Verify row is complete
    const stickersInTheme = await this.prisma.sticker.count({ where: { theme } });
    const ownedInTheme = await this.prisma.userSticker.count({
      where: { customerId, sticker: { theme } },
    });
    if (ownedInTheme < stickersInTheme) {
      throw new BadRequestException(`Not all ${theme} stickers collected yet`);
    }

    // Award: 50 Goins + 10% discount coupon (min ₹500, 30 days)
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: { coinBalance: { increment: ROW_PRIZE_GOINS } },
      });
      await tx.coinTransaction.create({
        data: {
          customerId,
          amount: ROW_PRIZE_GOINS,
          type: "streak_reward",
          description: `Album row complete: ${theme} — ${ROW_PRIZE_GOINS} Goins`,
        },
      });
      const code = `ALB-${theme.slice(0, 3).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const reward = await tx.rewardInstance.create({
        data: {
          customerId,
          type: "discount_pct",
          value: "10",
          label: `${theme.charAt(0).toUpperCase() + theme.slice(1)} row complete — 10% off`,
          source: "jackpot",
          code,
          minCartInr: 500,
          expiresAt: new Date(Date.now() + 30 * 86_400_000),
        },
      });
      const claim = await tx.albumClaim.create({
        data: { customerId, kind, rewardId: reward.id },
      });
      return { goinsAwarded: ROW_PRIZE_GOINS, rewardCode: code, claimId: claim.id };
    });
    return result;
  }

  /** Claim full-album prize */
  async claimAlbum(customerId: string) {
    const existing = await this.prisma.albumClaim.findUnique({
      where: { customerId_kind: { customerId, kind: "album" } },
    });
    if (existing) throw new BadRequestException("Album prize already claimed");

    const total = await this.prisma.sticker.count();
    const owned = await this.prisma.userSticker.count({ where: { customerId } });
    if (owned < total) {
      throw new BadRequestException(
        `Album not complete: ${owned}/${total} stickers`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: { coinBalance: { increment: ALBUM_PRIZE_GOINS } },
      });
      await tx.coinTransaction.create({
        data: {
          customerId,
          amount: ALBUM_PRIZE_GOINS,
          type: "streak_reward",
          description: `Full album complete — ${ALBUM_PRIZE_GOINS} Goins!`,
        },
      });
      const code = `ALBUM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const reward = await tx.rewardInstance.create({
        data: {
          customerId,
          type: "discount_flat",
          value: "500",
          label: "GIFT COLLECTOR — ₹500 off",
          source: "jackpot",
          code,
          minCartInr: 1000,
          expiresAt: new Date(Date.now() + 60 * 86_400_000),
        },
      });
      const claim = await tx.albumClaim.create({
        data: { customerId, kind: "album", rewardId: reward.id },
      });
      return { goinsAwarded: ALBUM_PRIZE_GOINS, rewardCode: code, claimId: claim.id };
    });
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NEW — Pack-based album API (mobile)
  // ═══════════════════════════════════════════════════════════════════════

  /** Idempotent seed of the pack-based catalog (24 stickers, 4 volumes). */
  async seedPackCatalog() {
    const existing = await this.prisma.sticker.findMany({
      where: { code: { in: PACK_CATALOG.map((s) => s.code) } },
    });
    const existingCodes = new Set(existing.map((s) => s.code));
    const toCreate = PACK_CATALOG.filter((s) => !existingCodes.has(s.code));
    if (toCreate.length === 0) return { seeded: 0 };
    await this.prisma.sticker.createMany({ data: toCreate, skipDuplicates: true });
    return { seeded: toCreate.length };
  }

  /**
   * GET /stickers/catalog — public catalog for the pack-based mobile album.
   * Returns ONLY stickers from the volume themes (filters out legacy
   * animals/food/etc. themes) so mobile sees a clean volume-based catalog.
   */
  async getPackCatalog() {
    const rows = await this.prisma.sticker.findMany({
      where: { theme: { in: [...VOLUMES] } },
      orderBy: [{ theme: "asc" }, { sortOrder: "asc" }],
    });
    return rows.map((r) => ({
      id:     r.id,
      code:   r.code,
      emoji:  r.emoji,
      name:   r.name,
      volume: r.theme,     // theme → volume mapping in serialization
      rarity: r.rarity,
    }));
  }

  /**
   * GET /stickers/user — the calling customer's pack-album state.
   * Returns the shape the mobile app's `AlbumState` expects:
   *   owned: {[stickerId]: count}, packs, coinsEarned, claimedVolumes
   */
  async getUserAlbum(customerId: string) {
    const profile = await this.ensureProfile(customerId);
    const [owned, claims] = await Promise.all([
      this.prisma.userSticker.findMany({
        where: {
          customerId,
          sticker: { theme: { in: [...VOLUMES] } },
        },
        select: { stickerId: true, qty: true },
      }),
      this.prisma.albumClaim.findMany({
        where: { customerId, kind: { startsWith: "volume:" } },
        select: { kind: true },
      }),
    ]);

    const ownedMap: Record<string, number> = {};
    for (const r of owned) ownedMap[r.stickerId] = r.qty;

    return {
      owned: ownedMap,
      packs: profile.packs,
      coinsEarned: profile.coinsEarned,
      claimedVolumes: claims.map((c) => c.kind.slice("volume:".length)),
    };
  }

  /**
   * POST /stickers/open-pack — opens one pack, reveals PACK_SIZE stickers.
   * Weighted-RNG per rarity. Duplicates auto-convert to Goins (credited to
   * coin balance + logged in CoinTransaction). Returns:
   *   { revealed: [{id, code, emoji, name, volume, rarity, isNew, duplicateCoins}],
   *     packsRemaining, coinsEarned, bonusCoins }
   */
  async openPack(customerId: string) {
    const profile = await this.ensureProfile(customerId);
    if (profile.packs <= 0) {
      throw new BadRequestException("No unopened packs — play games to earn more");
    }

    // Preload the pack-catalog stickers grouped by rarity for O(1) pick.
    const catalog = await this.prisma.sticker.findMany({
      where: { theme: { in: [...VOLUMES] } },
    });
    if (catalog.length === 0) {
      throw new BadRequestException("Sticker catalog not seeded");
    }
    const byRarity: Record<string, typeof catalog> = {};
    for (const s of catalog) (byRarity[s.rarity] ??= []).push(s);

    // Existing owned counts for duplicate detection
    const existing = await this.prisma.userSticker.findMany({
      where: {
        customerId,
        sticker: { theme: { in: [...VOLUMES] } },
      },
    });
    const ownedMap = new Map(existing.map((e) => [e.stickerId, e]));

    // Roll N stickers
    const revealed: Array<{
      picked: typeof catalog[number];
      isNew: boolean;
      duplicateCoins: number;
    }> = [];
    let bonusCoins = 0;
    const nextQty = new Map<string, number>(
      existing.map((e) => [e.stickerId, e.qty]),
    );

    for (let i = 0; i < PACK_SIZE; i++) {
      const rarity = weightedRarityRoll();
      let pool = byRarity[rarity] ?? [];
      // Fallback: if that rarity isn't in catalog (e.g. no mythic seeded),
      // drop to next-lowest tier with stickers.
      if (pool.length === 0) {
        const fallbackOrder: Rarity[] = ["legendary", "epic", "rare", "common"];
        for (const r of fallbackOrder) {
          if (byRarity[r]?.length) { pool = byRarity[r]; break; }
        }
      }
      if (pool.length === 0) continue;

      const picked = pool[Math.floor(Math.random() * pool.length)]!;
      const wasOwned = (nextQty.get(picked.id) ?? 0) > 0;
      const dupCoins = wasOwned ? (DUPLICATE_COINS[picked.rarity as Rarity] ?? 5) : 0;
      if (dupCoins > 0) bonusCoins += dupCoins;
      nextQty.set(picked.id, (nextQty.get(picked.id) ?? 0) + 1);
      revealed.push({ picked, isNew: !wasOwned, duplicateCoins: dupCoins });
    }

    // Persist in a single transaction: user_stickers upserts +
    // profile.packs-- + profile.coinsEarned+=bonus + customer.coinBalance+=bonus +
    // CoinTransaction row for duplicate-to-coin conversion (if any).
    const updated = await this.prisma.$transaction(async (tx) => {
      for (const r of revealed) {
        const existingRow = ownedMap.get(r.picked.id);
        if (existingRow) {
          await tx.userSticker.update({
            where: { id: existingRow.id },
            data:  { qty: { increment: 1 } },
          });
        } else {
          await tx.userSticker.create({
            data: {
              customerId,
              stickerId: r.picked.id,
            },
          });
          // Update ownedMap so subsequent reveals in this same pack see it.
          ownedMap.set(r.picked.id, {
            id: "pending",
            customerId,
            stickerId: r.picked.id,
            qty: 1,
            firstEarnedFromOrder: null,
            collectedAt: new Date(),
          });
        }
      }

      const newPacks = profile.packs - 1;
      const newEarned = profile.coinsEarned + bonusCoins;
      await (tx as any).userStickerProfile.update({
        where: { customerId },
        data: { packs: newPacks, coinsEarned: newEarned },
      });

      if (bonusCoins > 0) {
        await tx.customer.update({
          where: { id: customerId },
          data: { coinBalance: { increment: bonusCoins } },
        });
        await tx.coinTransaction.create({
          data: {
            customerId,
            amount: bonusCoins,
            type: "streak_reward",
            description: `Pack duplicates converted — ${bonusCoins} Goins`,
          },
        });
      }

      return { packs: newPacks, coinsEarned: newEarned };
    });

    return {
      revealed: revealed.map((r) => ({
        id:             r.picked.id,
        code:           r.picked.code,
        emoji:          r.picked.emoji,
        name:           r.picked.name,
        volume:         r.picked.theme,
        rarity:         r.picked.rarity,
        isNew:          r.isNew,
        duplicateCoins: r.duplicateCoins,
      })),
      packsRemaining: updated.packs,
      coinsEarned:    updated.coinsEarned,
      bonusCoins,
    };
  }

  /**
   * POST /stickers/claim-volume { volume } — claim the VOLUME_PRIZE for a
   * completed volume. Requires every sticker in that volume to be owned.
   * Idempotent: throws if already claimed.
   */
  async claimVolume(customerId: string, volume: string) {
    if (!VOLUMES.includes(volume as any)) {
      throw new BadRequestException(`Unknown volume: ${volume}`);
    }

    const kind = `volume:${volume}`;
    const existing = await this.prisma.albumClaim.findUnique({
      where: { customerId_kind: { customerId, kind } },
    });
    if (existing) throw new BadRequestException("Volume prize already claimed");

    const [totalInVolume, ownedInVolume] = await Promise.all([
      this.prisma.sticker.count({ where: { theme: volume } }),
      this.prisma.userSticker.count({
        where: { customerId, sticker: { theme: volume } },
      }),
    ]);
    if (totalInVolume === 0) {
      throw new BadRequestException("Volume has no stickers");
    }
    if (ownedInVolume < totalInVolume) {
      throw new BadRequestException(
        `Volume "${volume}" incomplete: ${ownedInVolume}/${totalInVolume}`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: { coinBalance: { increment: VOLUME_PRIZE } },
      });
      await tx.coinTransaction.create({
        data: {
          customerId,
          amount: VOLUME_PRIZE,
          type: "streak_reward",
          description: `Volume "${volume}" complete — ${VOLUME_PRIZE} Goins`,
        },
      });
      const claim = await tx.albumClaim.create({
        data: { customerId, kind },
      });
      return { coins: VOLUME_PRIZE, claimId: claim.id };
    });

    return result;
  }

  /**
   * Grant packs to a customer (called from games module on wins, or manually
   * via admin). Creates the profile if needed.
   */
  async grantPacks(customerId: string, n = 1) {
    const profile = await this.ensureProfile(customerId);
    const updated = await (this.prisma as any).userStickerProfile.update({
      where: { customerId },
      data: { packs: profile.packs + Math.max(1, n) },
    });
    return { packs: updated.packs };
  }

  // ─── Internal helpers ──────────────────────────────────────────────────

  private async ensureProfile(customerId: string) {
    const existing = await (this.prisma as any).userStickerProfile.findUnique({
      where: { customerId },
    });
    if (existing) return existing;
    return await (this.prisma as any).userStickerProfile.create({
      data: { customerId, packs: STARTER_PACKS, coinsEarned: 0 },
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers (module-scope)
// ═══════════════════════════════════════════════════════════════════════════

function weightedRarityRoll(): Rarity {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
    r -= weight;
    if (r <= 0) return rarity as Rarity;
  }
  return "common";
}
