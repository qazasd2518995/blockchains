import { Prisma } from '@prisma/client';
import { GameId, SLOT_GAME_IDS } from '@bg/shared';
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

const ZERO = new Prisma.Decimal(0);
const ONE = new Prisma.Decimal(1);

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

export interface ControlOptions {
  /**
   * Force burst eligibility for a specific game path, or disable it for paths
   * that should only use the other control systems.
   */
  burstEligible?: boolean;
  /**
   * Highest multiplier the selected game configuration can reasonably hit.
   * This lets configurable games like wheel qualify by risk/segment settings
   * instead of only by the multiplier of the natural result.
   */
  burstPotentialMultiplier?: Prisma.Decimal | number | string;
  /**
   * Only prevent over-cap burst wins. Used for feature-buy paths where forcing
   * an artificial positive result would create a suspicious visual replay.
   */
  burstGuardOnly?: boolean;
}

interface BurstEligibility {
  eligible: boolean;
  loss: Prisma.Decimal;
  capital: Prisma.Decimal;
  requiredLoss: Prisma.Decimal;
}

const BURST_CONTROL_MIN_POTENTIAL_MULTIPLIER = new Prisma.Decimal(20);
const GLOBAL_ACCIDENTAL_BURST_PROFIT_CAP = new Prisma.Decimal(30000);
export const GLOBAL_MEMBER_DAILY_WIN_CAP = new Prisma.Decimal(50000);
const BURST_ALWAYS_ELIGIBLE_GAME_IDS = new Set<string>([
  GameId.MINES,
  GameId.HILO,
  GameId.KENO,
  GameId.PLINKO,
  GameId.PLINKO_X,
  GameId.TOWER,
  GameId.CHICKEN_ROAD,
  GameId.ROCKET,
  GameId.AVIATOR,
  GameId.SPACE_FLEET,
  GameId.JETX,
  GameId.BALLOON,
  GameId.JETX3,
  GameId.DOUBLE_X,
  ...SLOT_GAME_IDS,
]);
const BURST_CONDITIONAL_GAME_IDS = new Set<string>([GameId.DICE, GameId.WHEEL]);

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
  options: ControlOptions = {},
): Promise<ControlOutcome> {
  const member = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, agentId: true, username: true },
  });
  if (!member) return { ...predicted, controlled: false };

  const decision = await findControlDecision(tx, member, gameId, predicted, options);
  if (!decision) return { ...predicted, controlled: false };
  const cappedDecision =
    decision.desired === 'WIN' ? await withWinCapBounds(tx, member, predicted, decision) : decision;

  const predictedNetWin = isNetWin(predicted);
  if (cappedDecision.desired === 'LOSS') {
    if (!predictedNetWin) return { ...predicted, controlled: false };
    return flipToLoss(predicted, cappedDecision.reason, cappedDecision.controlId);
  }

  if (
    predictedNetWin &&
    !cappedDecision.forceWinAdjustment &&
    isWithinDecisionBounds(predicted, cappedDecision)
  ) {
    return { ...predicted, controlled: false };
  }
  return flipToWin(predicted, cappedDecision);
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
  await updateWinLossBiteProgress(tx, member, final);

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

export function passesControlInterventionRate(controlPercentage: Prisma.Decimal | number): boolean {
  const percentage =
    controlPercentage instanceof Prisma.Decimal ? Number(controlPercentage) : controlPercentage;
  if (!Number.isFinite(percentage)) return false;
  const rate = Math.min(100, Math.max(0, percentage)) / 100;
  return Math.random() < rate;
}

async function findControlDecision(
  tx: Db,
  member: MemberScope,
  gameId: string,
  predicted: PredictedResult,
  options: ControlOptions,
): Promise<ControlDecision | null> {
  if (options.burstGuardOnly) {
    const burst = await findBurstDecision(tx, member, gameId, predicted, options);
    if (burst) return burst;
    const accidentalBurstCap = findAccidentalBurstCapDecision(predicted);
    if (accidentalBurstCap) return accidentalBurstCap;
    const globalWinCap = await findGlobalMemberWinCapDecision(tx, member.id, predicted);
    if (globalWinCap) return globalWinCap;
    return null;
  }

  const onlineReward = await findOnlineRewardNextWinDecision(tx, member, predicted);
  if (onlineReward) return onlineReward;

  const explicitWinLoss = await findWinLossDecision(tx, member);
  if (explicitWinLoss?.desired === 'LOSS') return explicitWinLoss;

  if (explicitWinLoss) return explicitWinLoss;

  const memberCap = await findMemberWinCapDecision(tx, member.id, predicted);
  if (memberCap) return memberCap;

  const agentLineCap = await findAgentLineCapDecision(tx, member.agentId, predicted);
  if (agentLineCap) return agentLineCap;

  const deposit = await findDepositDecision(tx, member, predicted);
  if (deposit) return deposit;

  const targetedManual = await findManualDetectionDecision(tx, member, 'targeted');
  if (targetedManual) return targetedManual;

  const burst = await findBurstDecision(tx, member, gameId, predicted, options);
  if (burst) return burst;

  const accidentalBurstCap = findAccidentalBurstCapDecision(predicted);
  if (accidentalBurstCap) return accidentalBurstCap;

  const globalWinCap = await findGlobalMemberWinCapDecision(tx, member.id, predicted);
  if (globalWinCap) return globalWinCap;

  const globalManual = await findManualDetectionDecision(tx, member, 'global');
  if (globalManual) return globalManual;

  return null;
}

type WinLossDecisionScope = 'all' | 'member' | 'agent_line' | 'global';

async function findWinLossDecision(
  tx: Db,
  member: MemberScope,
  scope: WinLossDecisionScope = 'all',
): Promise<ControlDecision | null> {
  const controls = await tx.winLossControl.findMany({
    where: { isActive: true, isCompleted: false },
    orderBy: { createdAt: 'desc' },
  });
  if (controls.length === 0) return null;

  const ancestors = member.agentId ? await getAgentAncestors(tx, member.agentId) : [];
  const ranked = controls
    .map((control) => {
      if (
        (scope === 'all' || scope === 'member') &&
        control.controlMode === 'SINGLE_MEMBER' &&
        control.targetId === member.id
      ) {
        if (control.winControl) return { control, priority: 1, desired: 'WIN' as const };
        if (control.lossControl) return { control, priority: 4, desired: 'LOSS' as const };
      }

      if (
        (scope === 'all' || scope === 'agent_line') &&
        control.controlMode === 'AGENT_LINE' &&
        control.targetId &&
        ancestors.includes(control.targetId)
      ) {
        const depth = ancestors.indexOf(control.targetId);
        if (control.winControl) return { control, priority: 2 + depth, desired: 'WIN' as const };
        if (control.lossControl) return { control, priority: 20 + depth, desired: 'LOSS' as const };
      }

      if (
        (scope === 'all' || scope === 'global') &&
        (control.controlMode === 'AUTO_DETECT' || control.controlMode === 'NORMAL')
      ) {
        if (control.winControl) return { control, priority: 40, desired: 'WIN' as const };
        if (control.lossControl) return { control, priority: 41, desired: 'LOSS' as const };
      }

      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort(
      (a, b) =>
        a.priority - b.priority || b.control.createdAt.getTime() - a.control.createdAt.getTime(),
    );

  const selected = ranked[0];
  if (!selected) return null;
  if (
    selected.desired === 'LOSS' &&
    selected.control.targetLossAmount &&
    selected.control.currentLossAmount.greaterThanOrEqualTo(selected.control.targetLossAmount)
  ) {
    await tx.winLossControl.update({
      where: { id: selected.control.id },
      data: { isActive: false, isCompleted: true, completedAt: new Date() },
    });
    return null;
  }
  if (!passesControlInterventionRate(selected.control.controlPercentage)) return null;

  if (selected.desired === 'LOSS') {
    const release = await shouldReleaseLossControlCycle(
      tx,
      selected.control.id,
      member.id,
      selected.control.controlPercentage,
    );
    if (release) {
      return {
        desired: 'WIN',
        controlId: selected.control.id,
        reason: 'loss_control_release',
        minMultiplier: new Prisma.Decimal('1.01'),
        maxMultiplier: new Prisma.Decimal(2),
        forceWinAdjustment: true,
      };
    }
  }

  return {
    desired: selected.desired,
    controlId: selected.control.id,
    reason: selected.desired === 'WIN' ? 'win_control' : 'loss_control',
  };
}

async function shouldReleaseLossControlCycle(
  tx: Db,
  controlId: string,
  userId: string,
  controlPercentage: Prisma.Decimal,
): Promise<boolean> {
  const window = getControlGameDayWindow();
  const logs = await tx.winLossControlLogs.findMany({
    where: {
      controlId,
      userId,
      createdAt: { gte: window.start, lt: window.end },
      flipReason: { in: ['loss_control', 'loss_control_release'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { flipReason: true },
  });

  let consecutiveLosses = 0;
  for (const log of logs) {
    if (log.flipReason === 'loss_control_release') break;
    if (log.flipReason === 'loss_control') consecutiveLosses += 1;
  }

  const requiredLosses = Number(controlPercentage) >= 60 ? 4 : 3;
  return consecutiveLosses >= requiredLosses;
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

async function findGlobalMemberWinCapDecision(
  tx: Db,
  memberId: string,
  predicted: PredictedResult,
): Promise<ControlDecision | null> {
  const predictedProfit = predicted.payout.sub(predicted.amount);
  if (!predictedProfit.greaterThan(0)) return null;

  const stats = await getMemberTodayStats(tx, memberId);
  const projected = stats.net.add(predictedProfit);
  if (
    stats.net.greaterThanOrEqualTo(GLOBAL_MEMBER_DAILY_WIN_CAP) ||
    projected.greaterThan(GLOBAL_MEMBER_DAILY_WIN_CAP)
  ) {
    return {
      desired: 'LOSS',
      controlId: 'global-member-daily-win-cap',
      reason: 'global_member_daily_win_cap',
    };
  }
  return null;
}

function findAccidentalBurstCapDecision(predicted: PredictedResult): ControlDecision | null {
  const predictedProfit = predicted.payout.sub(predicted.amount);
  if (!predictedProfit.greaterThan(GLOBAL_ACCIDENTAL_BURST_PROFIT_CAP)) return null;

  return {
    desired: 'WIN',
    controlId: 'global-accidental-burst-cap',
    reason: 'global_accidental_burst_cap',
    minMultiplier: new Prisma.Decimal('1.01'),
    maxPayout: predicted.amount.add(GLOBAL_ACCIDENTAL_BURST_PROFIT_CAP).toDecimalPlaces(2),
    forceWinAdjustment: true,
  };
}

async function withWinCapBounds(
  tx: Db,
  member: MemberScope,
  predicted: PredictedResult,
  decision: ControlDecision,
): Promise<ControlDecision> {
  if (decision.desired !== 'WIN') return decision;

  const maxPayouts: Prisma.Decimal[] = [];
  const globalBound = await getGlobalMemberWinCapPayoutBound(tx, member.id, predicted.amount);
  if (globalBound === null) {
    return {
      desired: 'LOSS',
      controlId: decision.controlId,
      reason: 'global_member_daily_win_cap',
    };
  }
  maxPayouts.push(globalBound);

  const memberBound = await getMemberWinCapPayoutBound(tx, member.id, predicted.amount);
  if (memberBound === null) {
    return { desired: 'LOSS', controlId: decision.controlId, reason: 'win_cap' };
  }
  if (memberBound) maxPayouts.push(memberBound);

  const agentBound = await getAgentLineCapPayoutBound(tx, member.agentId, predicted.amount);
  if (agentBound === null) {
    return { desired: 'LOSS', controlId: decision.controlId, reason: 'agent_line_cap' };
  }
  if (agentBound) maxPayouts.push(agentBound);

  const capPayout = minDecimal(maxPayouts);
  return {
    ...decision,
    maxPayout: decision.maxPayout ? minDecimal([decision.maxPayout, capPayout]) : capPayout,
  };
}

async function getGlobalMemberWinCapPayoutBound(
  tx: Db,
  memberId: string,
  amount: Prisma.Decimal,
): Promise<Prisma.Decimal | null> {
  const stats = await getMemberTodayStats(tx, memberId);
  const remainingProfit = GLOBAL_MEMBER_DAILY_WIN_CAP.sub(stats.net);
  if (remainingProfit.lessThanOrEqualTo(0)) return null;
  return amount.add(remainingProfit).toDecimalPlaces(2);
}

async function getMemberWinCapPayoutBound(
  tx: Db,
  memberId: string,
  amount: Prisma.Decimal,
): Promise<Prisma.Decimal | null | undefined> {
  const control = await tx.memberWinCapControl.findFirst({
    where: { memberId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!control) return undefined;

  const normalized = await normalizeMemberWinCapDay(tx, control);
  const remainingProfit = normalized.winCapAmount.sub(normalized.todayWinAmount);
  if (remainingProfit.lessThanOrEqualTo(0)) return null;
  return amount.add(remainingProfit).toDecimalPlaces(2);
}

async function getAgentLineCapPayoutBound(
  tx: Db,
  agentId: string | null,
  amount: Prisma.Decimal,
): Promise<Prisma.Decimal | null | undefined> {
  if (!agentId) return undefined;
  const ancestors = await getAgentAncestors(tx, agentId);
  if (ancestors.length === 0) return undefined;

  const controls = await tx.agentLineWinCap.findMany({
    where: { agentId: { in: ancestors }, isActive: true },
  });
  if (controls.length === 0) return undefined;

  const bounds: Prisma.Decimal[] = [];
  for (const control of controls) {
    const normalized = await normalizeAgentLineCapDay(tx, control);
    const remainingProfit = normalized.dailyCap.sub(normalized.todayWinAmount);
    if (remainingProfit.lessThanOrEqualTo(0)) return null;
    bounds.push(amount.add(remainingProfit).toDecimalPlaces(2));
  }
  return minDecimal(bounds);
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

async function findDepositDecision(
  tx: Db,
  member: MemberScope,
  predicted: PredictedResult,
): Promise<ControlDecision | null> {
  const control = await tx.memberDepositControl.findFirst({
    where: {
      memberId: member.id,
      isActive: true,
      isCompleted: false,
      OR: [{ notes: null }, { NOT: { notes: { contains: 'online_reward' } } }],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      startBalance: true,
      targetProfit: true,
      controlWinRate: true,
      notes: true,
    },
  });
  if (!control) return null;
  return buildDepositDecision(tx, member, predicted, control);
}

async function findOnlineRewardNextWinDecision(
  tx: Db,
  member: MemberScope,
  predicted: PredictedResult,
): Promise<ControlDecision | null> {
  const control = await tx.memberDepositControl.findFirst({
    where: {
      memberId: member.id,
      isActive: true,
      isCompleted: false,
      notes: { contains: 'online_reward' },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      startBalance: true,
      targetProfit: true,
      controlWinRate: true,
      notes: true,
    },
  });
  if (!control) return null;
  return buildDepositDecision(tx, member, predicted, control);
}

async function buildDepositDecision(
  tx: Db,
  member: MemberScope,
  predicted: PredictedResult,
  control: {
    id: string;
    startBalance: Prisma.Decimal;
    targetProfit: Prisma.Decimal;
    controlWinRate: Prisma.Decimal;
    notes: string | null;
  },
): Promise<ControlDecision | null> {
  const currentUser = await tx.user.findUnique({
    where: { id: member.id },
    select: { balance: true },
  });
  const currentProfit = currentUser ? currentUser.balance.minus(control.startBalance) : ZERO;
  if (currentProfit.greaterThanOrEqualTo(control.targetProfit)) {
    await tx.memberDepositControl.update({
      where: { id: control.id },
      data: { isActive: false, isCompleted: true },
    });
    return null;
  }

  const remainingProfit = Prisma.Decimal.max(control.targetProfit.sub(currentProfit), ZERO);
  const isAutoRevive = control.notes?.includes('auto_revive') ?? false;
  const isOnlineRewardNextWin = control.notes?.includes('online_reward') ?? false;
  const maxPayout = isAutoRevive
    ? predicted.amount.add(remainingProfit).toDecimalPlaces(2)
    : undefined;
  const targetMultiplier =
    isOnlineRewardNextWin && maxPayout && predicted.amount.greaterThan(0)
      ? maxPayout.div(predicted.amount).toDecimalPlaces(4)
      : undefined;

  return {
    desired: Math.random() < Number(control.controlWinRate) ? 'WIN' : 'LOSS',
    controlId: control.id,
    reason: isOnlineRewardNextWin ? 'online_reward_next_win' : 'deposit_control',
    minMultiplier:
      targetMultiplier && targetMultiplier.greaterThan(1) ? targetMultiplier : undefined,
    maxPayout,
    forceWinAdjustment: isOnlineRewardNextWin,
  };
}

async function findManualDetectionDecision(
  tx: Db,
  member: MemberScope,
  scope: 'all' | 'targeted' | 'global' = 'all',
): Promise<ControlDecision | null> {
  await checkAndCompleteManualDetectionControls(tx);
  const applicable = await findApplicableManualDetectionControl(tx, member);
  if (!applicable) return null;
  if (scope === 'targeted' && applicable.control.scope === 'ALL') return null;
  if (scope === 'global' && applicable.control.scope !== 'ALL') return null;

  if (!passesControlInterventionRate(applicable.control.controlPercentage)) {
    return null;
  }

  const settlement = await calculateCurrentSettlement(
    tx,
    applicable.control.scope,
    applicable.control.targetAgentId,
    applicable.control.targetMemberUsername,
  );
  return {
    desired: settlement.superiorSettlement.lessThan(applicable.control.targetSettlement)
      ? 'LOSS'
      : 'WIN',
    controlId: applicable.control.id,
    reason: 'manual_detection',
    minMultiplier: new Prisma.Decimal('1.01'),
  };
}

async function findBurstDecision(
  tx: Db,
  member: MemberScope,
  gameId: string,
  predicted: PredictedResult,
  options: ControlOptions,
): Promise<ControlDecision | null> {
  if (!isBurstControlEligible(gameId, predicted, options)) return null;

  const applicable = await findApplicableBurstControl(tx, member, gameId);
  if (!applicable) return null;

  const control = await normalizeBurstControlDay(tx, applicable.control);
  const stats = await getMemberTodayStats(tx, member.id);
  const memberBurstProfit = await sumMemberBurstProfit(tx, control.id, member.id);
  const remainingBudget = control.dailyBudget.sub(control.todayBurstAmount);
  const memberRemaining = control.memberDailyCap.sub(memberBurstProfit);
  const maxBurstProfit = minDecimal([control.singlePayoutCap, remainingBudget, memberRemaining]);
  const maxPayout = predicted.amount.add(maxBurstProfit);
  const predictedProfit = predicted.payout.sub(predicted.amount);
  const predictedNetWin = isNetWin(predicted);
  const eligibility = await getBurstEligibility(tx, member.id, stats.net, control);
  const guardOnly = options.burstGuardOnly === true;

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
    if (!eligibility.eligible) {
      return { desired: 'LOSS', controlId: control.id, reason: 'burst_risk_guard' };
    }
    const cappedSmall = minDecimal([
      control.smallWinMultiplier,
      control.singleMultiplierCap,
      maxPayout.div(predicted.amount),
    ]);
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

  if (guardOnly) return null;

  const inCooldown = await isBurstCooldownActive(tx, control.id, member.id, control.cooldownRounds);
  const canBurst = !inCooldown && remainingBudget.greaterThan(0) && memberRemaining.greaterThan(0);

  if (eligibility.eligible && stats.net.lessThanOrEqualTo(control.compensationLoss.negated())) {
    if (Math.random() < clampRate(control.smallWinRate)) {
      return smallWinDecision(
        control.id,
        control.smallWinMultiplier,
        control.singleMultiplierCap,
        maxPayout,
      );
    }
  }

  const burstRate = canBurst && eligibility.eligible ? clampRate(control.burstRate) : 0;
  const smallWinRate = eligibility.eligible ? clampRate(control.smallWinRate) : 0;
  const lossRate = eligibility.eligible ? clampRate(control.lossRate) : 0;
  const roll = Math.random();

  if (roll < burstRate) {
    const maxMultiplier = minDecimal([
      control.singleMultiplierCap,
      maxPayout.div(predicted.amount),
    ]);
    const minMultiplierByProfit = predicted.amount
      .add(control.minBurstMultiplier)
      .div(predicted.amount);
    const minMultiplier = minDecimal([minMultiplierByProfit, maxMultiplier]);
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
    return smallWinDecision(
      control.id,
      control.smallWinMultiplier,
      control.singleMultiplierCap,
      maxPayout,
    );
  }

  if (roll < burstRate + smallWinRate + lossRate) {
    return { desired: 'LOSS', controlId: control.id, reason: 'burst_loss' };
  }

  return null;
}

export function isBurstControlEligible(
  gameId: string,
  predicted: Pick<PredictedResult, 'multiplier'>,
  options: ControlOptions = {},
): boolean {
  if (options.burstEligible === false) return false;
  if (options.burstEligible === true) return true;
  if (BURST_ALWAYS_ELIGIBLE_GAME_IDS.has(gameId)) return true;
  if (!BURST_CONDITIONAL_GAME_IDS.has(gameId)) return false;

  const configuredPotential = toDecimalOrNull(options.burstPotentialMultiplier);
  const potential =
    configuredPotential && configuredPotential.greaterThan(predicted.multiplier)
      ? configuredPotential
      : predicted.multiplier;
  return potential.greaterThanOrEqualTo(BURST_CONTROL_MIN_POTENTIAL_MULTIPLIER);
}

async function getBurstEligibility(
  tx: Db,
  userId: string,
  todayNet: Prisma.Decimal,
  control: {
    capitalRetentionRatio: Prisma.Decimal;
    minEligibilityLoss: Prisma.Decimal;
  },
): Promise<BurstEligibility> {
  const retention = clampDecimal(control.capitalRetentionRatio, ZERO, new Prisma.Decimal('0.9999'));
  const minLoss = Prisma.Decimal.max(control.minEligibilityLoss, ZERO);
  const ratioEnabled = retention.greaterThan(0);
  const amountEnabled = minLoss.greaterThan(0);
  const loss = Prisma.Decimal.max(todayNet.negated(), ZERO);

  if (!ratioEnabled && !amountEnabled) {
    return {
      eligible: true,
      loss,
      capital: ZERO,
      requiredLoss: ZERO,
    };
  }

  const capital = ratioEnabled ? await getMemberTodayCapital(tx, userId) : ZERO;
  const requiredByRatio = ratioEnabled ? capital.mul(ONE.sub(retention)) : ZERO;
  const requiredLoss = Prisma.Decimal.max(requiredByRatio, minLoss);
  const hasCapitalForRatio = !ratioEnabled || capital.greaterThan(0);

  return {
    eligible: loss.greaterThanOrEqualTo(requiredLoss) && (hasCapitalForRatio || amountEnabled),
    loss,
    capital,
    requiredLoss,
  };
}

async function getMemberTodayCapital(tx: Db, userId: string): Promise<Prisma.Decimal> {
  const window = getControlGameDayWindow();
  const [firstTx, incoming] = await Promise.all([
    tx.transaction.findFirst({
      where: {
        userId,
        createdAt: { gte: window.start, lt: window.end },
      },
      orderBy: { createdAt: 'asc' },
      select: { amount: true, balanceAfter: true },
    }),
    tx.transaction.aggregate({
      where: {
        userId,
        createdAt: { gte: window.start, lt: window.end },
        type: { in: ['SIGNUP_BONUS', 'TRANSFER_IN', 'ADJUSTMENT'] },
        amount: { gt: 0 },
      },
      _sum: { amount: true },
    }),
  ]);

  const openingBalance = firstTx ? firstTx.balanceAfter.sub(firstTx.amount) : ZERO;
  return Prisma.Decimal.max(openingBalance, ZERO).add(incoming._sum.amount ?? ZERO);
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

async function getMemberTodayStats(
  tx: Db,
  userId: string,
): Promise<{ net: Prisma.Decimal; bets: number }> {
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

async function sumMemberBurstProfit(
  tx: Db,
  controlId: string,
  userId: string,
): Promise<Prisma.Decimal> {
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
  if (!outcome.controlled || !outcome.controlId || !outcome.flipReason?.startsWith('burst_'))
    return;
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

async function updateWinLossBiteProgress(
  tx: Db,
  member: MemberScope,
  final: FinalizedControlResult,
): Promise<void> {
  const lossAmount = final.amount.sub(final.payout).toDecimalPlaces(2);
  if (lossAmount.lessThanOrEqualTo(0)) return;

  const controls = await findApplicableLossTargetControls(tx, member);
  for (const control of controls) {
    if (!control.targetLossAmount) continue;
    const nextLoss = control.currentLossAmount.add(lossAmount).toDecimalPlaces(2);
    const completed = nextLoss.greaterThanOrEqualTo(control.targetLossAmount);
    await tx.winLossControl.update({
      where: { id: control.id },
      data: {
        currentLossAmount: nextLoss,
        isActive: !completed,
        isCompleted: completed,
        completedAt: completed ? new Date() : null,
      },
    });
  }
}

async function findApplicableLossTargetControls(
  tx: Db,
  member: MemberScope,
): Promise<
  Array<{
    id: string;
    controlMode: string;
    targetId: string | null;
    targetUsername: string | null;
    targetLossAmount: Prisma.Decimal | null;
    currentLossAmount: Prisma.Decimal;
  }>
> {
  const controls = await tx.winLossControl.findMany({
    where: {
      isActive: true,
      isCompleted: false,
      lossControl: true,
      targetLossAmount: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      controlMode: true,
      targetId: true,
      targetUsername: true,
      targetLossAmount: true,
      currentLossAmount: true,
    },
  });
  if (controls.length === 0) return [];

  const ancestors = member.agentId ? await getAgentAncestors(tx, member.agentId) : [];
  return controls.filter((control) => {
    if (control.controlMode === 'SINGLE_MEMBER') {
      return control.targetId === member.id || control.targetUsername === member.username;
    }
    if (control.controlMode === 'AGENT_LINE') {
      return Boolean(control.targetId && ancestors.includes(control.targetId));
    }
    return control.controlMode === 'AUTO_DETECT' || control.controlMode === 'NORMAL';
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

function clampDecimal(
  value: Prisma.Decimal,
  min: Prisma.Decimal,
  max: Prisma.Decimal,
): Prisma.Decimal {
  if (value.lessThan(min)) return min;
  if (value.greaterThan(max)) return max;
  return value;
}

function toDecimalOrNull(
  value: Prisma.Decimal | number | string | undefined,
): Prisma.Decimal | null {
  if (value === undefined || value === null) return null;
  try {
    return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  } catch {
    return null;
  }
}

function isWithinDecisionBounds(result: PredictedResult, decision: ControlDecision): boolean {
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
  const maxValues = [decision.maxMultiplier, payoutCapMultiplier].filter(
    (value): value is Prisma.Decimal => Boolean(value),
  );
  const hardMax =
    maxValues.length > 0
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
