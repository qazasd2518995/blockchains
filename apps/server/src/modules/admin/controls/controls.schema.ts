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
  controlWinRate: decimal.default('0.70'),
  triggerThreshold: decimal.default('0.80'),
  notes: z.string().max(500).optional(),
});

export const manualDetectionControlSchema = z
  .object({
    scope: z.enum(['ALL', 'AGENT_LINE', 'MEMBER']),
    targetAgentId: z.string().optional().nullable(),
    targetAgentUsername: z.string().optional().nullable(),
    targetMemberId: z.string().optional().nullable(),
    targetMemberUsername: z.string().optional().nullable(),
    targetSettlement: decimal,
    controlPercentage: z.coerce.number().int().min(1).max(100).default(50),
  })
  .superRefine((value, ctx) => {
    if (value.scope === 'AGENT_LINE' && !value.targetAgentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '代理线控制必须指定目标代理',
        path: ['targetAgentId'],
      });
    }
    if (value.scope === 'MEMBER' && !value.targetMemberUsername) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '会员控制必须指定目标会员',
        path: ['targetMemberUsername'],
      });
    }
  });

export const manualDetectionQuerySchema = z
  .object({
    scope: z.enum(['ALL', 'AGENT_LINE', 'MEMBER']),
    agentId: z.string().optional(),
    memberUsername: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scope === 'AGENT_LINE' && !value.agentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '代理线控制必须指定目标代理',
        path: ['agentId'],
      });
    }
    if (value.scope === 'MEMBER' && !value.memberUsername) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '会员控制必须指定目标会员',
        path: ['memberUsername'],
      });
    }
  });

export const deactivateManualDetectionSchema = z.object({
  id: z.string().optional(),
});

export const toggleSchema = z.object({
  isActive: z.boolean(),
});

export type WinLossControlInput = z.infer<typeof winLossControlSchema>;
export type WinCapControlInput = z.infer<typeof winCapControlSchema>;
export type DepositControlInput = z.infer<typeof depositControlSchema>;
export type AgentLineControlInput = z.infer<typeof agentLineControlSchema>;
export type ManualDetectionControlInput = z.infer<typeof manualDetectionControlSchema>;
