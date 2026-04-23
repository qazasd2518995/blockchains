import { z } from 'zod';

export const createSubAccountSchema = z.object({
  parentAgentId: z.string().min(1).optional(),
  username: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Za-z]/)
    .regex(/\d/),
  displayName: z.string().max(40).optional(),
  notes: z.string().max(500).optional(),
});

export const resetSubAccountPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Za-z]/)
    .regex(/\d/),
});

export const updateSubAccountStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'FROZEN', 'DISABLED']),
});

export const subAccountListQuerySchema = z.object({
  parentAgentId: z.string().optional(),
});

export type CreateSubAccountInput = z.infer<typeof createSubAccountSchema>;
export type ResetSubAccountPasswordInput = z.infer<typeof resetSubAccountPasswordSchema>;
export type UpdateSubAccountStatusInput = z.infer<typeof updateSubAccountStatusSchema>;
export type SubAccountListQuery = z.infer<typeof subAccountListQuerySchema>;
