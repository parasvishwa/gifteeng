export const CHANNELS = ["b2c", "b2b"] as const;
export type Channel = (typeof CHANNELS)[number];

export const USER_ROLES = [
  "super_admin",
  "sales_admin",
  "hr_admin",
  "production",
  "employee",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ORDER_STATUSES = [
  "new_order",
  "confirmed",
  "in_production",
  "ready_to_ship",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ["razorpay", "wallet", "cod", "invoice"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
