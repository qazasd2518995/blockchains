import type { FastifyInstance, FastifyReply } from 'fastify';
import { ManualDetectionScope, Prisma } from '@prisma/client';
import {
  winLossControlSchema,
  winCapControlSchema,
  depositControlSchema,
  agentLineControlSchema,
  burstControlSchema,
  manualDetectionBitePreviewQuerySchema,
  manualDetectionControlSchema,
  manualDetectionQuerySchema,
  deactivateManualDetectionSchema,
  onlineRewardSchema,
  toggleSchema,
  type WinLossControlInput,
} from './controls.schema.js';
import {
  calculateCurrentSettlement,
  calculateAutoDetectionBitePlan,
  calculateDefaultManualTargetBand,
  calculateControlCapital,
  checkAndCompleteManualDetectionControls,
  getAllActiveManualDetectionControls,
  getControlGameDay,
  normalizeManualDetectionCompletionBehavior,
  normalizeAgentLineCapDay,
  normalizeBurstControlDay,
  normalizeMemberWinCapDay,
} from './controls.runtime.js';
import { writeAudit } from '../audit/audit.service.js';
import { listAgentDescendants } from '../../../utils/hierarchy.js';

function decimal(value: Prisma.Decimal | string | number | null | undefined): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Prisma.Decimal(value);
  return new Prisma.Decimal(0);
}

function normalizeRate(value: Prisma.Decimal | string | number | null | undefined): Prisma.Decimal {
  const rate = decimal(value);
  return rate.greaterThan(1) ? rate.div(100) : rate;
}

function normalizeGameIds(gameIds: string[] | undefined): string[] {
  return Array.from(
    new Set((gameIds ?? []).map((gameId) => gameId.trim()).filter((gameId) => gameId.length > 0)),
  );
}

function serializeSettlement(summary: Awaited<ReturnType<typeof calculateCurrentSettlement>>) {
  return {
    gameDay: summary.gameDay,
    totalBet: summary.totalBet.toFixed(2),
    totalPayout: summary.totalPayout.toFixed(2),
    memberWinLoss: summary.memberWinLoss.toFixed(2),
    totalRebate: summary.totalRebate.toFixed(2),
    superiorSettlement: summary.superiorSettlement.toFixed(2),
    totalBets: summary.totalBets,
    totalPlayers: summary.totalPlayers,
    status: summary.status,
    statusText: summary.statusText,
  };
}

function serializeBitePlan(plan: Awaited<ReturnType<typeof calculateAutoDetectionBitePlan>>) {
  return {
    gameDay: plan.gameDay,
    bitePercentage: plan.bitePercentage.toFixed(2),
    houseTakePercentage: plan.houseTakePercentage.toFixed(2),
    capitalAmount: plan.capitalAmount.toFixed(2),
    biteAmount: plan.biteAmount.toFixed(2),
    platformTake: plan.platformTake.toFixed(2),
    redistributionAmount: plan.redistributionAmount.toFixed(2),
    currentSettlement: plan.currentSettlement.toFixed(2),
    targetSettlement: plan.targetSettlement.toFixed(2),
  };
}

type ControlLogRecord = {
  id: string;
  controlId: string;
  betId: string | null;
  userId: string;
  gameId: string;
  originalResult: Prisma.JsonValue;
  finalResult: Prisma.JsonValue;
  flipReason: string;
  createdAt: Date;
};

type ControlLogSource =
  | 'win_loss_control'
  | 'online_reward_next_win'
  | 'deposit_control'
  | 'auto_balance'
  | 'manual_detection'
  | 'burst_control'
  | 'member_win_cap'
  | 'agent_line_cap'
  | 'global_member_daily_win_cap'
  | 'global_accidental_burst_cap'
  | 'unknown';

type ControlLogMeta = {
  source: ControlLogSource;
  sourceLabel: string;
  scopeLabel: string;
  targetLabel: string | null;
  operatorUsername: string | null;
  detail: string;
};

async function serializeManualControl(
  fastify: FastifyInstance,
  control: Awaited<ReturnType<FastifyInstance['prisma']['manualDetectionControl']['findFirst']>> & {
    id: string;
  },
) {
  const settlement = await calculateCurrentSettlement(
    fastify.prisma,
    control.scope,
    control.targetAgentId,
    control.targetMemberUsername,
  );
  return {
    ...control,
    targetSettlement: control.targetSettlement.toFixed(2),
    startSettlement: control.startSettlement?.toFixed(2) ?? null,
    bitePercentage: control.bitePercentage?.toFixed(2) ?? null,
    houseTakePercentage: control.houseTakePercentage.toFixed(2),
    completionBehavior: control.completionBehavior,
    targetBand: control.targetBand.toFixed(2),
    cycleCount: control.cycleCount,
    lastCycleSettlement: control.lastCycleSettlement?.toFixed(2) ?? null,
    lastCapitalAmount: control.lastCapitalAmount?.toFixed(2) ?? null,
    lastPlatformTake: control.lastPlatformTake?.toFixed(2) ?? null,
    lastRedistributionAmount: control.lastRedistributionAmount?.toFixed(2) ?? null,
    completionSettlement: control.completionSettlement?.toFixed(2) ?? null,
    currentSettlement: settlement.superiorSettlement.toFixed(2),
    gameDay: settlement.gameDay,
  };
}

async function enrichControlLogs(
  fastify: FastifyInstance,
  logs: ControlLogRecord[],
  usernames: Map<string, string>,
) {
  const controlIds = Array.from(
    new Set(
      logs
        .map((log) => log.controlId)
        .filter((controlId) => controlId && controlId !== 'global-member-daily-win-cap'),
    ),
  );

  const [
    winLossControls,
    depositControls,
    manualControls,
    burstControls,
    memberWinCaps,
    agentLineCaps,
    autoBalanceControls,
  ] = await Promise.all([
    fastify.prisma.winLossControl.findMany({
      where: { id: { in: controlIds } },
      select: {
        id: true,
        controlMode: true,
        targetUsername: true,
        controlPercentage: true,
        targetBitePercentage: true,
        targetLossAmount: true,
        winControl: true,
        lossControl: true,
        operatorUsername: true,
      },
    }),
    fastify.prisma.memberDepositControl.findMany({
      where: { id: { in: controlIds } },
      select: {
        id: true,
        memberUsername: true,
        targetProfit: true,
        controlWinRate: true,
        notes: true,
        operatorUsername: true,
      },
    }),
    fastify.prisma.manualDetectionControl.findMany({
      where: { id: { in: controlIds } },
      select: {
        id: true,
        scope: true,
        targetAgentUsername: true,
        targetMemberUsername: true,
        targetSettlement: true,
        controlPercentage: true,
        bitePercentage: true,
        operatorUsername: true,
      },
    }),
    fastify.prisma.burstControl.findMany({
      where: { id: { in: controlIds } },
      select: {
        id: true,
        scope: true,
        targetAgentUsername: true,
        targetMemberUsername: true,
        dailyBudget: true,
        memberDailyCap: true,
        singlePayoutCap: true,
        operatorUsername: true,
      },
    }),
    fastify.prisma.memberWinCapControl.findMany({
      where: { id: { in: controlIds } },
      select: {
        id: true,
        memberUsername: true,
        winCapAmount: true,
        controlWinRate: true,
        operatorUsername: true,
      },
    }),
    fastify.prisma.agentLineWinCap.findMany({
      where: { id: { in: controlIds } },
      select: {
        id: true,
        agentUsername: true,
        dailyCap: true,
        controlWinRate: true,
        operatorUsername: true,
      },
    }),
    fastify.prisma.memberAutoBalanceControl.findMany({
      where: { id: { in: controlIds } },
      select: {
        id: true,
        memberUsername: true,
        baselineBalance: true,
        biteTargetBalance: true,
        reviveTargetBalance: true,
        phase: true,
        operatorUsername: true,
      },
    }),
  ]);

  const metaMaps = {
    winLoss: new Map(winLossControls.map((control) => [control.id, control])),
    deposit: new Map(depositControls.map((control) => [control.id, control])),
    manual: new Map(manualControls.map((control) => [control.id, control])),
    burst: new Map(burstControls.map((control) => [control.id, control])),
    memberWinCap: new Map(memberWinCaps.map((control) => [control.id, control])),
    agentLineCap: new Map(agentLineCaps.map((control) => [control.id, control])),
    autoBalance: new Map(autoBalanceControls.map((control) => [control.id, control])),
  };

  return logs.map((log) => {
    const meta = resolveControlLogMeta(log, metaMaps);
    return {
      ...log,
      username: usernames.get(log.userId) ?? log.userId,
      controlSource: meta.source,
      controlSourceLabel: meta.sourceLabel,
      controlActionLabel: resolveControlLogActionLabel(log),
      controlScopeLabel: meta.scopeLabel,
      controlTargetLabel: meta.targetLabel,
      controlDetail: meta.detail,
      controlDirectionLabel: resolveControlLogDirectionLabel(log),
      operatorUsername: meta.operatorUsername,
    };
  });
}

function resolveControlLogMeta(
  log: ControlLogRecord,
  maps: {
    winLoss: Map<
      string,
      {
        controlMode: string;
        targetUsername: string | null;
        controlPercentage: Prisma.Decimal;
        targetBitePercentage: Prisma.Decimal | null;
        targetLossAmount: Prisma.Decimal | null;
        winControl: boolean;
        lossControl: boolean;
        operatorUsername: string | null;
      }
    >;
    deposit: Map<
      string,
      {
        memberUsername: string;
        targetProfit: Prisma.Decimal;
        controlWinRate: Prisma.Decimal;
        notes: string | null;
        operatorUsername: string | null;
      }
    >;
    manual: Map<
      string,
      {
        scope: ManualDetectionScope;
        targetAgentUsername: string | null;
        targetMemberUsername: string | null;
        targetSettlement: Prisma.Decimal;
        controlPercentage: number;
        bitePercentage: Prisma.Decimal | null;
        operatorUsername: string | null;
      }
    >;
    burst: Map<
      string,
      {
        scope: ManualDetectionScope;
        targetAgentUsername: string | null;
        targetMemberUsername: string | null;
        dailyBudget: Prisma.Decimal;
        memberDailyCap: Prisma.Decimal;
        singlePayoutCap: Prisma.Decimal;
        operatorUsername: string | null;
      }
    >;
    memberWinCap: Map<
      string,
      {
        memberUsername: string;
        winCapAmount: Prisma.Decimal;
        controlWinRate: Prisma.Decimal;
        operatorUsername: string | null;
      }
    >;
    agentLineCap: Map<
      string,
      {
        agentUsername: string;
        dailyCap: Prisma.Decimal;
        controlWinRate: Prisma.Decimal;
        operatorUsername: string | null;
      }
    >;
    autoBalance: Map<
      string,
      {
        memberUsername: string;
        baselineBalance: Prisma.Decimal;
        biteTargetBalance: Prisma.Decimal;
        reviveTargetBalance: Prisma.Decimal;
        phase: string;
        operatorUsername: string | null;
      }
    >;
  },
): ControlLogMeta {
  const reasonSource = resolveControlLogSource(log.flipReason);

  if (reasonSource === 'win_loss_control') {
    const control = maps.winLoss.get(log.controlId);
    if (control) {
      const scopeLabel = formatWinLossLogScope(control.controlMode);
      const targetLabel = formatTargetForLog(scopeLabel, control.targetUsername);
      const direction = control.winControl
        ? '放會員 / 上級付'
        : control.lossControl
          ? '咬會員 / 上級收'
          : '依規則介入';
      const bite =
        control.targetBitePercentage && control.targetLossAmount
          ? `，目標咬度 ${control.targetBitePercentage.toFixed(2)}%，目標 ${control.targetLossAmount.toFixed(2)}`
          : '';
      return {
        source: 'win_loss_control',
        sourceLabel: '輸贏控制',
        scopeLabel,
        targetLabel,
        operatorUsername: control.operatorUsername,
        detail: `${scopeLabel}${targetLabel ? ` ${targetLabel}` : ''}，控制率 ${control.controlPercentage.toFixed(2)}%，${direction}${bite}`,
      };
    }
  }

  if (reasonSource === 'online_reward_next_win' || reasonSource === 'deposit_control') {
    const control = maps.deposit.get(log.controlId);
    if (control) {
      const isOnlineReward = reasonSource === 'online_reward_next_win';
      return {
        source: reasonSource,
        sourceLabel: isOnlineReward ? '在線均分必贏' : '入金控制',
        scopeLabel: '會員',
        targetLabel: control.memberUsername,
        operatorUsername: control.operatorUsername,
        detail: isOnlineReward
          ? `最近活躍玩家均分，設定 ${control.memberUsername} 下一局直接贏，目標淨贏 ${control.targetProfit.toFixed(2)}`
          : `會員 ${control.memberUsername} 入金控制，目標盈利 ${control.targetProfit.toFixed(2)}，介入率 ${formatLogRate(control.controlWinRate)}`,
      };
    }
  }

  if (reasonSource === 'auto_balance') {
    const control = maps.autoBalance.get(log.controlId);
    if (control) {
      return {
        source: 'auto_balance',
        sourceLabel: '自動模型',
        scopeLabel: '會員',
        targetLabel: control.memberUsername,
        operatorUsername: control.operatorUsername,
        detail: `會員 ${control.memberUsername}，基準 ${control.baselineBalance.toFixed(2)}，咬到 ${control.biteTargetBalance.toFixed(2)}，回到 ${control.reviveTargetBalance.toFixed(2)}，階段 ${formatAutoBalancePhase(control.phase)}`,
      };
    }
  }

  if (reasonSource === 'manual_detection') {
    const control = maps.manual.get(log.controlId);
    if (control) {
      const scopeLabel = formatManualLogScope(control.scope);
      const targetLabel = formatManualLogTarget(control);
      const bite = control.bitePercentage ? `，咬度 ${control.bitePercentage.toFixed(2)}%` : '';
      return {
        source: 'manual_detection',
        sourceLabel: '手動偵測',
        scopeLabel,
        targetLabel,
        operatorUsername: control.operatorUsername,
        detail: `${scopeLabel}${targetLabel ? ` ${targetLabel}` : ''}，目標交收 ${control.targetSettlement.toFixed(2)}，控制率 ${control.controlPercentage}%${bite}`,
      };
    }
  }

  if (reasonSource === 'burst_control') {
    const control = maps.burst.get(log.controlId);
    if (control) {
      const scopeLabel = formatManualLogScope(control.scope);
      const targetLabel = formatManualLogTarget(control);
      return {
        source: 'burst_control',
        sourceLabel: '爆分控制',
        scopeLabel,
        targetLabel,
        operatorUsername: control.operatorUsername,
        detail: `${scopeLabel}${targetLabel ? ` ${targetLabel}` : ''}，每日池 ${control.dailyBudget.toFixed(2)}，會員上限 ${control.memberDailyCap.toFixed(2)}，單局上限 ${control.singlePayoutCap.toFixed(2)}`,
      };
    }
  }

  if (reasonSource === 'member_win_cap') {
    const control = maps.memberWinCap.get(log.controlId);
    if (control) {
      return {
        source: 'member_win_cap',
        sourceLabel: '會員封頂',
        scopeLabel: '會員',
        targetLabel: control.memberUsername,
        operatorUsername: control.operatorUsername,
        detail: `會員 ${control.memberUsername} 日贏封頂 ${control.winCapAmount.toFixed(2)}，觸發後控制勝率 ${formatLogRate(control.controlWinRate)}`,
      };
    }
  }

  if (reasonSource === 'agent_line_cap') {
    const control = maps.agentLineCap.get(log.controlId);
    if (control) {
      return {
        source: 'agent_line_cap',
        sourceLabel: '代理線封頂',
        scopeLabel: '代理線',
        targetLabel: control.agentUsername,
        operatorUsername: control.operatorUsername,
        detail: `代理線 ${control.agentUsername} 日贏封頂 ${control.dailyCap.toFixed(2)}，觸發後控制勝率 ${formatLogRate(control.controlWinRate)}`,
      };
    }
  }

  if (reasonSource === 'global_member_daily_win_cap') {
    return {
      source: 'global_member_daily_win_cap',
      sourceLabel: '全局日贏封頂',
      scopeLabel: '全局',
      targetLabel: null,
      operatorUsername: null,
      detail: '會員當日淨贏到達全局上限，後端直接壓輸避免超額。',
    };
  }

  return {
    source: reasonSource,
    sourceLabel: resolveControlLogSourceLabel(reasonSource),
    scopeLabel: '歷史規則',
    targetLabel: null,
    operatorUsername: null,
    detail: '這筆紀錄已套用控制，但原控制規則可能已刪除或為舊資料。',
  };
}

function resolveControlLogSource(reason: string): ControlLogSource {
  if (reason === 'online_reward_next_win') return 'online_reward_next_win';
  if (reason === 'deposit_control') return 'deposit_control';
  if (reason.startsWith('auto_balance_')) return 'auto_balance';
  if (reason === 'manual_detection' || reason === 'manual_detection_release') {
    return 'manual_detection';
  }
  if (reason.startsWith('burst_')) return 'burst_control';
  if (reason === 'win_cap' || reason === 'win_cap_rate') return 'member_win_cap';
  if (reason === 'agent_line_cap' || reason === 'agent_line_cap_rate') return 'agent_line_cap';
  if (reason === 'global_member_daily_win_cap') return 'global_member_daily_win_cap';
  if (reason === 'global_accidental_burst_cap') return 'global_accidental_burst_cap';
  if (reason === 'win_control' || reason === 'loss_control' || reason === 'loss_control_release') {
    return 'win_loss_control';
  }
  return 'unknown';
}

function resolveControlLogSourceLabel(source: ControlLogSource): string {
  const labels: Record<ControlLogSource, string> = {
    win_loss_control: '輸贏控制',
    online_reward_next_win: '在線均分必贏',
    deposit_control: '入金控制',
    auto_balance: '自動模型',
    manual_detection: '手動偵測',
    burst_control: '爆分控制',
    member_win_cap: '會員封頂',
    agent_line_cap: '代理線封頂',
    global_member_daily_win_cap: '全局日贏封頂',
    global_accidental_burst_cap: '意外爆分上限',
    unknown: '未知控制',
  };
  return labels[source];
}

function formatAutoBalancePhase(phase: string): string {
  if (phase === 'BITE_TO_30') return '咬到20%';
  if (phase === 'REVIVE_TO_70') return '回到40%';
  if (phase === 'DRAIN_TO_ZERO') return '回40後控輸';
  return phase;
}

function resolveControlLogActionLabel(log: ControlLogRecord): string {
  const finalWon = jsonBoolean(log.finalResult, 'won');
  const finalDirection = finalWon === true ? '控贏' : finalWon === false ? '控輸' : '已介入';
  const manualDetectionAction = resolveManualDetectionActionLabel(log);
  const labels: Record<string, string> = {
    online_reward_next_win: '下一局直接贏',
    deposit_control: `入金${finalDirection}`,
    auto_balance_bite: '自動咬到20%',
    auto_balance_revive: '自動回到40%',
    auto_balance_drain: '自動回40後控輸',
    auto_balance_release: '自動補贏',
    win_control: '放會員贏',
    loss_control: '咬會員輸',
    loss_control_release: '殺分補贏',
    manual_detection: manualDetectionAction,
    manual_detection_release: '手動補贏',
    burst_win: '爆分贏',
    burst_small_win: '小贏補償',
    burst_loss: '娛樂壓輸',
    burst_risk_cap: '高倍壓低',
    burst_risk_guard: '風險防守壓輸',
    burst_budget_guard: '爆分池防守壓輸',
    win_cap: '封頂壓輸',
    win_cap_rate: `封頂比例${finalDirection}`,
    agent_line_cap: '代理線封頂壓輸',
    agent_line_cap_rate: `代理線比例${finalDirection}`,
    global_member_daily_win_cap: '全局封頂壓輸',
    global_accidental_burst_cap: '意外爆分壓低',
  };
  return labels[log.flipReason] ?? finalDirection;
}

function resolveManualDetectionActionLabel(log: ControlLogRecord): string {
  const finalWon = jsonBoolean(log.finalResult, 'won');
  if (finalWon === false) return '手動壓輸';

  const originalPayout = jsonDecimalNumber(log.originalResult, 'payout');
  const finalPayout = jsonDecimalNumber(log.finalResult, 'payout');
  if (originalPayout !== null && finalPayout !== null && finalPayout < originalPayout) {
    return '手動壓低';
  }

  if (finalWon === true) return '手動拉贏';
  return '手動介入';
}

function resolveControlLogDirectionLabel(log: ControlLogRecord): string {
  const originalWon = jsonBoolean(log.originalResult, 'won');
  const finalWon = jsonBoolean(log.finalResult, 'won');
  const from = originalWon === true ? '原本贏' : originalWon === false ? '原本輸' : '原結果';
  const to = finalWon === true ? '控制後贏' : finalWon === false ? '控制後輸' : '控制後結果';
  return `${from} → ${to}`;
}

function formatWinLossLogScope(mode: string): string {
  if (mode === 'SINGLE_MEMBER') return '會員';
  if (mode === 'AGENT_LINE') return '代理線';
  if (mode === 'NORMAL') return '全局';
  if (mode === 'AUTO_DETECT') return '自動偵測';
  return mode;
}

function formatManualLogScope(scope: ManualDetectionScope): string {
  if (scope === ManualDetectionScope.ALL) return '全盤';
  if (scope === ManualDetectionScope.AGENT_LINE) return '代理線';
  return '會員';
}

function formatManualLogTarget(control: {
  scope: ManualDetectionScope;
  targetAgentUsername: string | null;
  targetMemberUsername: string | null;
}): string | null {
  if (control.scope === ManualDetectionScope.ALL) return null;
  if (control.scope === ManualDetectionScope.AGENT_LINE) return control.targetAgentUsername;
  return control.targetMemberUsername;
}

function formatTargetForLog(scopeLabel: string, targetUsername: string | null): string | null {
  if (targetUsername) return targetUsername;
  if (scopeLabel === '全局' || scopeLabel === '自動偵測') return null;
  return '未指定';
}

function formatLogRate(value: Prisma.Decimal): string {
  const raw = Number(value);
  const percent = raw > 1 ? raw : raw * 100;
  return `${percent.toFixed(1)}%`;
}

function jsonBoolean(value: Prisma.JsonValue, key: string): boolean | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = (value as Record<string, unknown>)[key];
  return typeof item === 'boolean' ? item : null;
}

function jsonDecimalNumber(value: Prisma.JsonValue, key: string): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = (value as Record<string, unknown>)[key];
  const parsed =
    typeof item === 'number' ? item : typeof item === 'string' ? Number.parseFloat(item) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 控制表 CRUD。整個模組僅限 Super Admin —— 任何代理皆無法檢視或操作控制。
 * 所有 mutation 都寫 AuditLog。
 */
export async function controlRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', async (req, reply) => {
    await fastify.authenticateAdmin(req, reply);
    await fastify.requireSuperAdmin(req, reply);
  });

  const auditActor = (req: { admin: { id: string; username: string } }) => ({
    id: req.admin.id,
    type: 'super_admin' as const,
    username: req.admin.username,
  });

  function resolveWinLossTarget(body: WinLossControlInput): {
    targetType: string | null;
    targetId: string | null;
    targetUsername: string | null;
  } {
    const targetType =
      body.targetType ??
      (body.controlMode === 'SINGLE_MEMBER'
        ? 'member'
        : body.controlMode === 'AGENT_LINE'
          ? 'agent'
          : null);

    return {
      targetType,
      targetId: body.targetId ?? null,
      targetUsername: body.targetUsername ?? null,
    };
  }

  fastify.get('/logs', async () => {
    const logs = await fastify.prisma.winLossControlLogs.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const userIds = Array.from(new Set(logs.map((log) => log.userId)));
    const users = await fastify.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });
    const usernames = new Map(users.map((user) => [user.id, user.username]));
    return { items: await enrichControlLogs(fastify, logs, usernames) };
  });

  fastify.get('/win-loss', async () => {
    const items = await fastify.prisma.winLossControl.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { items };
  });

  fastify.post('/win-loss', async (req, reply) => {
    const body = winLossControlSchema.parse(req.body);
    const target = resolveWinLossTarget(body);
    const targetBitePercentage =
      body.lossControl && body.targetBitePercentage
        ? decimal(body.targetBitePercentage).toDecimalPlaces(2)
        : null;
    let startBalanceAmount: Prisma.Decimal | null = null;
    let targetLossAmount: Prisma.Decimal | null = null;
    if (targetBitePercentage && targetBitePercentage.greaterThan(0)) {
      const scope =
        body.controlMode === 'SINGLE_MEMBER'
          ? ManualDetectionScope.MEMBER
          : body.controlMode === 'AGENT_LINE'
            ? ManualDetectionScope.AGENT_LINE
            : ManualDetectionScope.ALL;
      startBalanceAmount = await calculateControlCapital(
        fastify.prisma,
        scope,
        body.controlMode === 'AGENT_LINE' ? target.targetId : null,
        body.controlMode === 'SINGLE_MEMBER' ? target.targetUsername : null,
      );
      targetLossAmount = startBalanceAmount.mul(targetBitePercentage).div(100).toDecimalPlaces(2);
    }
    const created = await fastify.prisma.winLossControl.create({
      data: {
        controlMode: body.controlMode,
        targetType: target.targetType,
        targetId: target.targetId,
        targetUsername: target.targetUsername,
        controlPercentage: new Prisma.Decimal(body.controlPercentage),
        targetBitePercentage,
        startBalanceAmount,
        targetLossAmount,
        currentLossAmount: new Prisma.Decimal(0),
        winControl: body.winControl,
        lossControl: body.lossControl,
        isActive: true,
        isCompleted: false,
        completedAt: null,
        startPeriod: body.startPeriod ?? null,
        operatorId: req.admin.id,
        operatorUsername: req.admin.username,
      },
    });
    await writeAudit(fastify.prisma, {
      actor: auditActor(req),
      action: 'control.win_loss.create',
      targetType: 'control',
      targetId: created.id,
      newValues: {
        controlMode: created.controlMode,
        targetId: created.targetId,
        targetBitePercentage: created.targetBitePercentage?.toFixed(2) ?? null,
        targetLossAmount: created.targetLossAmount?.toFixed(2) ?? null,
      },
      req,
    });
    reply.code(201).send(created);
  });

  fastify.patch('/win-loss/:id/toggle', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { isActive } = toggleSchema.parse(req.body);
    const updated = await fastify.prisma.winLossControl.update({
      where: { id },
      data: { isActive },
    });
    await writeAudit(fastify.prisma, {
      actor: auditActor(req),
      action: 'control.win_loss.toggle',
      targetType: 'control',
      targetId: id,
      newValues: { isActive },
      req,
    });
    return updated;
  });

  fastify.delete('/win-loss/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await fastify.prisma.winLossControl.delete({ where: { id } });
    await writeAudit(fastify.prisma, {
      actor: auditActor(req),
      action: 'control.win_loss.delete',
      targetType: 'control',
      targetId: id,
      req,
    });
    reply.code(204).send();
  });

  fastify.get(
    '/win-cap',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async () => {
      const items = await fastify.prisma.memberWinCapControl.findMany({
        orderBy: { createdAt: 'desc' },
      });
      const normalized = await Promise.all(
        items.map((item) => normalizeMemberWinCapDay(fastify.prisma, item)),
      );
      return {
        items: normalized.map((item) => ({
          ...item,
          isCapped: item.todayWinAmount.greaterThanOrEqualTo(item.winCapAmount),
        })),
      };
    },
  );

  fastify.post(
    '/win-cap',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const body = winCapControlSchema.parse(req.body);
      const member = await fastify.prisma.user.findUnique({ where: { id: body.memberId } });
      if (!member?.agentId) {
        reply.code(400).send({ code: 'INVALID_ACTION', message: 'Member has no agent' });
        return;
      }
      const created = await fastify.prisma.memberWinCapControl.upsert({
        where: { memberUsername: body.memberUsername },
        create: {
          memberId: body.memberId,
          memberUsername: body.memberUsername,
          agentId: member.agentId,
          winCapAmount: new Prisma.Decimal(body.winCapAmount),
          controlWinRate: new Prisma.Decimal(body.controlWinRate),
          triggerThreshold: new Prisma.Decimal(body.triggerThreshold),
          currentGameDay: getControlGameDay(),
          notes: body.notes ?? null,
          operatorUsername: req.admin.username,
        },
        update: {
          winCapAmount: new Prisma.Decimal(body.winCapAmount),
          controlWinRate: new Prisma.Decimal(body.controlWinRate),
          triggerThreshold: new Prisma.Decimal(body.triggerThreshold),
          notes: body.notes ?? null,
          operatorUsername: req.admin.username,
          isActive: true,
        },
      });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.win_cap.upsert',
        targetType: 'control',
        targetId: created.id,
        newValues: { memberUsername: body.memberUsername, winCapAmount: body.winCapAmount },
        req,
      });
      reply.code(201).send(created);
    },
  );

  fastify.patch(
    '/win-cap/:id/toggle',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req) => {
      const { id } = req.params as { id: string };
      const { isActive } = toggleSchema.parse(req.body);
      const updated = await fastify.prisma.memberWinCapControl.update({
        where: { id },
        data: { isActive },
      });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.win_cap.toggle',
        targetType: 'control',
        targetId: id,
        newValues: { isActive },
        req,
      });
      return updated;
    },
  );

  fastify.delete(
    '/win-cap/:id',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await fastify.prisma.memberWinCapControl.delete({ where: { id } });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.win_cap.delete',
        targetType: 'control',
        targetId: id,
        req,
      });
      reply.code(204).send();
    },
  );

  fastify.get(
    '/deposit',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async () => {
      const items = await fastify.prisma.memberDepositControl.findMany({
        orderBy: { createdAt: 'desc' },
      });
      const members = await fastify.prisma.user.findMany({
        where: { id: { in: Array.from(new Set(items.map((item) => item.memberId))) } },
        select: { id: true, balance: true },
      });
      const balanceByMemberId = new Map(members.map((member) => [member.id, member.balance]));
      return {
        items: items.map((item) => {
          const currentBalance = balanceByMemberId.get(item.memberId) ?? item.startBalance;
          const currentProfit = currentBalance.sub(item.startBalance);
          const progressPercent = item.targetProfit.greaterThan(0)
            ? Math.max(0, Math.min(100, currentProfit.div(item.targetProfit).mul(100).toNumber()))
            : 0;
          return {
            ...item,
            depositAmount: item.depositAmount.toFixed(2),
            targetProfit: item.targetProfit.toFixed(2),
            targetBalance: item.startBalance.add(item.targetProfit).toFixed(2),
            startBalance: item.startBalance.toFixed(2),
            currentBalance: currentBalance.toFixed(2),
            currentProfit: currentProfit.toFixed(2),
            progressPercent: progressPercent.toFixed(2),
            controlWinRate: item.controlWinRate.toFixed(4),
            isTargetReached: currentProfit.greaterThanOrEqualTo(item.targetProfit),
          };
        }),
      };
    },
  );

  fastify.post(
    '/deposit',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const body = depositControlSchema.parse(req.body);
      const member = await fastify.prisma.user.findUnique({ where: { id: body.memberId } });
      if (!member?.agentId) {
        reply.code(400).send({ code: 'INVALID_ACTION', message: 'Member has no agent' });
        return;
      }
      const created = await fastify.prisma.memberDepositControl.create({
        data: {
          memberId: body.memberId,
          memberUsername: body.memberUsername,
          agentId: member.agentId,
          depositAmount: new Prisma.Decimal(body.depositAmount),
          targetProfit: new Prisma.Decimal(body.targetProfit),
          startBalance: new Prisma.Decimal(body.startBalance),
          controlWinRate: new Prisma.Decimal(body.controlWinRate),
          notes: body.notes ?? null,
          operatorUsername: req.admin.username,
        },
      });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.deposit.create',
        targetType: 'control',
        targetId: created.id,
        newValues: body,
        req,
      });
      reply.code(201).send(created);
    },
  );

  fastify.patch(
    '/deposit/:id/toggle',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req) => {
      const { id } = req.params as { id: string };
      const { isActive } = toggleSchema.parse(req.body);
      const updated = await fastify.prisma.memberDepositControl.update({
        where: { id },
        data: { isActive },
      });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.deposit.toggle',
        targetType: 'control',
        targetId: id,
        newValues: { isActive },
        req,
      });
      return updated;
    },
  );

  fastify.delete(
    '/deposit/:id',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await fastify.prisma.memberDepositControl.delete({ where: { id } });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.deposit.delete',
        targetType: 'control',
        targetId: id,
        req,
      });
      reply.code(204).send();
    },
  );

  fastify.get(
    '/agent-line',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async () => {
      const items = await fastify.prisma.agentLineWinCap.findMany({
        orderBy: { createdAt: 'desc' },
      });
      const normalized = await Promise.all(
        items.map((item) => normalizeAgentLineCapDay(fastify.prisma, item)),
      );
      return {
        items: normalized.map((item) => ({
          ...item,
          isCapped: item.todayWinAmount.greaterThanOrEqualTo(item.dailyCap),
        })),
      };
    },
  );

  fastify.post(
    '/agent-line',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const body = agentLineControlSchema.parse(req.body);
      const created = await fastify.prisma.agentLineWinCap.upsert({
        where: { agentId: body.agentId },
        create: {
          agentId: body.agentId,
          agentUsername: body.agentUsername,
          dailyCap: new Prisma.Decimal(body.dailyCap),
          controlWinRate: new Prisma.Decimal(body.controlWinRate),
          triggerThreshold: new Prisma.Decimal(body.triggerThreshold),
          currentGameDay: getControlGameDay(),
          notes: body.notes ?? null,
          operatorUsername: req.admin.username,
        },
        update: {
          dailyCap: new Prisma.Decimal(body.dailyCap),
          controlWinRate: new Prisma.Decimal(body.controlWinRate),
          triggerThreshold: new Prisma.Decimal(body.triggerThreshold),
          notes: body.notes ?? null,
          operatorUsername: req.admin.username,
          isActive: true,
        },
      });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.agent_line.upsert',
        targetType: 'control',
        targetId: created.id,
        newValues: body,
        req,
      });
      reply.code(201).send(created);
    },
  );

  fastify.patch(
    '/agent-line/:id/toggle',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req) => {
      const { id } = req.params as { id: string };
      const { isActive } = toggleSchema.parse(req.body);
      const updated = await fastify.prisma.agentLineWinCap.update({
        where: { id },
        data: { isActive },
      });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.agent_line.toggle',
        targetType: 'control',
        targetId: id,
        newValues: { isActive },
        req,
      });
      return updated;
    },
  );

  fastify.delete(
    '/agent-line/:id',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await fastify.prisma.agentLineWinCap.delete({ where: { id } });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.agent_line.delete',
        targetType: 'control',
        targetId: id,
        req,
      });
      reply.code(204).send();
    },
  );

  fastify.get(
    '/burst',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async () => {
      const items = await fastify.prisma.burstControl.findMany({ orderBy: { createdAt: 'desc' } });
      const normalized = await Promise.all(
        items.map((item) => normalizeBurstControlDay(fastify.prisma, item)),
      );
      return {
        items: normalized.map((item) => ({
          ...item,
          isBudgetSpent: item.todayBurstAmount.greaterThanOrEqualTo(item.dailyBudget),
        })),
      };
    },
  );

  fastify.post(
    '/burst',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const body = burstControlSchema.parse(req.body);
      if (body.scope !== 'MEMBER') {
        reply
          .code(400)
          .send({ code: 'INVALID_BURST_SCOPE', message: 'Burst control requires a member target' });
        return;
      }

      let targetMemberId = body.targetMemberId ?? null;
      let targetMemberUsername = body.targetMemberUsername ?? null;

      const member = targetMemberId
        ? await fastify.prisma.user.findUnique({
            where: { id: targetMemberId },
            select: { id: true, username: true },
          })
        : await fastify.prisma.user.findUnique({
            where: { username: targetMemberUsername ?? undefined },
            select: { id: true, username: true },
          });
      if (!member) {
        reply.code(404).send({ code: 'MEMBER_NOT_FOUND', message: 'Member not found' });
        return;
      }
      targetMemberId = member.id;
      targetMemberUsername = member.username;

      const existing = await fastify.prisma.burstControl.findFirst({
        where: { scope: 'MEMBER', targetMemberUsername, isActive: true },
        orderBy: { createdAt: 'desc' },
      });

      const dailyBudget = decimal(body.dailyBudget).toDecimalPlaces(2);
      const memberDailyCap = decimal(body.memberDailyCap).toDecimalPlaces(2);
      const minBurstProfit = decimal(
        body.minBurstProfit ?? body.minBurstMultiplier ?? '200',
      ).toDecimalPlaces(2);
      const maxBurstProfit = decimal(
        body.maxBurstProfit ?? body.singlePayoutCap ?? '3000',
      ).toDecimalPlaces(2);
      const riskWinLimit = decimal(body.riskWinLimit ?? body.memberDailyCap).toDecimalPlaces(2);

      const data = {
        scope: body.scope as ManualDetectionScope,
        targetAgentId: null,
        targetAgentUsername: null,
        targetMemberId,
        targetMemberUsername,
        gameIds: normalizeGameIds(body.gameIds),
        dailyBudget,
        memberDailyCap,
        singlePayoutCap: maxBurstProfit,
        singleMultiplierCap: decimal(body.singleMultiplierCap).toDecimalPlaces(4),
        minBurstMultiplier: minBurstProfit.toDecimalPlaces(4),
        smallWinMultiplier: decimal(body.smallWinMultiplier).toDecimalPlaces(4),
        burstRate: normalizeRate(body.burstRate).toDecimalPlaces(4),
        smallWinRate: normalizeRate(body.smallWinRate).toDecimalPlaces(4),
        lossRate: normalizeRate(body.lossRate).toDecimalPlaces(4),
        compensationLoss: decimal(body.compensationLoss).toDecimalPlaces(2),
        capitalRetentionRatio: normalizeRate(body.capitalRetentionRatio).toDecimalPlaces(4),
        minEligibilityLoss: decimal(body.minEligibilityLoss).toDecimalPlaces(2),
        riskWinLimit,
        cooldownRounds: body.cooldownRounds,
        currentGameDay: getControlGameDay(),
        notes: body.notes ?? null,
        operatorId: req.admin.id,
        operatorUsername: req.admin.username,
        isActive: true,
      };

      const record = existing
        ? await fastify.prisma.burstControl.update({
            where: { id: existing.id },
            data,
          })
        : await fastify.prisma.burstControl.create({ data });

      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: existing ? 'control.burst.update' : 'control.burst.create',
        targetType: 'control',
        targetId: record.id,
        newValues: {
          scope: record.scope,
          targetAgentId: record.targetAgentId,
          targetMemberUsername: record.targetMemberUsername,
          gameIds: record.gameIds,
          dailyBudget: record.dailyBudget.toFixed(2),
          singlePayoutCap: record.singlePayoutCap.toFixed(2),
          capitalRetentionRatio: record.capitalRetentionRatio.toFixed(4),
          minEligibilityLoss: record.minEligibilityLoss.toFixed(2),
        },
        req,
      });
      reply.code(existing ? 200 : 201).send(record);
    },
  );

  fastify.patch(
    '/burst/:id/toggle',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req) => {
      const { id } = req.params as { id: string };
      const { isActive } = toggleSchema.parse(req.body);
      const updated = await fastify.prisma.burstControl.update({
        where: { id },
        data: { isActive },
      });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.burst.toggle',
        targetType: 'control',
        targetId: id,
        newValues: { isActive },
        req,
      });
      return updated;
    },
  );

  fastify.delete(
    '/burst/:id',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await fastify.prisma.burstControl.delete({ where: { id } });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.burst.delete',
        targetType: 'control',
        targetId: id,
        req,
      });
      reply.code(204).send();
    },
  );

  fastify.get(
    '/manual-detection/status',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async () => {
      await checkAndCompleteManualDetectionControls(fastify.prisma);
      const items = await getAllActiveManualDetectionControls(fastify.prisma);
      const serialized = await Promise.all(
        items.map((item) => serializeManualControl(fastify, item)),
      );
      return {
        items: serialized,
        activeControls: serialized,
        isActive: serialized.length > 0,
        totalActive: serialized.length,
      };
    },
  );

  fastify.get(
    '/manual-detection/history',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async () => {
      const items = await fastify.prisma.manualDetectionControl.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      const serialized = await Promise.all(
        items.map((item) => serializeManualControl(fastify, item)),
      );
      return { items: serialized, total: serialized.length };
    },
  );

  fastify.get(
    '/manual-detection/settlement',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req) => {
      const query = manualDetectionQuerySchema.parse(req.query);
      const settlement = await calculateCurrentSettlement(
        fastify.prisma,
        query.scope as ManualDetectionScope,
        query.agentId,
        query.memberUsername,
      );
      return serializeSettlement(settlement);
    },
  );

  fastify.get(
    '/manual-detection/bite-preview',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req) => {
      const query = manualDetectionBitePreviewQuerySchema.parse(req.query);
      const plan = await calculateAutoDetectionBitePlan(fastify.prisma, {
        scope: query.scope as ManualDetectionScope,
        targetAgentId: query.agentId,
        targetMemberUsername: query.memberUsername,
        bitePercentage: query.bitePercentage,
        houseTakePercentage: query.houseTakePercentage,
      });
      return serializeBitePlan(plan);
    },
  );

  fastify.post(
    '/manual-detection/activate',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const body = manualDetectionControlSchema.parse(req.body);

      let targetAgentId = body.targetAgentId ?? null;
      let targetAgentUsername = body.targetAgentUsername ?? null;
      let targetMemberId = body.targetMemberId ?? null;
      let targetMemberUsername = body.targetMemberUsername ?? null;

      if (body.scope === 'AGENT_LINE') {
        const agent = await fastify.prisma.agent.findUnique({
          where: { id: targetAgentId ?? undefined },
          select: { id: true, username: true },
        });
        if (!agent) {
          reply.code(404).send({ code: 'AGENT_NOT_FOUND', message: 'Agent not found' });
          return;
        }
        targetAgentId = agent.id;
        targetAgentUsername = agent.username;
      }

      if (body.scope === 'MEMBER') {
        const member = targetMemberId
          ? await fastify.prisma.user.findUnique({
              where: { id: targetMemberId },
              select: { id: true, username: true },
            })
          : await fastify.prisma.user.findUnique({
              where: { username: targetMemberUsername ?? undefined },
              select: { id: true, username: true },
            });
        if (!member) {
          reply.code(404).send({ code: 'MEMBER_NOT_FOUND', message: 'Member not found' });
          return;
        }
        targetMemberId = member.id;
        targetMemberUsername = member.username;
      }

      const settlement = await calculateCurrentSettlement(
        fastify.prisma,
        body.scope as ManualDetectionScope,
        targetAgentId,
        targetMemberUsername,
      );
      const bitePlan = body.bitePercentage
        ? await calculateAutoDetectionBitePlan(fastify.prisma, {
            scope: body.scope as ManualDetectionScope,
            targetAgentId,
            targetMemberUsername,
            bitePercentage: body.bitePercentage,
            houseTakePercentage: body.houseTakePercentage,
            currentSettlement: settlement.superiorSettlement,
          })
        : null;

      const existing = await fastify.prisma.manualDetectionControl.findFirst({
        where:
          body.scope === 'ALL'
            ? { scope: 'ALL', isActive: true }
            : body.scope === 'AGENT_LINE'
              ? { scope: 'AGENT_LINE', targetAgentId, isActive: true }
              : { scope: 'MEMBER', targetMemberUsername, isActive: true },
        orderBy: { createdAt: 'desc' },
      });

      const targetSettlement = (
        bitePlan?.targetSettlement ?? decimal(body.targetSettlement)
      ).toDecimalPlaces(2);
      const completionBehavior = normalizeManualDetectionCompletionBehavior(
        body.scope as ManualDetectionScope,
        body.bitePercentage,
        body.completionBehavior,
      );
      const targetBand = calculateDefaultManualTargetBand(
        body.scope as ManualDetectionScope,
        targetSettlement,
        completionBehavior,
      );

      const data = {
        scope: body.scope as ManualDetectionScope,
        targetAgentId,
        targetAgentUsername,
        targetMemberId,
        targetMemberUsername,
        targetSettlement,
        controlPercentage: body.controlPercentage,
        bitePercentage: body.bitePercentage
          ? decimal(body.bitePercentage).toDecimalPlaces(2)
          : null,
        houseTakePercentage: decimal(body.houseTakePercentage).toDecimalPlaces(2),
        completionBehavior,
        targetBand,
        cycleCount: 0,
        lastCycleSettlement: null,
        lastCycleAt: null,
        lastCapitalAmount: bitePlan?.capitalAmount.toDecimalPlaces(2) ?? null,
        lastPlatformTake: bitePlan?.platformTake.toDecimalPlaces(2) ?? null,
        lastRedistributionAmount: bitePlan?.redistributionAmount.toDecimalPlaces(2) ?? null,
        startSettlement: settlement.superiorSettlement.toDecimalPlaces(2),
        isActive: true,
        isCompleted: false,
        completedAt: null,
        completionSettlement: null,
        operatorId: req.admin.id,
        operatorUsername: req.admin.username,
      };

      const record = existing
        ? await fastify.prisma.manualDetectionControl.update({
            where: { id: existing.id },
            data,
          })
        : await fastify.prisma.manualDetectionControl.create({ data });

      await writeAudit(fastify.prisma, {
        actor: auditActor(req),
        action: existing ? 'control.manual_detection.update' : 'control.manual_detection.create',
        targetType: 'control',
        targetId: record.id,
        newValues: {
          scope: record.scope,
          targetAgentId: record.targetAgentId,
          targetMemberUsername: record.targetMemberUsername,
          targetSettlement: record.targetSettlement.toFixed(2),
          controlPercentage: record.controlPercentage,
          bitePercentage: record.bitePercentage?.toFixed(2) ?? null,
          houseTakePercentage: record.houseTakePercentage.toFixed(2),
          completionBehavior: record.completionBehavior,
          targetBand: record.targetBand.toFixed(2),
          startSettlement: record.startSettlement?.toFixed(2) ?? null,
        },
        req,
      });

      reply.code(existing ? 200 : 201).send(await serializeManualControl(fastify, record));
    },
  );

  fastify.post(
    '/manual-detection/deactivate',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req) => {
      const { id } = deactivateManualDetectionSchema.parse(req.body);
      if (id) {
        const updated = await fastify.prisma.manualDetectionControl.update({
          where: { id },
          data: { isActive: false },
        });
        await writeAudit(fastify.prisma, {
          actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
          action: 'control.manual_detection.deactivate',
          targetType: 'control',
          targetId: id,
          req,
        });
        return updated;
      }

      await fastify.prisma.manualDetectionControl.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.manual_detection.deactivate_all',
        targetType: 'control',
        req,
      });
      return { success: true };
    },
  );

  fastify.post(
    '/manual-detection/:id/reactivate',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const record = await fastify.prisma.manualDetectionControl.findUnique({ where: { id } });
      if (!record) {
        reply.code(404).send({ code: 'CONTROL_NOT_FOUND', message: 'Control not found' });
        return;
      }

      const conflict = await fastify.prisma.manualDetectionControl.findFirst({
        where:
          record.scope === 'ALL'
            ? { id: { not: id }, scope: 'ALL', isActive: true }
            : record.scope === 'AGENT_LINE'
              ? {
                  id: { not: id },
                  scope: 'AGENT_LINE',
                  targetAgentId: record.targetAgentId,
                  isActive: true,
                }
              : {
                  id: { not: id },
                  scope: 'MEMBER',
                  targetMemberUsername: record.targetMemberUsername,
                  isActive: true,
                },
      });
      if (conflict) {
        reply
          .code(400)
          .send({ code: 'CONTROL_CONFLICT', message: 'Same-scope control is already active' });
        return;
      }

      const updated = await fastify.prisma.manualDetectionControl.update({
        where: { id },
        data: {
          isActive: true,
          isCompleted: false,
          completedAt: null,
          completionSettlement: null,
        },
      });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.manual_detection.reactivate',
        targetType: 'control',
        targetId: id,
        req,
      });
      return serializeManualControl(fastify, updated);
    },
  );

  fastify.delete(
    '/manual-detection/:id',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await fastify.prisma.manualDetectionControl.delete({ where: { id } });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.manual_detection.delete',
        targetType: 'control',
        targetId: id,
        req,
      });
      reply.code(204).send();
    },
  );

  fastify.post(
    '/reward/online',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const body = onlineRewardSchema.parse(req.body);
      const totalAmount = decimal(body.totalAmount).toDecimalPlaces(2);
      const since = new Date(Date.now() - body.recentMinutes * 60_000);
      let scopedAgentIds: string[] | null = null;
      let targetMemberId: string | null = null;
      let targetUsername: string | null = null;

      if (body.scope === 'AGENT_LINE') {
        const agent = body.targetAgentId
          ? await fastify.prisma.agent.findUnique({
              where: { id: body.targetAgentId },
              select: { id: true, username: true, role: true, status: true },
            })
          : body.targetAgentUsername
            ? await fastify.prisma.agent.findUnique({
                where: { username: body.targetAgentUsername },
                select: { id: true, username: true, role: true, status: true },
              })
            : null;
        if (!agent || agent.role === 'SUB_ACCOUNT' || agent.status === 'DELETED') {
          reply.code(404).send({ code: 'AGENT_NOT_FOUND', message: 'Agent not found' });
          return;
        }
        scopedAgentIds = await listAgentDescendants(fastify.prisma, agent.id);
        targetUsername = agent.username;
      }

      if (body.scope === 'MEMBER') {
        const member = body.targetMemberId
          ? await fastify.prisma.user.findUnique({
              where: { id: body.targetMemberId },
              select: { id: true, username: true, role: true, disabledAt: true },
            })
          : body.targetMemberUsername
            ? await fastify.prisma.user.findUnique({
                where: { username: body.targetMemberUsername },
                select: { id: true, username: true, role: true, disabledAt: true },
              })
            : null;
        if (!member || member.role !== 'PLAYER' || member.disabledAt) {
          reply.code(404).send({ code: 'MEMBER_NOT_FOUND', message: 'Member not found' });
          return;
        }
        targetMemberId = member.id;
        targetUsername = member.username;
      }

      const [betUsers, crashUsers] = await Promise.all([
        fastify.prisma.bet.findMany({
          where: { createdAt: { gte: since }, status: 'SETTLED' },
          select: { userId: true },
          distinct: ['userId'],
        }),
        fastify.prisma.crashBet.findMany({
          where: { createdAt: { gte: since } },
          select: { userId: true },
          distinct: ['userId'],
        }),
      ]);
      const userIds = Array.from(
        new Set([...betUsers.map((row) => row.userId), ...crashUsers.map((row) => row.userId)]),
      );

      if (userIds.length === 0) {
        reply
          .code(400)
          .send({ code: 'NO_ACTIVE_MEMBERS', message: 'No active members in this window' });
        return;
      }

      const result = await fastify.prisma.$transaction(async (tx) => {
        const memberFilters: Prisma.UserWhereInput[] = [{ id: { in: userIds } }];
        if (scopedAgentIds) memberFilters.push({ agentId: { in: scopedAgentIds } });
        if (targetMemberId) memberFilters.push({ id: targetMemberId });

        const members = await tx.user.findMany({
          where: {
            role: 'PLAYER',
            disabledAt: null,
            agentId: { not: null },
            AND: memberFilters,
          },
          select: { id: true, username: true, balance: true, agentId: true },
          orderBy: { username: 'asc' },
        });
        if (members.length === 0)
          return {
            memberCount: 0,
            shareAmount: '0.00',
            totalAmount: '0.00',
            scope: body.scope,
            targetUsername,
          };

        const baseShare = totalAmount
          .div(members.length)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
        const remainder = totalAmount.sub(baseShare.mul(members.length)).toDecimalPlaces(2);
        let scheduled = new Prisma.Decimal(0);
        let scheduledCount = 0;

        for (const [index, member] of members.entries()) {
          const amount = index === 0 ? baseShare.add(remainder) : baseShare;
          if (amount.lessThanOrEqualTo(0) || !member.agentId) continue;
          await tx.memberDepositControl.create({
            data: {
              memberId: member.id,
              memberUsername: member.username,
              agentId: member.agentId,
              depositAmount: amount,
              targetProfit: amount,
              startBalance: member.balance,
              controlWinRate: new Prisma.Decimal(1),
              notes: [
                `online_reward:total=${totalAmount.toFixed(2)}`,
                `minutes=${body.recentMinutes}`,
                `scope=${body.scope}`,
                targetUsername ? `target=${targetUsername}` : null,
              ]
                .filter(Boolean)
                .join(':'),
              operatorUsername: req.admin.username,
            },
          });
          scheduled = scheduled.add(amount);
          scheduledCount += 1;
        }

        return {
          memberCount: scheduledCount,
          shareAmount: baseShare.toFixed(2),
          totalAmount: scheduled.toFixed(2),
          scope: body.scope,
          targetUsername,
        };
      });

      if (result.memberCount === 0) {
        reply.code(400).send({
          code: 'NO_ACTIVE_MEMBERS',
          message: 'No active members in this scope and window',
        });
        return;
      }

      await writeAudit(fastify.prisma, {
        actor: auditActor(req),
        action: 'control.online_reward_next_win.create',
        targetType: 'control',
        newValues: { ...result, recentMinutes: body.recentMinutes, mode: 'next_round_win' },
        req,
      });

      return result;
    },
  );
}
