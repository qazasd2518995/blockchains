import { z } from 'zod';

export const loginSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 chars')
    .max(40, 'Username must be at most 40 chars')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, digits, and . _ -'),
  password: z.string().min(1).max(128),
  captchaCode: z.string().regex(/^\d{4}$/),
  captchaToken: z.string().min(20).max(512),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Za-z]/)
    .regex(/\d/),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
