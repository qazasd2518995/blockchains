import { z } from 'zod';

const signedDecimal = z.string().regex(/^-?\d+(\.\d+)?$/);
const decimal = z.string().regex(/^\d+(\.\d+)?$/);
const positiveDecimal = decimal.refine((value) => Number.parseFloat(value) > 0, 'must be > 0');
const rateDecimal = decimal.refine((value) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n >= 0 && n <= 100;
}, 'must be between 0 and 100');
const biteRateDecimal = decimal.refine((value) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n >= 10 && n <= 70;
}, 'must be between 10 and 70');
const positiveRateDecimal = decimal.refine((value) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 && n <= 100;
}, 'must be > 0 and <= 100');
const fractionDecimal = decimal.refine((value) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n >= 0 && n <= 1;
}, 'must be between 0 and 1');

export const winLossControlSchema = z
  .object({
    controlMode: z.enum(['NORMAL', 'AGENT_LINE', 'SINGLE_MEMBER', 'AUTO_DETECT']),
    targetType: z.enum(['agent', 'member']).optional().nullable(),
    targetId: z.string().optional().nullable(),
    targetUsername: z.string().optional().nullable(),
    controlPercentage: positiveRateDecimal.default('50'),
    targetBitePercentage: positiveRateDecimal.optional().nullable(),
    winControl: z.boolean().default(false),
    lossControl: z.boolean().default(false),
    startPeriod: z.string().optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.winControl === value.lossControl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '输赢控制必须且只能选择放水或杀分其中一种',
        path: ['winControl'],
      });
    }
  });

export const winCapControlSchema = z.object({
  memberId: z.string(),
  memberUsername: z.string(),
  winCapAmount: positiveDecimal,
  controlWinRate: fractionDecimal.default('0.70'),
  triggerThreshold: fractionDecimal.default('0.80'),
  notes: z.string().max(500).optional(),
});

export const depositControlSchema = z
  .object({
    scope: z.enum(['MEMBER', 'AGENT_LINE']).default('MEMBER'),
    memberId: z.string().optional().nullable(),
    memberUsername: z.string().optional().nullable(),
    targetAgentId: z.string().optional().nullable(),
    targetAgentUsername: z.string().optional().nullable(),
    depositAmount: decimal.optional(),
    targetProfit: decimal.optional(),
    startBalance: decimal.optional(),
    controlWinRate: fractionDecimal.default('0.50'),
    lifecycleSteps: z.array(z.coerce.number().min(0).max(1000)).min(1).max(20).optional(),
    notes: z.string().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scope === 'MEMBER' && (!value.memberId || !value.memberUsername)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '入金控制必须指定会员账号',
        path: ['memberId'],
      });
    }
    if (value.scope === 'AGENT_LINE' && (!value.targetAgentId || !value.targetAgentUsername)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '代理线入金控制必须指定代理账号',
        path: ['targetAgentId'],
      });
    }
    if (value.lifecycleSteps) {
      const hasInvalid = value.lifecycleSteps.some((step) => !Number.isFinite(step));
      if (hasInvalid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '生命周期阶段必须是数字',
          path: ['lifecycleSteps'],
        });
      }
    } else {
      if (!value.depositAmount || Number.parseFloat(value.depositAmount) <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '旧版入金控制必须输入入金金额',
          path: ['depositAmount'],
        });
      }
      if (!value.targetProfit || Number.parseFloat(value.targetProfit) <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '旧版入金控制必须输入目标盈利',
          path: ['targetProfit'],
        });
      }
    }
  });

export const agentLineControlSchema = z.object({
  agentId: z.string(),
  agentUsername: z.string(),
  dailyCap: positiveDecimal,
  controlWinRate: fractionDecimal.default('0.70'),
  triggerThreshold: fractionDecimal.default('0.80'),
  notes: z.string().max(500).optional(),
});

export const burstControlSchema = z
  .object({
    scope: z.enum(['ALL', 'AGENT_LINE', 'MEMBER']),
    targetAgentId: z.string().optional().nullable(),
    targetAgentUsername: z.string().optional().nullable(),
    targetMemberId: z.string().optional().nullable(),
    targetMemberUsername: z.string().optional().nullable(),
    dailyBudget: decimal,
    memberDailyCap: decimal,
    minBurstProfit: decimal.default('200'),
    maxBurstProfit: decimal.optional(),
    singlePayoutCap: decimal.optional(),
    singleMultiplierCap: decimal.default('100'),
    minBurstMultiplier: decimal.optional(),
    smallWinMultiplier: decimal.default('1.5'),
    burstRate: rateDecimal.default('0.03'),
    smallWinRate: rateDecimal.default('0.35'),
    lossRate: rateDecimal.default('0'),
    compensationLoss: decimal.default('500'),
    capitalRetentionRatio: rateDecimal.default('0.30'),
    minEligibilityLoss: decimal.default('0'),
    riskWinLimit: decimal.optional(),
    cooldownRounds: z.coerce.number().int().min(0).max(200).default(8),
    gameIds: z.array(z.string().min(1)).default([]),
    notes: z.string().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scope !== 'MEMBER') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '爆分控制只能指定單一會員',
        path: ['scope'],
      });
    }
    if (value.scope === 'AGENT_LINE' && !value.targetAgentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '代理线爆分控制必须指定目标代理',
        path: ['targetAgentId'],
      });
    }
    if (value.scope === 'MEMBER' && !value.targetMemberUsername && !value.targetMemberId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '会员爆分控制必须指定目标会员',
        path: ['targetMemberUsername'],
      });
    }
    const maxBurstProfit = value.maxBurstProfit ?? value.singlePayoutCap;
    if (!maxBurstProfit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '必须指定单次最大净赢',
        path: ['maxBurstProfit'],
      });
    }
    const minProfit = Number(value.minBurstProfit);
    const maxProfit = Number(maxBurstProfit ?? 0);
    const dailyBudget = Number(value.dailyBudget);
    const memberDailyCap = Number(value.memberDailyCap);
    const burstRate = Number(value.burstRate);
    const capitalRetentionRatio = Number(value.capitalRetentionRatio);
    const minEligibilityLoss = Number(value.minEligibilityLoss);
    if (!Number.isFinite(minProfit) || minProfit <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '单次最小净赢必须大于 0',
        path: ['minBurstProfit'],
      });
    }
    if (!Number.isFinite(maxProfit) || maxProfit <= 0 || maxProfit < minProfit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '单次最大净赢必须大于等于最小净赢',
        path: ['maxBurstProfit'],
      });
    }
    if (!Number.isFinite(dailyBudget) || dailyBudget < maxProfit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '每日爆分总池不可小于单次最大净赢',
        path: ['dailyBudget'],
      });
    }
    if (!Number.isFinite(memberDailyCap) || memberDailyCap < maxProfit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '单会员每日上限不可小于单次最大净赢',
        path: ['memberDailyCap'],
      });
    }
    if (!Number.isFinite(burstRate) || burstRate < 0 || burstRate > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '爆分机率必须介于 0 到 100',
        path: ['burstRate'],
      });
    }
    if (
      !Number.isFinite(capitalRetentionRatio) ||
      capitalRetentionRatio < 0 ||
      capitalRetentionRatio >= 100
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '本金剩余比例必须介于 0 到 99.99',
        path: ['capitalRetentionRatio'],
      });
    }
    if (!Number.isFinite(minEligibilityLoss) || minEligibilityLoss < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '最低累亏金额不可小于 0',
        path: ['minEligibilityLoss'],
      });
    }
  });

export const manualDetectionControlSchema = z
  .object({
    scope: z.enum(['ALL', 'AGENT_LINE', 'MEMBER']),
    targetAgentId: z.string().optional().nullable(),
    targetAgentUsername: z.string().optional().nullable(),
    targetMemberId: z.string().optional().nullable(),
    targetMemberUsername: z.string().optional().nullable(),
    controlMode: z.enum(['settlement', 'lifecycle_path']).default('lifecycle_path'),
    targetSettlement: signedDecimal.default('0'),
    controlPercentage: z.coerce.number().int().min(1).max(100).default(50),
    bitePercentage: biteRateDecimal.optional().nullable(),
    houseTakePercentage: rateDecimal.default('10'),
    completionBehavior: z.enum(['hold_target', 'stop_on_target']).optional().nullable(),
    lifecycleTemplateKeys: z.array(z.string().min(1)).min(1).max(6).optional().nullable(),
    lineFreezeThreshold: decimal.default('50000'),
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
    if (value.controlMode === 'lifecycle_path' && !value.lifecycleTemplateKeys?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '本金路径控制必须至少选择一组路径',
        path: ['lifecycleTemplateKeys'],
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

export const manualDetectionBitePreviewQuerySchema = z
  .object({
    scope: z.enum(['ALL', 'AGENT_LINE', 'MEMBER']),
    agentId: z.string().optional(),
    memberUsername: z.string().optional(),
    bitePercentage: biteRateDecimal,
    houseTakePercentage: rateDecimal.default('10'),
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

export const onlineRewardSchema = z
  .object({
    scope: z.enum(['ALL', 'AGENT_LINE', 'MEMBER']).default('ALL'),
    targetAgentId: z.string().optional().nullable(),
    targetAgentUsername: z.string().optional().nullable(),
    targetMemberId: z.string().optional().nullable(),
    targetMemberUsername: z.string().optional().nullable(),
    totalAmount: positiveDecimal,
    recentMinutes: z.coerce.number().int().min(1).max(1440).default(15),
  })
  .superRefine((value, ctx) => {
    if (value.scope === 'AGENT_LINE' && !value.targetAgentId && !value.targetAgentUsername) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '在线均分必赢必须指定目标代理线',
        path: ['targetAgentId'],
      });
    }
    if (value.scope === 'MEMBER' && !value.targetMemberId && !value.targetMemberUsername) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '在线均分必赢必须指定目标玩家',
        path: ['targetMemberId'],
      });
    }
  });

export const autoBalanceConfigSchema = z.object({
  isEnabled: z.boolean().default(true),
  templateKey: z.string().min(1),
  secondLineAmount: decimal.default('50000'),
});

export const toggleSchema = z.object({
  isActive: z.boolean(),
});

export type WinLossControlInput = z.infer<typeof winLossControlSchema>;
export type WinCapControlInput = z.infer<typeof winCapControlSchema>;
export type DepositControlInput = z.infer<typeof depositControlSchema>;
export type AgentLineControlInput = z.infer<typeof agentLineControlSchema>;
export type BurstControlInput = z.infer<typeof burstControlSchema>;
export type ManualDetectionControlInput = z.infer<typeof manualDetectionControlSchema>;
