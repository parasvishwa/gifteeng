import { z } from "zod";

export const WalletBalanceSchema = z.object({
  walletId: z.string().uuid(),
  balance: z.string(),
  lockedBalance: z.string(),
  currency: z.string().default("INR"),
});
export type WalletBalance = z.infer<typeof WalletBalanceSchema>;

export const WalletTopupInputSchema = z.object({
  walletId: z.string().uuid(),
  amount: z.number().positive(),
  reference: z.string().optional(),
});
export type WalletTopupInput = z.infer<typeof WalletTopupInputSchema>;
