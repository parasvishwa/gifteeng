import { z } from "zod";

export const CartItemInputSchema = z.object({
  productId: z.string().uuid(),
  qty: z.number().int().min(1),
  variantOptions: z.record(z.string(), z.string()).optional(),
  customization: z.unknown().optional(),
});
export type CartItemInput = z.infer<typeof CartItemInputSchema>;

export const CartSchema = z.object({
  id: z.string().uuid(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      productId: z.string().uuid(),
      qty: z.number().int(),
      variantOptions: z.record(z.string(), z.string()).nullable().optional(),
      customization: z.unknown().nullable().optional(),
    }),
  ),
});
export type Cart = z.infer<typeof CartSchema>;
