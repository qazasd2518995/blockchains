import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(8).max(128).regex(/[A-Za-z]/, 'password must contain a letter').regex(/\d/, 'password must contain a digit'),
  displayName: z.string().min(1).max(40).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(1).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
