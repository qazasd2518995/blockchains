import { z } from 'zod';

export const adminLoginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
  captchaCode: z.string().regex(/^\d{4}$/),
  captchaToken: z.string().min(20).max(512),
  twoFactorCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

export const adminRefreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const adminChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Za-z]/)
    .regex(/\d/),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type AdminRefreshInput = z.infer<typeof adminRefreshSchema>;
export type AdminChangePasswordInput = z.infer<typeof adminChangePasswordSchema>;
