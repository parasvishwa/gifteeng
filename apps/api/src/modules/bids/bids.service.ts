import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class BidsService {
  constructor(private prisma: PrismaService) {}

  /** Current live bid item (open + window open) with user's own entries */
  async getCurrent(customerId: string | null) {
    const now = new Date();
    const item = await this.prisma.secretBidItem.findFirst({
      where: {
        status: "open",
        opensAt: { lte: now },
        closesAt: { gt: now },
      },
      orderBy: { closesAt: "asc" },
    });
    if (!item) return { item: null, myEntries: [], totalEntries: 0 };

    const [myEntries, totalEntries] = await Promise.all([
      customerId
        ? this.prisma.bidEntry.findMany({
            where: { bidItemId: item.id, customerId },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([]),
      this.prisma.bidEntry.count({ where: { bidItemId: item.id } }),
    ]);

    return {
      item: {
        id: item.id,
        title: item.title,
        description: item.description,
        imageUrl: item.imageUrl,
        prizeLabel: item.prizeLabel,
        minBidGoins: item.minBidGoins,
        maxBidGoins: item.maxBidGoins,
        costPerEntry: item.costPerEntry,
        opensAt: item.opensAt,
        closesAt: item.closesAt,
      },
      myEntries: myEntries.map((e) => ({
        id: e.id,
        bidAmount: e.bidAmount,
        costGoins: e.costGoins,
        createdAt: e.createdAt,
      })),
      totalEntries,
    };
  }

  /** Place a bid (1 bid = costPerEntry goins) */
  async placeBid(customerId: string, bidItemId: string, bidAmount: number) {
    const item = await this.prisma.secretBidItem.findUnique({
      where: { id: bidItemId },
    });
    if (!item) throw new NotFoundException("Bid item not found");
    if (item.status !== "open") throw new BadRequestException("Bid is closed");
    const now = new Date();
    if (now < item.opensAt || now >= item.closesAt) {
      throw new BadRequestException("Bidding window is not open");
    }
    if (bidAmount < item.minBidGoins || bidAmount > item.maxBidGoins) {
      throw new BadRequestException(
        `Bid must be between ${item.minBidGoins} and ${item.maxBidGoins} Goins`,
      );
    }
    // Limit 10 bids per user per item
    const myCount = await this.prisma.bidEntry.count({
      where: { bidItemId, customerId },
    });
    if (myCount >= 10) {
      throw new BadRequestException("Max 10 bids per item");
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { coinBalance: true },
    });
    if (!customer) throw new NotFoundException("Customer not found");
    if (customer.coinBalance < item.costPerEntry) {
      throw new BadRequestException(
        `You need ${item.costPerEntry} Goins to bid. Balance: ${customer.coinBalance}`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: { coinBalance: { decrement: item.costPerEntry } },
      });
      await tx.coinTransaction.create({
        data: {
          customerId,
          amount: -item.costPerEntry,
          type: "redemption",
          description: `Secret Bid entry — ${item.title}`,
          refId: bidItemId,
        },
      });
      const entry = await tx.bidEntry.create({
        data: {
          bidItemId,
          customerId,
          bidAmount,
          costGoins: item.costPerEntry,
        },
      });
      const customerAfter = await tx.customer.findUnique({
        where: { id: customerId },
        select: { coinBalance: true },
      });
      return { entryId: entry.id, newBalance: customerAfter?.coinBalance ?? 0 };
    });

    return result;
  }

  /**
   * Resolve a bid — called automatically when someone views a closed item
   * or manually by admin. Winner = entry with the LOWEST UNIQUE bid.
   */
  async resolveBid(bidItemId: string) {
    const item = await this.prisma.secretBidItem.findUnique({
      where: { id: bidItemId },
      include: {
        entries: { orderBy: { bidAmount: "asc" } },
      },
    });
    if (!item) throw new NotFoundException("Bid item not found");
    if (item.status === "resolved") {
      // Already resolved — return existing winner
      if (!item.winnerEntryId) return { winner: null };
      const winner = await this.prisma.bidEntry.findUnique({
        where: { id: item.winnerEntryId },
        include: { customer: { select: { fullName: true } } },
      });
      return {
        winner: winner
          ? {
              customerId: winner.customerId,
              customerName: winner.customer.fullName,
              bidAmount: winner.bidAmount,
              resolvedAt: item.updatedAt,
            }
          : null,
      };
    }

    const now = new Date();
    if (now < item.closesAt) {
      throw new BadRequestException("Bid is still open");
    }

    // Find the lowest unique bid
    const counts = new Map<number, { entries: (typeof item.entries)[number][] }>();
    for (const e of item.entries) {
      const cur = counts.get(e.bidAmount) ?? { entries: [] };
      cur.entries.push(e);
      counts.set(e.bidAmount, cur);
    }
    const sortedAmounts = Array.from(counts.keys()).sort((a, b) => a - b);
    let winnerEntry: (typeof item.entries)[number] | null = null;
    for (const amount of sortedAmounts) {
      const group = counts.get(amount)!;
      if (group.entries.length === 1) {
        winnerEntry = group.entries[0]!;
        break;
      }
    }

    // If no unique bid found, pick the earliest bidder of the lowest amount
    if (!winnerEntry && item.entries.length > 0) {
      winnerEntry = item.entries[0]!;
    }

    // Award winner with a reward instance (free prize)
    if (winnerEntry) {
      await this.prisma.$transaction(async (tx) => {
        const code = `BID-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        await tx.rewardInstance.create({
          data: {
            customerId: winnerEntry!.customerId,
            type: "free_product",
            value: item.productId ?? "",
            label: `Winner: ${item.prizeLabel}`,
            source: "jackpot", // closest enum for bid wins
            code,
            minCartInr: 0,
            expiresAt: new Date(Date.now() + 30 * 86_400_000),
          },
        });
        await tx.secretBidItem.update({
          where: { id: bidItemId },
          data: {
            status: "resolved",
            winnerEntryId: winnerEntry!.id,
          },
        });
        await tx.gamePlay.create({
          data: {
            customerId: winnerEntry!.customerId,
            gameType: "jackpot",
            rewardType: "free_product",
            rewardValue: item.productId ?? "",
            rewardLabel: `Bid Win: ${item.prizeLabel}`,
            costGoins: winnerEntry!.costGoins,
            triggerRef: bidItemId,
          },
        });
      });
    }

    return {
      winner: winnerEntry
        ? {
            customerId: winnerEntry.customerId,
            bidAmount: winnerEntry.bidAmount,
            resolvedAt: new Date(),
          }
        : null,
    };
  }

  /** List user's own bid history */
  async listMyBids(customerId: string, limit = 20) {
    return this.prisma.bidEntry.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        bidItem: {
          select: {
            title: true,
            prizeLabel: true,
            status: true,
            winnerEntryId: true,
            closesAt: true,
          },
        },
      },
    });
  }

  /** Admin: list all items (any status) */
  async adminListItems() {
    return this.prisma.secretBidItem.findMany({
      orderBy: { closesAt: "desc" },
      take: 50,
      include: { _count: { select: { entries: true } } },
    });
  }

  /** Admin: create a new bid item */
  async adminCreateItem(data: {
    title: string;
    description?: string;
    imageUrl?: string;
    productId?: string;
    prizeLabel: string;
    minBidGoins?: number;
    maxBidGoins?: number;
    costPerEntry?: number;
    opensAt: Date;
    closesAt: Date;
  }) {
    return this.prisma.secretBidItem.create({
      data: {
        title: data.title,
        description: data.description,
        imageUrl: data.imageUrl,
        productId: data.productId,
        prizeLabel: data.prizeLabel,
        minBidGoins: data.minBidGoins ?? 10,
        maxBidGoins: data.maxBidGoins ?? 500,
        costPerEntry: data.costPerEntry ?? 100,
        opensAt: data.opensAt,
        closesAt: data.closesAt,
      },
    });
  }

  /** Admin: seed a default bid item for today if none exists */
  async adminSeedDaily() {
    const now = new Date();
    const openNow = await this.prisma.secretBidItem.findFirst({
      where: { status: "open", closesAt: { gt: now } },
    });
    if (openNow) return { seeded: false, existing: openNow.id };

    // Window: opens now, closes in 24h
    const closesAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const created = await this.adminCreateItem({
      title: "Premium Gift Hamper",
      description:
        "A curated premium hamper — scented candles, chocolates, notebook and a surprise gift.",
      prizeLabel: "Premium Gift Hamper worth ₹2,500",
      minBidGoins: 10,
      maxBidGoins: 500,
      costPerEntry: 50,
      opensAt: now,
      closesAt,
    });
    return { seeded: true, id: created.id };
  }
}
