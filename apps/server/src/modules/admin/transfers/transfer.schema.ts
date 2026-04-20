import { z } from 'zod';

const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/);

export const agentToAgentSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  amount: decimalString,
  description: z.string().max(200).optional(),
});

export const agentToMemberSchema = z.object({
  agentId: z.string().min(1),
  memberId: z.string().min(1),
  amount: decimalString,   // 正數：代理→會員，負數：會員→代理
  description: z.string().max(200).optional(),
});

export const csTransferSchema = z.object({
  targetId: z.string().min(1),
  amount: decimalString,   // 正數：加點、負數：扣點
  description: z.string().max(200).optional(),
});

export const transferListQuerySchema = z.object({
  fromId: z.string().optional(),
  toId: z.string().optional(),
  type: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type AgentToAgentInput = z.infer<typeof agentToAgentSchema>;
export type AgentToMemberInput = z.infer<typeof agentToMemberSchema>;
export type CsTransferInput = z.infer<typeof csTransferSchema>;
export type TransferListQuery = z.infer<typeof transferListQuerySchema>;
