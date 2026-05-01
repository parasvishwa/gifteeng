import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import * as crypto from "crypto";

// Simple weighted pool for the recipient's scratch reward (free, generous —
// the point of Duet is spreading joy, not risk).
type DuetReward = {
  type: string;
  value: string;
  label: string;
  weight: number;
  minCart?: number;
};
const DUET_POOL: DuetReward[] = [
  { type: "discount_pct",   value: "15",  label: "15% off your first Gifteeng order",  weight: 35, minCart: 500 },
  { type: "discount_pct",   value: "20",  label: "20% off your first Gifteeng order",  weight: 20, minCart: 800 },
  { type: "discount_flat",  value: "100", label: "₹100 off your first Gifteeng order", weight: 20, minCart: 400 },
  { type: "free_shipping",  value: "1",   label: "Free shipping on your first order",  weight: 15 },
  { type: "free_gift_wrap", value: "1",   label: "Free gift wrap on your first order", weight: 10 },
];

@Injectable()
export class DuetService {
  constructor(private prisma: PrismaService) {}

  /** Create an invite for a given order. Returns shareable token. */
  async createInvite(senderId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true },
    });
    if (!order || order.customerId !== senderId) {
      throw new NotFoundException("Order not found");
    }
    // Limit: 1 duet invite per order
    const existing = await this.prisma.duetInvite.findFirst({
      where: { senderId, orderId },
    });
    if (existing) {
      return { token: existing.token, alreadyCreated: true };
    }
    const sender = await this.prisma.customer.findUnique({
      where: { id: senderId },
      select: { fullName: true },
    });
    const token = crypto.randomBytes(10).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 86_400_000);
    await this.prisma.duetInvite.create({
      data: {
        senderId,
        senderName: sender?.fullName ?? null,
        orderId,
        token,
        expiresAt,
      },
    });
    return { token, alreadyCreated: false };
  }

  /** Public read — info for the recipient landing page */
  async getByToken(token: string) {
    const invite = await this.prisma.duetInvite.findUnique({
      where: { token },
    });
    if (!invite) throw new NotFoundException("Invalid or expired link");
    const isExpired = invite.expiresAt < new Date();
    return {
      token:       invite.token,
      senderName:  invite.senderName,
      isClaimed:   !!invite.claimedAt,
      isExpired,
      canClaim:    !invite.claimedAt && !isExpired,
    };
  }

  /**
   * Recipient claims the invite — must be authenticated.
   * Awards a generous scratch reward.
   */
  async claim(token: string, customerId: string) {
    const invite = await this.prisma.duetInvite.findUnique({ where: { token } });
    if (!invite) throw new NotFoundException("Invalid link");
    if (invite.claimedAt) throw new BadRequestException("This gift has already been claimed");
    if (invite.expiresAt < new Date()) throw new BadRequestException("This gift has expired");
    if (invite.senderId === customerId) {
      throw new BadRequestException("You can't claim your own Duet — share it with the gift recipient!");
    }

    // Pick a reward
    const total = DUET_POOL.reduce((a, p) => a + p.weight, 0);
    let r = Math.random() * total;
    let picked: DuetReward = DUET_POOL[0]!;
    for (const p of DUET_POOL) {
      r -= p.weight;
      if (r <= 0) { picked = p; break; }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const code = `DUET-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const reward = await tx.rewardInstance.create({
        data: {
          customerId,
          type: picked.type as any,
          value: picked.value,
          label: picked.label,
          source: "jackpot",
          code,
          minCartInr: picked.minCart ?? 0,
          expiresAt: new Date(Date.now() + 30 * 86_400_000),
        },
      });
      const updated = await tx.duetInvite.update({
        where: { token },
        data: {
          claimedAt: new Date(),
          claimedBy: customerId,
          rewardId: reward.id,
        },
      });
      // Also reward the SENDER with a small thank-you (10 goins)
      await tx.customer.update({
        where: { id: invite.senderId },
        data: { coinBalance: { increment: 10 } },
      });
      await tx.coinTransaction.create({
        data: {
          customerId: invite.senderId,
          amount: 10,
          type: "referral",
          description: "Duet gift claimed — +10 Goins thank-you",
          refId: updated.id,
        },
      });
      await tx.gamePlay.create({
        data: {
          customerId,
          gameType:    "jackpot",
          rewardType:  picked.type as any,
          rewardValue: picked.value,
          rewardLabel: `Duet: ${picked.label}`,
          triggerRef:  invite.orderId,
        },
      });
      return { rewardCode: code, rewardLabel: picked.label, rewardType: picked.type, rewardValue: picked.value };
    });

    return result;
  }

  /** User's duet history (sent + claimed) */
  async listMine(customerId: string) {
    const [sent, claimed] = await Promise.all([
      this.prisma.duetInvite.findMany({
        where: { senderId: customerId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      this.prisma.duetInvite.findMany({
        where: { claimedBy: customerId },
        orderBy: { claimedAt: "desc" },
        take: 10,
      }),
    ]);
    return { sent, claimed };
  }
}
