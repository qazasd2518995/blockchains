import { z } from 'zod';

const decimal = z.string().regex(/^-?\d+(\.\d+)?$/);

export const winLossControlSchema = z.object({
  controlMode: z.enum(['NORMAL', 'AGENT_LINE', 'SINGLE_MEMBER', 'AUTO_DETECT']),
  targetType: z.enum(['agent', 'member']).optional().nullable(),
  targetId: z.string().optional().nullable(),
  targetUsername: z.string().optional().nullable(),
  controlPercentage: decimal.default('50'),
  winControl: z.boolean().default(false),
  lossControl: z.boolean().default(false),
  startPeriod: z.string().optional().nullable(),
});

export const winCapControlSchema = z.object({
  memberId: z.string(),
  memberUsername: z.string(),
  winCapAmount: decimal,
  controlWinRate: decimal.default('0.70'),
  triggerThreshold: decimal.default('0.80'),
  notes: z.string().max(500).optional(),
});

export const depositControlSchema = z.object({
  memberId: z.string(),
  memberUsername: z.string(),
  depositAmount: decimal,
  targetProfit: decimal,
  startBalance: decimal,
  controlWinRate: decimal.default('0.70'),
  notes: z.string().max(500).optional(),
});

export const agentLineControlSchema = z.object({
  agentId: z.string(),
  agentUsername: z.string(),
  dailyCap: decimal,
  notes: z.string().max(500).optional(),
});

export const toggleSchema = z.object({
  isActive: z.boolean(),
});

export type WinLossControlInput = z.infer<typeof winLossControlSchema>;
export type WinCapControlInput = z.infer<typeof winCapControlSchema>;
export type DepositControlInput = z.infer<typeof depositControlSchema>;
export type AgentLineControlInput = z.infer<typeof agentLineControlSchema>;
