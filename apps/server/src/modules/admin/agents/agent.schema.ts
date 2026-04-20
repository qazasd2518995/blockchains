import { z } from 'zod';

const decimalString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, 'invalid decimal');

export const createAgentSchema = z.object({
  parentId: z.string().min(1),
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(8).max(128).regex(/[A-Za-z]/).regex(/\d/),
  displayName: z.string().min(1).max(40).optional(),
  level: z.number().int().min(1).max(15),
  marketType: z.enum(['D', 'A']).optional(),
  commissionRate: decimalString.optional(),
  rebateMode: z.enum(['PERCENTAGE', 'ALL', 'NONE']).optional(),
  rebatePercentage: decimalString.optional(),
  bettingLimitLevel: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export const updateAgentSchema = z.object({
  displayName: z.string().min(1).max(40).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const updateAgentRebateSchema = z.object({
  rebateMode: z.enum(['PERCENTAGE', 'ALL', 'NONE']),
  rebatePercentage: decimalString,
});

export const updateAgentStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'FROZEN', 'DELETED']),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128).regex(/[A-Za-z]/).regex(/\d/),
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type UpdateAgentRebateInput = z.infer<typeof updateAgentRebateSchema>;
export type UpdateAgentStatusInput = z.infer<typeof updateAgentStatusSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
