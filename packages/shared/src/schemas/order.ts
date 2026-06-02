import { z } from "zod";
import { PAYMENT_METHODS, ORDER_STATUSES, CHANNELS } from "../constants";

export const AddressSchema = z.object({
  fullName: z.string(),
  phone: z.string(),
  line1: z.string(),
  line2: z.string().optional(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  country: z.string().default("IN"),
});
export type Address = z.infer<typeof AddressSchema>;

export const CheckoutAddonsSchema = z.object({
  giftWrap: z.boolean().optional().default(false),
  giftWrapPrice: z.number().nonnegative().optional().default(0),
  thankYouMessage: z.string().max(500).optional(),
  thankYouTemplateId: z.string().nullable().optional(),
  thankYouCardFee: z.number().nonnegative().optional().default(0),
  coinsToRedeem: z.number().int().nonnegative().optional().default(0),
  coinDiscountInr: z.number().nonnegative().optional().default(0),
});
export type CheckoutAddons = z.infer<typeof CheckoutAddonsSchema>;

export const CheckoutInputSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS),
  shippingAddress: AddressSchema,
  billingAddress: AddressSchema.optional(),
  discountCode: z.string().optional(),
  notes: z.string().optional(),
  preferredDeliveryDate: z.string().optional(),
  removePrice: z.boolean().optional().default(false),
  gstin: z.string().optional(),
  companyName: z.string().optional(),
  addons: CheckoutAddonsSchema.optional(),
});
export type CheckoutInput = z.infer<typeof CheckoutInputSchema>;

export const OrderSummarySchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  channel: z.enum(CHANNELS),
  status: z.enum(ORDER_STATUSES),
  grandTotal: z.string(),
  placedAt: z.string(),
});
export type OrderSummary = z.infer<typeof OrderSummarySchema>;
