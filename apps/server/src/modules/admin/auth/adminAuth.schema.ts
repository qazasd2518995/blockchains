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

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type AdminRefreshInput = z.infer<typeof adminRefreshSchema>;
