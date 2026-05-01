import { z } from "zod";

// ---- B2C ----
export const B2cOtpRequestSchema = z.object({
  phone: z.string().regex(/^\+?\d{10,15}$/),
});
export type B2cOtpRequest = z.infer<typeof B2cOtpRequestSchema>;

export const B2cOtpVerifySchema = z.object({
  phone: z.string(),
  code: z.string().length(6),
});
export type B2cOtpVerify = z.infer<typeof B2cOtpVerifySchema>;

export const B2cGoogleVerifySchema = z.object({
  credential: z.string().min(10), // Google ID token (signed JWT)
});
export type B2cGoogleVerify = z.infer<typeof B2cGoogleVerifySchema>;

// ---- B2B ----
export const B2bLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type B2bLogin = z.infer<typeof B2bLoginSchema>;

export const B2bInviteSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  role: z.enum(["hr_admin", "production", "employee", "sales_admin"]),
});
export type B2bInvite = z.infer<typeof B2bInviteSchema>;

export const AuthTokenSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
  audience: z.enum(["b2c", "b2b"]),
});
export type AuthToken = z.infer<typeof AuthTokenSchema>;
