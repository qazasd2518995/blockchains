import { z } from 'zod';

const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/);
const adminDateInputSchema = z.string().refine((value) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
  return Number.isFinite(new Date(value).getTime());
}, 'Invalid date');

export const createMemberSchema = z.object({
  agentId: z.string().min(1),
  username: z
    .string()
    .min(3, 'Username must be at least 3 chars')
    .max(40, 'Username must be at most 40 chars')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, digits, and . _ -'),
  password: z.string().min(8).max(128).regex(/[A-Za-z]/).regex(/\d/),
  displayName: z.string().min(1).max(40).optional(),
  initialBalance: decimalString.optional(),
  bettingLimitLevel: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export const updateMemberNotesSchema = z.object({
  notes: z.string().max(500).nullable(),
});

export const updateMemberStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'FROZEN', 'DISABLED']),
});

export const adjustMemberBalanceSchema = z.object({
  delta: decimalString,
  description: z.string().max(200).optional(),
});

export const resetMemberPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128).regex(/[A-Za-z]/).regex(/\d/),
});

export const updateMemberBettingLimitSchema = z.object({
  bettingLimitLevel: z.enum(['level1', 'level2', 'level3', 'level4', 'level5', 'unlimited']),
});

export const memberListQuerySchema = z.object({
  agentId: z.string().optional(),
  keyword: z.string().optional(),
  status: z.enum(['ACTIVE', 'FROZEN', 'DISABLED']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const memberBetQuerySchema = z.object({
  startDate: adminDateInputSchema.optional(),
  endDate: adminDateInputSchema.optional(),
  gameId: z.string().optional(),
  settlementStatus: z.enum(['settled', 'unsettled']).optional(),
  cursor: z.string().optional(),
  page: z.coerce.number().int().min(1).max(100000).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberNotesInput = z.infer<typeof updateMemberNotesSchema>;
export type UpdateMemberStatusInput = z.infer<typeof updateMemberStatusSchema>;
export type AdjustMemberBalanceInput = z.infer<typeof adjustMemberBalanceSchema>;
export type ResetMemberPasswordInput = z.infer<typeof resetMemberPasswordSchema>;
export type UpdateMemberBettingLimitInput = z.infer<typeof updateMemberBettingLimitSchema>;
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;
export type MemberBetQuery = z.infer<typeof memberBetQuerySchema>;
