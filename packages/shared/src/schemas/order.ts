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

export const CheckoutInputSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS),
  shippingAddress: AddressSchema,
  billingAddress: AddressSchema.optional(),
  discountCode: z.string().optional(),
  notes: z.string().optional(),
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
