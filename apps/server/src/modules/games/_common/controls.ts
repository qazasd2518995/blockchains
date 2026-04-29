import { Prisma } from '@prisma/client';
import {
  calculateCurrentSettlement,
  checkAndCompleteManualDetectionControls,
  findApplicableBurstControl,
  findApplicableManualDetectionControl,
  getAgentAncestors,
  getControlGameDayWindow,
  normalizeAgentLineCapDay,
  normalizeBurstControlDay,
  normalizeMemberWinCapDay,
} from '../../admin/controls/controls.runtime.js';

type Db = Prisma.TransactionClient;

export interface PredictedResult {
  won: boolean;
  amount: Prisma.Decimal;
  multiplier: Prisma.Decimal;
  payout: Prisma.Decimal;
}

export interface ControlOutcome {
  won: boolean;
  multiplier: Prisma.Decimal;
  payout: Prisma.Decimal;
  controlled: boolean;
  flipReason?: string;
  controlId?: string;
  minMultiplier?: Prisma.Decimal;
  maxMultiplier?: Prisma.Decimal;
  maxPayout?: Prisma.Decimal;
}

export interface FinalizedControlResult {
  won: boolean;
  amount: Prisma.Decimal;
  multiplier: Prisma.Decimal;
  payout: Prisma.Decimal;
}

interface MemberScope {
  id: string;
  username: string;
  agentId: string | null;
}

interface ControlDecision {
  desired: 'WIN' | 'LOSS';
  controlId: string;
  reason: string;
  minMultiplier?: Prisma.Decimal;
  maxMultiplier?: Prisma.Decimal;
  maxPayout?: Prisma.Decimal;
  forceWinAdjustment?: boolean;
}

/**
 * 控制 hook：只決定本局是否需要由後台規則翻轉輸贏。
 *
 * 真正寫入 Bet / CrashBet 的結果仍由各遊戲服務依自己的玩法產生，避免
 * 「結果畫面」與「派彩」不一致。結算後必須呼叫 finalizeControls()，用
 * 最終結果更新封頂/入金累計並寫入 WinLossControlLogs。
 */
export async function applyControls(
  tx: Db,
  userId: string,
  gameId: string,
  predicted: PredictedResult,
): Promise<ControlOutcome> {
  const member = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, agentId: true, username: true },
  });
  if (!member) return { ...predicted, controlled: false };

  const decision = await findControlDecision(tx, member, predicted);
  if (!decision) return { ...predicted, controlled: false };

  const predictedNetWin = isNetWin(predicted);
  if (decision.desired === 'LOSS') {
    if (!predictedNetWin) return { ...predicted, controlled: false };
    return flipToLoss(predicted, decision.reason, decision.controlId);
  }

  if (predictedNetWin && !decision.forceWinAdjustment && isWithinDecisionBounds(predicted, decision)) {
    return { ...predicted, controlled: false };
  }
  return flipToWin(predicted, decision);
}

export async function finalizeControls(
  tx: Db,
  userId: string,
  gameId: string,
  original: PredictedResult,
  final: FinalizedControlResult,
  outcome: ControlOutcome,
  betId: string | null,
  originalResult: Prisma.InputJsonValue,
  finalResult: Prisma.InputJsonValue,
): Promise<void> {
  const member = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, agentId: true, balance: true },
  });
  if (!member) return;

  await updateMemberWinCap(tx, member.id, final);
  await updateAgentLineCaps(tx, member.agentId, final);
  await completeDepositControlIfReached(tx, member.id, member.balance);
  await updateBurstControlUsage(tx, outcome, final);

  if (outcome.controlled && outcome.controlId && outcome.flipReason) {
    await tx.winLossControlLogs.create({
      data: {
        controlId: outcome.controlId,
        betId,
        userId,
        gameId,
        originalResult: {
          won: isNetWin(original),
          multiplier: original.multiplier.toFixed(4),
          payout: original.payout.toFixed(2),
          result: originalResult,
        },
        finalResult: {
          won: final.won,
          amount: final.amount.toFixed(2),
          multiplier: final.multiplier.toFixed(4),
          payout: final.payout.toFixed(2),
          result: finalResult,
        },
        flipReason: outcome.flipReason,
      },
    });
  }
}

function isNetWin(result: PredictedResult | FinalizedControlResult): boolean {
  return result.payout.greaterThan(result.amount);
}

async function findControlDecision(
  tx: Db,
  member: MemberScope,
  predicted: PredictedResult,
): Promise<ControlDecision | null> {
  const winLoss = await findWinLossDecision(tx, member);
  if (winLoss) return winLoss;

  const memberCap = await findMemberWinCapDecision(tx, member.id, predicted);
  if (memberCap) return memberCap;

  const agentLineCap = await findAgentLineCapDecision(tx, member.agentId, predicted);
  if (agentLineCap) return agentLineCap;

  const deposit = await findDepositDecision(tx, member);
  if (deposit) return deposit;

  const manual = await findManualDetectionDecision(tx, member);
  if (manual) return manual;

  return findBurstDecision(tx, member, predicted);
}

async function findWinLossDecision(tx: Db, member: MemberScope): Promise<ControlDecision | null> {
  const controls = await tx.winLossControl.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (controls.length === 0) return null;

  const ancestors = member.agentId ? await getAgentAncestors(tx, member.agentId) : [];
  const ranked = controls
    .map((control) => {
      if (control.controlMode === 'SINGLE_MEMBER' && control.targetId === member.id) {
        if (control.winControl) return { control, priority: 1, desired: 'WIN' as const };
        if (control.lossControl) return { control, priority: 4, desired: 'LOSS' as const };
      }

      if (control.controlMode === 'AGENT_LINE' && control.targetId && ancestors.includes(control.targetId)) {
        const depth = ancestors.indexOf(control.targetId);
        if (control.winControl) return { control, priority: 2 + depth, desired: 'WIN' as const };
        if (control.lossControl) return { control, priority: 20 + depth, desired: 'LOSS' as const };
      }

      if (control.controlMode === 'AUTO_DETECT' || control.controlMode === 'NORMAL') {
        if (control.winControl) return { control, priority: 40, desired: 'WIN' as const };
        if (control.lossControl) return { control, priority: 41, desired: 'LOSS' as const };
      }

      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.priority - b.priority || b.control.createdAt.getTime() - a.control.createdAt.getTime());

  const selected = ranked[0];
  if (!selected) return null;
  if (Math.random() >= Number(selected.control.controlPercentage) / 100) return null;

  return {
    desired: selected.desired,
    controlId: selected.control.id,
    reason: selected.desired === 'WIN' ? 'win_control' : 'loss_control',
  };
}

async function findMemberWinCapDecision(
  tx: Db,
  memberId: string,
  predicted: PredictedResult,
): Promise<ControlDecision | null> {
  const control = await tx.memberWinCapControl.findFirst({
    where: { memberId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!control) return null;

  const normalized = await normalizeMemberWinCapDay(tx, control);
  const todayWin = normalized.todayWinAmount;
  const cap = normalized.winCapAmount;
  const projected = todayWin.add(predicted.payout.sub(predicted.amount));

  if (todayWin.greaterThanOrEqualTo(cap) || projected.greaterThanOrEqualTo(cap)) {
    return { desired: 'LOSS', controlId: normalized.id, reason: 'win_cap' };
  }

  const triggerAt = cap.mul(normalized.triggerThreshold);
  if (todayWin.greaterThanOrEqualTo(triggerAt)) {
    return {
      desired: Math.random() < Number(normalized.controlWinRate) ? 'WIN' : 'LOSS',
      controlId: normalized.id,
      reason: 'win_cap_rate',
    };
  }

  return null;
}

async function findAgentLineCapDecision(
  tx: Db,
  agentId: string | null,
  predicted: PredictedResult,
): Promise<ControlDecision | null> {
  if (!agentId) return null;
  const ancestors = await getAgentAncestors(tx, agentId);
  if (ancestors.length === 0) return null;

  const controls = await tx.agentLineWinCap.findMany({
    where: { agentId: { in: ancestors }, isActive: true },
  });
  if (controls.length === 0) return null;

  const byAgent = new Map(controls.map((control) => [control.agentId, control]));
  for (const id of ancestors) {
    const control = byAgent.get(id);
    if (!control) continue;
    const normalized = await normalizeAgentLineCapDay(tx, control);
    const todayWin = normalized.todayWinAmount;
    const cap = normalized.dailyCap;
    const projected = todayWin.add(predicted.payout.sub(predicted.amount));

    if (todayWin.greaterThanOrEqualTo(cap) || projected.greaterThanOrEqualTo(cap)) {
      return { desired: 'LOSS', controlId: normalized.id, reason: 'agent_line_cap' };
    }

    if (todayWin.greaterThanOrEqualTo(cap.mul(normalized.triggerThreshold))) {
      return {
        desired: Math.random() < Number(normalized.controlWinRate) ? 'WIN' : 'LOSS',
        controlId: normalized.id,
        reason: 'agent_line_cap_rate',
      };
    }
  }

  return null;
}

async function findDepositDecision(tx: Db, member: MemberScope): Promise<ControlDecision | null> {
  const control = await tx.memberDepositControl.findFirst({
    where: { memberId: member.id, isActive: true, isCompleted: false },
    orderBy: { createdAt: 'desc' },
  });
  if (!control) return null;

  const currentUser = await tx.user.findUnique({
    where: { id: member.id },
    select: { balance: true },
  });
  if (currentUser && currentUser.balance.minus(control.startBalance).greaterThanOrEqualTo(control.targetProfit)) {
    await tx.memberDepositControl.update({
      where: { id: control.id },
      data: { isActive: false, isCompleted: true },
    });
    return null;
  }

  return {
    desired: Math.random() < Number(control.controlWinRate) ? 'WIN' : 'LOSS',
    controlId: control.id,
    reason: 'deposit_control',
  };
}

async function findManualDetectionDecision(
  tx: Db,
  member: MemberScope,
): Promise<ControlDecision | null> {
  await checkAndCompleteManualDetectionControls(tx);
  const applicable = await findApplicableManualDetectionControl(tx, member);
  if (!applicable) return null;

  if (Math.random() * 100 >= applicable.control.controlPercentage) {
    return null;
  }

  const settlement = await calculateCurrentSettlement(
    tx,
    applicable.control.scope,
    applicable.control.targetAgentId,
    applicable.control.targetMemberUsername,
  );
  return {
    desired: settlement.superiorSettlement.lessThan(applicable.control.targetSettlement) ? 'WIN' : 'LOSS',
    controlId: applicable.control.id,
    reason: 'manual_detection',
  };
}

async function findBurstDecision(
  tx: Db,
  member: MemberScope,
  predicted: PredictedResult,
): Promise<ControlDecision | null> {
  const applicable = await findApplicableBurstControl(tx, member);
  if (!applicable) return null;

  const control = await normalizeBurstControlDay(tx, applicable.control);
  const stats = await getMemberTodayStats(tx, member.id);
  const memberBurstProfit = await sumMemberBurstProfit(tx, control.id, member.id);
  const remainingBudget = control.dailyBudget.sub(control.todayBurstAmount);
  const memberRemaining = control.memberDailyCap.sub(memberBurstProfit);
  const maxPayout = minDecimal([
    control.singlePayoutCap,
    predicted.amount.add(remainingBudget),
    predicted.amount.add(memberRemaining),
  ]);
  const predictedProfit = predicted.payout.sub(predicted.amount);
  const predictedNetWin = isNetWin(predicted);

  if (remainingBudget.lessThanOrEqualTo(0) || memberRemaining.lessThanOrEqualTo(0)) {
    return predictedNetWin
      ? { desired: 'LOSS', controlId: control.id, reason: 'burst_budget_guard' }
      : null;
  }

  if (maxPayout.lessThanOrEqualTo(predicted.amount)) {
    return predictedNetWin
      ? { desired: 'LOSS', controlId: control.id, reason: 'burst_budget_guard' }
      : null;
  }

  const projectedNet = stats.net.add(predictedProfit);
  if (stats.net.greaterThanOrEqualTo(control.riskWinLimit)) {
    return predictedNetWin
      ? { desired: 'LOSS', controlId: control.id, reason: 'burst_risk_guard' }
      : null;
  }

  if (
    predictedNetWin &&
    (predicted.payout.greaterThan(maxPayout) ||
      predicted.multiplier.greaterThan(control.singleMultiplierCap) ||
      projectedNet.greaterThan(control.riskWinLimit))
  ) {
    const cappedSmall = minDecimal([control.smallWinMultiplier, control.singleMultiplierCap, maxPayout.div(predicted.amount)]);
    if (cappedSmall.lessThanOrEqualTo(1)) {
      return { desired: 'LOSS', controlId: control.id, reason: 'burst_risk_guard' };
    }
    return {
      desired: 'WIN',
      controlId: control.id,
      reason: 'burst_risk_cap',
      minMultiplier: new Prisma.Decimal('1.01'),
      maxMultiplier: cappedSmall,
      maxPayout,
      forceWinAdjustment: true,
    };
  }

  const inCooldown = await isBurstCooldownActive(tx, control.id, member.id, control.cooldownRounds);
  const canBurst = !inCooldown && remainingBudget.greaterThan(0) && memberRemaining.greaterThan(0);

  if (stats.net.lessThanOrEqualTo(control.compensationLoss.negated())) {
    if (Math.random() < clampRate(control.smallWinRate)) {
      return smallWinDecision(control.id, control.smallWinMultiplier, control.singleMultiplierCap, maxPayout);
    }
  }

  const burstRate = canBurst ? clampRate(control.burstRate) : 0;
  const smallWinRate = clampRate(control.smallWinRate);
  const lossRate = clampRate(control.lossRate);
  const roll = Math.random();

  if (roll < burstRate) {
    const maxMultiplier = minDecimal([control.singleMultiplierCap, maxPayout.div(predicted.amount)]);
    const minMultiplier = minDecimal([control.minBurstMultiplier, maxMultiplier]);
    if (maxMultiplier.greaterThan(1)) {
      return {
        desired: 'WIN',
        controlId: control.id,
        reason: 'burst_win',
        minMultiplier: minMultiplier.greaterThan(1) ? minMultiplier : new Prisma.Decimal('1.01'),
        maxMultiplier,
        maxPayout,
        forceWinAdjustment: true,
      };
    }
  }

  if (roll < burstRate + smallWinRate) {
    return smallWinDecision(control.id, control.smallWinMultiplier, control.singleMultiplierCap, maxPayout);
  }

  if (roll < burstRate + smallWinRate + lossRate) {
    return { desired: 'LOSS', controlId: control.id, reason: 'burst_loss' };
  }

  return null;
}

async function updateMemberWinCap(
  tx: Db,
  memberId: string,
  final: FinalizedControlResult,
): Promise<void> {
  const control = await tx.memberWinCapControl.findFirst({
    where: { memberId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!control) return;

  const normalized = await normalizeMemberWinCapDay(tx, control);
  const profit = final.payout.sub(final.amount);
  const nextWin = normalized.todayWinAmount.add(profit);
  await tx.memberWinCapControl.update({
    where: { id: normalized.id },
    data: {
      todayWinAmount: nextWin,
      todayBetCount: normalized.todayBetCount + 1,
      isCapped: nextWin.greaterThanOrEqualTo(normalized.winCapAmount),
    },
  });
}

async function updateAgentLineCaps(
  tx: Db,
  agentId: string | null,
  final: FinalizedControlResult,
): Promise<void> {
  if (!agentId) return;
  const ancestors = await getAgentAncestors(tx, agentId);
  if (ancestors.length === 0) return;
  const controls = await tx.agentLineWinCap.findMany({
    where: { agentId: { in: ancestors }, isActive: true },
  });
  if (controls.length === 0) return;

  const profit = final.payout.sub(final.amount);
  for (const control of controls) {
    const normalized = await normalizeAgentLineCapDay(tx, control);
    const nextWin = normalized.todayWinAmount.add(profit);
    await tx.agentLineWinCap.update({
      where: { id: normalized.id },
      data: {
        todayWinAmount: nextWin,
        isCapped: nextWin.greaterThanOrEqualTo(normalized.dailyCap),
      },
    });
  }
}

async function completeDepositControlIfReached(
  tx: Db,
  memberId: string,
  currentBalance: Prisma.Decimal,
): Promise<void> {
  const controls = await tx.memberDepositControl.findMany({
    where: { memberId, isActive: true, isCompleted: false },
  });
  for (const control of controls) {
    const currentProfit = currentBalance.minus(control.startBalance);
    if (currentProfit.greaterThanOrEqualTo(control.targetProfit)) {
      await tx.memberDepositControl.update({
        where: { id: control.id },
        data: { isActive: false, isCompleted: true },
      });
    }
  }
}

async function getMemberTodayStats(tx: Db, userId: string): Promise<{ net: Prisma.Decimal; bets: number }> {
  const window = getControlGameDayWindow();
  const [standard, crash] = await Promise.all([
    tx.bet.aggregate({
      where: {
        userId,
        status: 'SETTLED',
        createdAt: { gte: window.start, lt: window.end },
      },
      _count: { _all: true },
      _sum: { profit: true },
    }),
    tx.crashBet.aggregate({
      where: {
        userId,
        createdAt: { gte: window.start, lt: window.end },
        round: { status: 'CRASHED' },
      },
      _count: { _all: true },
      _sum: { amount: true, payout: true },
    }),
  ]);

  return {
    net: (standard._sum.profit ?? new Prisma.Decimal(0)).add(
      (crash._sum.payout ?? new Prisma.Decimal(0)).sub(crash._sum.amount ?? new Prisma.Decimal(0)),
    ),
    bets: standard._count._all + crash._count._all,
  };
}

async function sumMemberBurstProfit(tx: Db, controlId: string, userId: string): Promise<Prisma.Decimal> {
  const window = getControlGameDayWindow();
  const logs = await tx.winLossControlLogs.findMany({
    where: {
      controlId,
      userId,
      createdAt: { gte: window.start, lt: window.end },
      flipReason: { in: ['burst_win', 'burst_small_win', 'burst_risk_cap'] },
    },
    select: { finalResult: true },
  });

  return logs.reduce((sum, log) => {
    const final = log.finalResult as { amount?: string; payout?: string } | null;
    const amount = new Prisma.Decimal(final?.amount ?? 0);
    const payout = new Prisma.Decimal(final?.payout ?? 0);
    return sum.add(Prisma.Decimal.max(payout.sub(amount), 0));
  }, new Prisma.Decimal(0));
}

async function isBurstCooldownActive(
  tx: Db,
  controlId: string,
  userId: string,
  cooldownRounds: number,
): Promise<boolean> {
  if (cooldownRounds <= 0) return false;
  const latest = await tx.winLossControlLogs.findFirst({
    where: { controlId, userId, flipReason: 'burst_win' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (!latest) return false;
  const [standardCount, crashCount] = await Promise.all([
    tx.bet.count({
      where: {
        userId,
        status: 'SETTLED',
        createdAt: { gt: latest.createdAt },
      },
    }),
    tx.crashBet.count({
      where: {
        userId,
        createdAt: { gt: latest.createdAt },
        round: { status: 'CRASHED' },
      },
    }),
  ]);
  return standardCount + crashCount < cooldownRounds;
}

async function updateBurstControlUsage(
  tx: Db,
  outcome: ControlOutcome,
  final: FinalizedControlResult,
): Promise<void> {
  if (!outcome.controlled || !outcome.controlId || !outcome.flipReason?.startsWith('burst_')) return;
  if (!final.payout.greaterThan(final.amount)) return;
  const control = await tx.burstControl.findUnique({ where: { id: outcome.controlId } });
  if (!control) return;
  const normalized = await normalizeBurstControlDay(tx, control);
  const profit = final.payout.sub(final.amount);
  await tx.burstControl.update({
    where: { id: normalized.id },
    data: {
      todayBurstAmount: { increment: profit },
      todayBurstCount: { increment: outcome.flipReason === 'burst_win' ? 1 : 0 },
    },
  });
}

function smallWinDecision(
  controlId: string,
  smallWinMultiplier: Prisma.Decimal,
  singleMultiplierCap: Prisma.Decimal,
  maxPayout: Prisma.Decimal,
): ControlDecision {
  const maxMultiplier = Prisma.Decimal.max(
    new Prisma.Decimal('1.01'),
    minDecimal([smallWinMultiplier, singleMultiplierCap]),
  );
  return {
    desired: 'WIN',
    controlId,
    reason: 'burst_small_win',
    minMultiplier: new Prisma.Decimal('1.01'),
    maxMultiplier,
    maxPayout,
    forceWinAdjustment: true,
  };
}

function minDecimal(values: Prisma.Decimal[]): Prisma.Decimal {
  if (values.length === 0) return new Prisma.Decimal(Number.MAX_SAFE_INTEGER);
  return values.reduce((min, value) => (value.lessThan(min) ? value : min));
}

function clampRate(value: Prisma.Decimal): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function isWithinDecisionBounds(
  result: PredictedResult,
  decision: ControlDecision,
): boolean {
  if (decision.minMultiplier && result.multiplier.lessThan(decision.minMultiplier)) return false;
  if (decision.maxMultiplier && result.multiplier.greaterThan(decision.maxMultiplier)) return false;
  if (decision.maxPayout && result.payout.greaterThan(decision.maxPayout)) return false;
  return true;
}

function flipToLoss(_: PredictedResult, reason: string, controlId: string): ControlOutcome {
  return {
    won: false,
    multiplier: new Prisma.Decimal(0),
    payout: new Prisma.Decimal(0),
    controlled: true,
    flipReason: reason,
    controlId,
  };
}

function flipToWin(p: PredictedResult, decision: ControlDecision): ControlOutcome {
  const payoutCapMultiplier = decision.maxPayout ? decision.maxPayout.div(p.amount) : null;
  const maxValues = [decision.maxMultiplier, payoutCapMultiplier].filter((value): value is Prisma.Decimal => Boolean(value));
  const hardMax = maxValues.length > 0
    ? minDecimal(maxValues)
    : p.multiplier.greaterThan(1)
      ? p.multiplier
      : new Prisma.Decimal(2);
  const minMultiplier = decision.minMultiplier ?? new Prisma.Decimal(2);
  if (hardMax.lessThanOrEqualTo(1)) {
    return flipToLoss(p, 'burst_budget_guard', decision.controlId);
  }

  const target = p.multiplier.greaterThan(1) ? p.multiplier : minMultiplier;
  let multiplier = target;
  if (multiplier.lessThan(minMultiplier)) multiplier = minMultiplier;
  if (multiplier.greaterThan(hardMax)) multiplier = hardMax;
  if (multiplier.lessThanOrEqualTo(1)) {
    return flipToLoss(p, 'burst_budget_guard', decision.controlId);
  }
  const payout = p.amount.mul(multiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  return {
    won: true,
    multiplier,
    payout,
    controlled: true,
    flipReason: decision.reason,
    controlId: decision.controlId,
    minMultiplier: decision.minMultiplier,
    maxMultiplier: decision.maxMultiplier,
    maxPayout: decision.maxPayout,
  };
}

export function multiplierMatchesControlBounds(
  multiplier: number | Prisma.Decimal,
  amount: Prisma.Decimal,
  control: Pick<ControlOutcome, 'minMultiplier' | 'maxMultiplier' | 'maxPayout'>,
): boolean {
  const m = multiplier instanceof Prisma.Decimal ? multiplier : new Prisma.Decimal(multiplier);
  if (control.minMultiplier && m.lessThan(control.minMultiplier)) return false;
  if (control.maxMultiplier && m.greaterThan(control.maxMultiplier)) return false;
  if (control.maxPayout && amount.mul(m).greaterThan(control.maxPayout)) return false;
  return true;
}
