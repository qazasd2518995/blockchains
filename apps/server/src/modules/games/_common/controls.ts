import { AutoBalancePhase, ManualDetectionScope, Prisma } from '@prisma/client';
import { SLOT_GAME_IDS } from '@bg/shared';
import {
  calculateCurrentSettlement,
  checkAndCompleteManualDetectionControls,
  findApplicableBurstControl,
  findApplicableManualDetectionControl,
  getManualControlTargetBand,
  getAgentAncestors,
  getControlGameDayWindow,
  getOrCreateMemberAutoBalanceControl,
  isAutoBalanceExcludedAgentLine,
  isHoldTargetManualControl,
  normalizeAgentLineCapDay,
  normalizeBurstControlDay,
  normalizeMemberWinCapDay,
  resetMemberAutoBalanceControl,
  setMemberAutoBalancePhase,
} from '../../admin/controls/controls.runtime.js';
import { isMemberInControlExcludedLine, listAgentDescendants } from '../../../utils/hierarchy.js';

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
  gameMatchedPayoutOnly?: boolean;
  burstCooldownRounds?: number;
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
  gameMatchedPayoutOnly?: boolean;
  burstCooldownRounds?: number;
}

const CONTROL_INTERVENTION_MISS = Symbol('control_intervention_miss');
const CONTROL_PATH_NATURAL = Symbol('control_path_natural');
type ControlDecisionLookup =
  | ControlDecision
  | typeof CONTROL_INTERVENTION_MISS
  | typeof CONTROL_PATH_NATURAL
  | null;

type DepositControlRecord = {
  id: string;
  scope: string;
  memberId: string | null;
  memberUsername: string | null;
  targetAgentId: string | null;
  startBalance: Prisma.Decimal;
  targetProfit: Prisma.Decimal;
  controlWinRate: Prisma.Decimal;
  lifecycleSteps: Prisma.JsonValue | null;
  notes: string | null;
  createdAt: Date;
};

type DepositLifecycleStateRecord = {
  id: string;
  controlId: string;
  memberId: string;
  memberUsername: string;
  startBalance: Prisma.Decimal;
  currentStageIndex: number;
  isCompleted: boolean;
  lastBalance: Prisma.Decimal | null;
};

type AutoBalanceControlRecord = {
  id: string;
  memberId: string;
  memberUsername: string;
  agentId: string | null;
  baselineBalance: Prisma.Decimal;
  biteTargetBalance: Prisma.Decimal;
  reviveTargetBalance: Prisma.Decimal;
  phase: AutoBalancePhase;
  templateKey?: string | null;
  lifecycleSteps?: Prisma.JsonValue | null;
  currentStageIndex?: number | null;
  lifecycleCompletedAt?: Date | null;
  lastBalance?: Prisma.Decimal | null;
  secondLineAmount?: Prisma.Decimal | null;
  controlPercentage?: number | null;
  isActive: boolean;
};

function isControlInterventionMiss(
  decision: ControlDecisionLookup,
): decision is typeof CONTROL_INTERVENTION_MISS {
  return decision === CONTROL_INTERVENTION_MISS;
}

function isControlPathNatural(
  decision: ControlDecisionLookup,
): decision is typeof CONTROL_PATH_NATURAL {
  return decision === CONTROL_PATH_NATURAL;
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
  /**
   * Crash-style games decide the visual outcome after start, so they use a
   * winning probe to ask whether controls want WIN or LOSS. In that path a
   * matched WIN must still tune the crash point instead of being treated as an
   * already acceptable natural win.
   */
  forceControlOnMatch?: boolean;
  /**
   * Multi-step games can have safe/progressing steps before the accumulated
   * payout is above the original bet. When a control wants LOSS, this prevents
   * those steps from advancing toward a later cashout.
   */
  forceLossOnProgress?: boolean;
}

export interface GlobalMemberDailyWinCapGuard {
  exhausted: boolean;
  controlId: string;
  reason: string;
  maxPayout: Prisma.Decimal;
  maxMultiplier: Prisma.Decimal;
}

interface BurstEligibility {
  eligible: boolean;
  loss: Prisma.Decimal;
  capital: Prisma.Decimal;
  requiredLoss: Prisma.Decimal;
}

interface ControlReleaseConfig {
  minLosses: number;
  baseChance: number;
  chanceStep: number;
  maxChance: number;
  highControlDampening: number;
  maxMultiplier: Prisma.Decimal;
}

interface ControlReleaseProfile {
  consecutiveLosses: number;
  totalAmount: Prisma.Decimal;
  totalLoss: Prisma.Decimal;
  maxAmount: Prisma.Decimal;
}

interface ControlReleasePlan {
  maxMultiplier: Prisma.Decimal;
  maxPayout: Prisma.Decimal;
}

const GLOBAL_ACCIDENTAL_BURST_PROFIT_CAP = new Prisma.Decimal(10000);
export const GLOBAL_MEMBER_DAILY_WIN_CAP = new Prisma.Decimal(10000);
const BURST_COOLDOWN_MIN_ROUNDS = 10;
const BURST_COOLDOWN_MAX_ROUNDS = 20;
const BURST_ELIGIBLE_GAME_IDS = new Set<string>(SLOT_GAME_IDS);
const AUTO_BALANCE_BITE_INTERVENTION_RATE = 0.3;
const AUTO_BALANCE_DRAIN_INTERVENTION_RATE = 0.4;
const GLOBAL_MEMBER_DAILY_WIN_CAP_DRAIN_INTERVENTION_RATE = AUTO_BALANCE_DRAIN_INTERVENTION_RATE;
const LIFECYCLE_PATH_TARGET_BAND_RATE = new Prisma.Decimal('0.05');
const LIFECYCLE_PATH_STAGE_BAND_PERCENT = 10;
const CONTROL_RELEASE_LOG_WINDOW = 8;
const CONTROL_RELEASE_STAKE_JUMP_RATIO = new Prisma.Decimal('1.5');
const CONTROL_RELEASE_TOTAL_LOSS_PROFIT_RATIO = new Prisma.Decimal('0.25');
const CONTROL_RELEASE_AVG_STAKE_PROFIT_RATIO = new Prisma.Decimal('0.35');
const CONTROL_RELEASE_CURRENT_STAKE_PROFIT_RATIO = new Prisma.Decimal('0.35');
const CONTROL_RELEASE_MAX_MULTIPLIER = new Prisma.Decimal('1.35');
const LOSS_CONTROL_RELEASE_CONFIG: ControlReleaseConfig = {
  minLosses: 2,
  baseChance: 0.1,
  chanceStep: 0.04,
  maxChance: 0.26,
  highControlDampening: 0.75,
  maxMultiplier: CONTROL_RELEASE_MAX_MULTIPLIER,
};
const AUTO_BALANCE_REVIVE_INTERVENTION_RATE = 0.6;
const MANUAL_DETECTION_RELEASE_CONFIG: ControlReleaseConfig = {
  minLosses: 2,
  baseChance: 0.1,
  chanceStep: 0.05,
  maxChance: 0.28,
  highControlDampening: 0.75,
  maxMultiplier: CONTROL_RELEASE_MAX_MULTIPLIER,
};

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
  if (isControlInterventionMiss(decision)) {
    return { ...predicted, controlled: false };
  }
  if (isControlPathNatural(decision)) {
    return { ...predicted, controlled: false };
  }
  if (!decision) {
    return enforceNaturalGlobalMemberDailyWinCap(tx, member, predicted, options);
  }
  const cappedDecision =
    decision.desired === 'WIN'
      ? await withWinCapBounds(tx, member, predicted, decision, gameId)
      : decision;
  if (
    !cappedDecision ||
    isControlInterventionMiss(cappedDecision) ||
    isControlPathNatural(cappedDecision)
  ) {
    return { ...predicted, controlled: false };
  }
  const predictedNetWin = isNetWin(predicted);
  const shouldForceProgressLoss = options.forceLossOnProgress === true && predicted.won;
  if (cappedDecision.desired === 'LOSS') {
    if (!predictedNetWin && !shouldForceProgressLoss) {
      return { ...predicted, controlled: false };
    }
    return flipToLoss(predicted, cappedDecision.reason, cappedDecision.controlId);
  }

  if (
    predictedNetWin &&
    !options.forceControlOnMatch &&
    !cappedDecision.forceWinAdjustment &&
    isWithinDecisionBounds(predicted, cappedDecision)
  ) {
    return { ...predicted, controlled: false };
  }
  return flipToWin(predicted, cappedDecision);
}

export async function applyGlobalMemberDailyWinCap(
  tx: Db,
  userId: string,
  predicted: PredictedResult,
  gameId?: string,
): Promise<ControlOutcome | null> {
  const member = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, agentId: true },
  });
  if (!member) return null;
  if (await shouldBypassGlobalMemberDailyWinCap(tx, member, gameId)) return null;

  const decision = await findGlobalMemberWinCapDecision(tx, member.id, predicted);
  if (isControlInterventionMiss(decision)) return null;
  if (isControlPathNatural(decision)) return null;
  if (!decision) return null;
  return decision.desired === 'LOSS'
    ? flipToLoss(predicted, decision.reason, decision.controlId)
    : flipToWin(predicted, decision);
}

export async function getGlobalMemberDailyWinCapGuard(
  tx: Db,
  userId: string,
  amount: Prisma.Decimal,
  gameId?: string,
): Promise<GlobalMemberDailyWinCapGuard | null> {
  const member = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, agentId: true },
  });
  if (!member || amount.lessThanOrEqualTo(0)) return null;
  if (await shouldBypassGlobalMemberDailyWinCap(tx, member, gameId)) return null;

  const bound = await getGlobalMemberWinCapPayoutBound(tx, member.id, amount);
  const controlId = 'global-member-daily-win-cap';
  const reason = 'global_member_daily_win_cap';
  if (bound.exhausted) {
    return null;
  }
  return {
    exhausted: false,
    controlId,
    reason,
    maxPayout: bound.bound,
    maxMultiplier: bound.bound.div(amount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN),
  };
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
  await completeDepositControlIfReached(tx, member, member.balance);
  await updateBurstControlUsage(tx, outcome, final);
  await updateWinLossBiteProgress(tx, member, final);
  if (shouldResetAutoBalanceAfterFinal(outcome, final)) {
    await resetMemberAutoBalanceControl(tx, {
      memberId: member.id,
      memberUsername: member.username,
      agentId: member.agentId,
      balanceAfter: member.balance,
      reason: 'burst_result',
      operatorUsername: 'auto_balance_model',
    });
  } else {
    await completeAutoBalanceControlIfReached(tx, member.id, member.balance);
  }
  await enforceAutoBalanceBankerGuard(tx, member, outcome);

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
          ...(outcome.burstCooldownRounds
            ? { burstCooldownRounds: outcome.burstCooldownRounds }
            : {}),
          result: finalResult,
        },
        flipReason: outcome.flipReason,
      },
    });
  }
}

function shouldResetAutoBalanceAfterFinal(
  outcome: ControlOutcome,
  final: FinalizedControlResult,
): boolean {
  return Boolean(
    outcome.controlled &&
    outcome.flipReason?.startsWith('burst_') &&
    final.payout.greaterThan(final.amount),
  );
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
): Promise<ControlDecisionLookup> {
  if (options.burstGuardOnly) {
    const burst = await findBurstDecision(tx, member, gameId, predicted, options);
    if (isControlInterventionMiss(burst)) return null;
    if (burst) return burst;
    const accidentalBurstCap = findAccidentalBurstCapDecision(predicted);
    if (accidentalBurstCap) return accidentalBurstCap;
    if (!(await shouldBypassGlobalMemberDailyWinCap(tx, member, gameId))) {
      const globalWinCap = await findGlobalMemberWinCapDecision(tx, member.id, predicted, options);
      if (isControlInterventionMiss(globalWinCap)) return CONTROL_INTERVENTION_MISS;
      if (globalWinCap) return globalWinCap;
    }
    return null;
  }

  const isControlExcludedLine = await isMemberInControlExcludedLine(tx, member);

  const burst = await findBurstDecision(tx, member, gameId, predicted, options);
  if (isControlInterventionMiss(burst)) return null;
  if (burst) return burst;

  const onlineReward = await findOnlineRewardNextWinDecision(tx, member, predicted);
  if (isControlInterventionMiss(onlineReward)) return null;
  if (isControlPathNatural(onlineReward)) return CONTROL_PATH_NATURAL;
  if (onlineReward) return onlineReward;

  const targetedWinLoss = await findWinLossDecision(tx, member, predicted, 'targeted');
  if (isControlInterventionMiss(targetedWinLoss)) return null;
  if (isControlPathNatural(targetedWinLoss)) return CONTROL_PATH_NATURAL;
  if (targetedWinLoss?.desired === 'WIN' && targetedWinLoss.reason === 'win_control') {
    return targetedWinLoss;
  }

  const explicitWinLoss =
    targetedWinLoss ??
    (await findWinLossDecision(tx, member, predicted, isControlExcludedLine ? 'targeted' : 'all'));
  if (isControlInterventionMiss(explicitWinLoss)) return null;
  if (isControlPathNatural(explicitWinLoss)) return CONTROL_PATH_NATURAL;
  if (explicitWinLoss) return explicitWinLoss;

  const memberCap = await findMemberWinCapDecision(tx, member.id, predicted);
  if (memberCap) return memberCap;

  const agentLineCap = await findAgentLineCapDecision(tx, member.agentId, predicted);
  if (agentLineCap) return agentLineCap;

  let stopAfterDepositMiss = false;
  const depositControl = await findDepositControlDecisionLookup(tx, member, predicted);
  if (isControlPathNatural(depositControl)) return CONTROL_PATH_NATURAL;
  if (isControlInterventionMiss(depositControl)) {
    const accidentalBurstCap = findAccidentalBurstCapDecision(predicted);
    if (accidentalBurstCap) return accidentalBurstCap;
    stopAfterDepositMiss = true;
  }
  if (depositControl) return depositControl;

  if (!stopAfterDepositMiss) {
    const targetedManual = await findManualDetectionDecision(tx, member, predicted, 'targeted');
    if (isControlInterventionMiss(targetedManual)) return null;
    if (targetedManual) return targetedManual;

    const globalManual = await findManualDetectionDecision(tx, member, predicted, 'global');
    if (isControlInterventionMiss(globalManual)) return null;
    if (globalManual) return globalManual;
  } else {
    return CONTROL_PATH_NATURAL;
  }

  const existingAutoBalance = await findAutoBalanceDecisionInternal(tx, member, predicted, 'any', {
    existingOnly: true,
  });
  if (existingAutoBalance.decision) return existingAutoBalance.decision;
  if (existingAutoBalance.pathNatural || existingAutoBalance.inActiveCycle) {
    return CONTROL_PATH_NATURAL;
  }

  if (!(await shouldBypassGlobalMemberDailyWinCap(tx, member, gameId))) {
    const globalWinCap = await findGlobalMemberWinCapDecision(tx, member.id, predicted, options);
    if (isControlInterventionMiss(globalWinCap)) return CONTROL_INTERVENTION_MISS;
    if (isControlPathNatural(globalWinCap)) return CONTROL_PATH_NATURAL;
    if (globalWinCap) return globalWinCap;
  }

  const accidentalBurstCap = findAccidentalBurstCapDecision(predicted);
  if (accidentalBurstCap) return accidentalBurstCap;

  return null;
}

type WinLossDecisionScope = 'all' | 'member' | 'agent_line' | 'targeted' | 'global';

interface RankableWinLossControl {
  controlMode: string;
  targetId: string | null;
  winControl: boolean;
  lossControl: boolean;
  createdAt: Date;
}

/**
 * 純函式：依「指定範圍精確度」排出控制優先序並回傳最高者。
 * 舊版控制主線：會員贏 > 代理線贏 > 會員輸 > 代理線輸 > 全域。
 * 關鍵不變式：優先級 1-2 的贏控制不被後面的輸控制/封頂/入金/手動偵測破壞；
 * 同優先序時取較新建立者。
 */
export function rankWinLossControls<T extends RankableWinLossControl>(
  controls: T[],
  memberId: string,
  ancestors: string[],
  scope: WinLossDecisionScope = 'all',
): { control: T; priority: number; desired: 'WIN' | 'LOSS' } | null {
  const ranked = controls
    .map((control) => {
      if (
        (scope === 'all' || scope === 'member' || scope === 'targeted') &&
        control.controlMode === 'SINGLE_MEMBER' &&
        control.targetId === memberId
      ) {
        if (control.winControl) return { control, priority: 1, desired: 'WIN' as const };
        if (control.lossControl) return { control, priority: 50, desired: 'LOSS' as const };
      }

      if (
        (scope === 'all' || scope === 'agent_line' || scope === 'targeted') &&
        control.controlMode === 'AGENT_LINE' &&
        control.targetId &&
        ancestors.includes(control.targetId)
      ) {
        // 帶寬 30 完整涵蓋 getAgentAncestors 的最深 20 層，保留「較近上線優先」的
        // 精確排序；AGENT_WIN(10-39) 永遠高於 MEMBER_LOSS(50)，符合舊版帶牌邏輯。
        const depth = Math.min(ancestors.indexOf(control.targetId), 29);
        if (control.winControl) return { control, priority: 10 + depth, desired: 'WIN' as const };
        if (control.lossControl) return { control, priority: 60 + depth, desired: 'LOSS' as const };
      }

      if (
        (scope === 'all' || scope === 'global') &&
        (control.controlMode === 'AUTO_DETECT' || control.controlMode === 'NORMAL')
      ) {
        if (control.winControl) return { control, priority: 80, desired: 'WIN' as const };
        if (control.lossControl) return { control, priority: 81, desired: 'LOSS' as const };
      }

      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort(
      (a, b) =>
        a.priority - b.priority || b.control.createdAt.getTime() - a.control.createdAt.getTime(),
    );

  return ranked[0] ?? null;
}

async function findWinLossDecision(
  tx: Db,
  member: MemberScope,
  predicted: PredictedResult,
  scope: WinLossDecisionScope = 'all',
): Promise<ControlDecisionLookup> {
  const controls = await tx.winLossControl.findMany({
    where: { isActive: true, isCompleted: false },
    orderBy: { createdAt: 'desc' },
  });
  if (controls.length === 0) return null;

  const ancestors = member.agentId ? await getAgentAncestors(tx, member.agentId) : [];
  const selected = rankWinLossControls(controls, member.id, ancestors, scope);
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
  if (!passesControlInterventionRate(selected.control.controlPercentage)) {
    return CONTROL_INTERVENTION_MISS;
  }

  if (selected.desired === 'LOSS') {
    const release = await getLossControlReleasePlan(
      tx,
      selected.control.id,
      member.id,
      predicted,
      selected.control.controlPercentage,
    );
    if (release) {
      return {
        desired: 'WIN',
        controlId: selected.control.id,
        reason: 'loss_control_release',
        minMultiplier: new Prisma.Decimal('1.01'),
        maxMultiplier: release.maxMultiplier,
        maxPayout: release.maxPayout,
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

interface AutoBalanceDecisionResult {
  decision: ControlDecision | null;
  inActiveCycle: boolean;
  pathNatural?: boolean;
}

async function findAutoBalanceDecision(
  tx: Db,
  member: MemberScope,
  predicted: PredictedResult,
): Promise<ControlDecision | null> {
  return (await findAutoBalanceDecisionInternal(tx, member, predicted, 'any')).decision;
}

async function findAutoBalanceReviveDecision(
  tx: Db,
  member: MemberScope,
  predicted: PredictedResult,
): Promise<AutoBalanceDecisionResult> {
  return findAutoBalanceDecisionInternal(tx, member, predicted, 'reviveOnly');
}

async function findAutoBalanceDecisionInternal(
  tx: Db,
  member: MemberScope,
  predicted: PredictedResult,
  mode: 'any' | 'reviveOnly',
  options: { existingOnly?: boolean } = {},
): Promise<AutoBalanceDecisionResult> {
  const autoBalanceDelegate = (
    tx as unknown as {
      memberAutoBalanceControl?: {
        findUnique?: (args: unknown) => Promise<AutoBalanceControlRecord | null>;
      };
    }
  ).memberAutoBalanceControl;
  if (options.existingOnly && !autoBalanceDelegate?.findUnique) {
    return { decision: null, inActiveCycle: false };
  }

  const currentUser = await tx.user.findUnique({
    where: { id: member.id },
    select: { id: true, username: true, agentId: true, balance: true },
  });
  if (!currentUser || !currentUser.balance || currentUser.balance.lessThanOrEqualTo(0)) {
    return { decision: null, inActiveCycle: false };
  }

  if (await isAutoBalanceExcludedAgentLine(tx, currentUser.agentId)) {
    await tx.memberAutoBalanceControl.updateMany({
      where: { memberId: currentUser.id, isActive: true },
      data: { isActive: false, resetReason: 'auto_balance_excluded' },
    });
    return { decision: null, inActiveCycle: false };
  }

  let control =
    options.existingOnly || mode === 'reviveOnly'
      ? await tx.memberAutoBalanceControl.findUnique({ where: { memberId: currentUser.id } })
      : await getOrCreateMemberAutoBalanceControl(tx, currentUser);
  if (!control || !control.isActive) return { decision: null, inActiveCycle: false };
  const lifecycleSteps = parseDepositLifecycleSteps(
    (control as AutoBalanceControlRecord).lifecycleSteps ?? null,
  );
  if (lifecycleSteps.length > 0) {
    return buildAutoBalanceLifecycleDecision(
      tx,
      currentUser,
      predicted,
      control as AutoBalanceControlRecord,
      lifecycleSteps,
      mode,
    );
  }

  if (control.phase === 'DRAIN_TO_ZERO') {
    const lossDecision = autoBalanceLossDecision(
      control.id,
      'auto_balance_drain',
      (control as AutoBalanceControlRecord).controlPercentage,
    );
    const pathGuard = legacyAutoBalancePathGuardDecision(control, currentUser.balance, predicted);
    return {
      decision: lossDecision ?? pathGuard,
      inActiveCycle: true,
      pathNatural: !lossDecision && !pathGuard,
    };
  }

  if (currentUser.balance.lessThanOrEqualTo(control.biteTargetBalance)) {
    if (control.phase !== 'REVIVE_TO_70') {
      control = await setMemberAutoBalancePhase(tx, control.id, 'REVIVE_TO_70');
    }
  }

  if (control.phase === 'REVIVE_TO_70') {
    const remaining = control.reviveTargetBalance.sub(currentUser.balance).toDecimalPlaces(2);
    if (remaining.lessThanOrEqualTo(0)) {
      control = await setMemberAutoBalancePhase(tx, control.id, 'DRAIN_TO_ZERO');
      const lossDecision = autoBalanceLossDecision(
        control.id,
        'auto_balance_drain',
        (control as AutoBalanceControlRecord).controlPercentage,
      );
      const pathGuard = legacyAutoBalancePathGuardDecision(control, currentUser.balance, predicted);
      return {
        decision: lossDecision ?? pathGuard,
        inActiveCycle: true,
        pathNatural: !lossDecision && !pathGuard,
      };
    }

    const pathGuard = legacyAutoBalancePathGuardDecision(control, currentUser.balance, predicted);
    if (
      Math.random() >=
      autoBalanceInterventionRate((control as AutoBalanceControlRecord).controlPercentage, 'WIN')
    ) {
      return { decision: pathGuard, inActiveCycle: true, pathNatural: !pathGuard };
    }

    return {
      decision: {
        desired: 'WIN',
        controlId: control.id,
        reason: 'auto_balance_revive',
        minMultiplier: new Prisma.Decimal('1.01'),
        maxPayout: predicted.amount.add(remaining).toDecimalPlaces(2),
        forceWinAdjustment: true,
      },
      inActiveCycle: true,
    };
  }

  if (mode === 'reviveOnly') return { decision: null, inActiveCycle: false };
  const lossDecision = autoBalanceLossDecision(
    control.id,
    'auto_balance_bite',
    (control as AutoBalanceControlRecord).controlPercentage,
  );
  const pathGuard = legacyAutoBalancePathGuardDecision(control, currentUser.balance, predicted);
  return {
    decision: lossDecision ?? pathGuard,
    inActiveCycle: true,
    pathNatural: !lossDecision && !pathGuard,
  };
}

async function buildAutoBalanceLifecycleDecision(
  tx: Db,
  currentUser: { id: string; username: string; agentId: string | null; balance: Prisma.Decimal },
  predicted: PredictedResult,
  control: AutoBalanceControlRecord,
  steps: number[],
  mode: 'any' | 'reviveOnly',
): Promise<AutoBalanceDecisionResult> {
  const resolved = await advanceAutoBalanceLifecycleIfReached(
    tx,
    control,
    currentUser.balance,
    steps,
  );
  if (resolved.completed || resolved.targetPercent === null) {
    return { decision: null, inActiveCycle: false };
  }
  if (resolved.direction !== 'WIN' && mode === 'reviveOnly') {
    return { decision: null, inActiveCycle: false };
  }
  if (resolved.direction === 'LOSS') {
    const reason = resolved.currentStageIndex <= 0 ? 'auto_balance_bite' : 'auto_balance_drain';
    const pathGuard = lifecyclePathGuardDecision({
      controlId: resolved.control.id,
      reason: 'auto_balance_path_guard',
      startBalance: resolved.control.baselineBalance,
      currentBalance: currentUser.balance,
      fromPercent: resolved.fromPercent,
      targetPercent: resolved.targetPercent,
      predicted,
    });
    const lossDecision = autoBalanceLossDecision(
      resolved.control.id,
      reason,
      resolved.control.controlPercentage,
    );
    return {
      decision: lossDecision ?? pathGuard,
      inActiveCycle: true,
      pathNatural: !lossDecision && !pathGuard,
    };
  }
  if (resolved.direction !== 'WIN') {
    return { decision: null, inActiveCycle: true };
  }
  const remaining = Prisma.Decimal.max(resolved.targetBalance.sub(currentUser.balance), ZERO);
  if (remaining.lessThanOrEqualTo(0)) return { decision: null, inActiveCycle: true };
  const pathGuard = lifecyclePathGuardDecision({
    controlId: resolved.control.id,
    reason: 'auto_balance_path_guard',
    startBalance: resolved.control.baselineBalance,
    currentBalance: currentUser.balance,
    fromPercent: resolved.fromPercent,
    targetPercent: resolved.targetPercent,
    predicted,
  });
  if (Math.random() >= autoBalanceInterventionRate(resolved.control.controlPercentage, 'WIN')) {
    return { decision: pathGuard, inActiveCycle: true, pathNatural: !pathGuard };
  }
  return {
    decision: {
      desired: 'WIN',
      controlId: resolved.control.id,
      reason: 'auto_balance_revive',
      minMultiplier: new Prisma.Decimal('1.01'),
      maxPayout: predicted.amount.add(remaining).toDecimalPlaces(2),
      forceWinAdjustment: true,
    },
    inActiveCycle: true,
  };
}

async function advanceAutoBalanceLifecycleIfReached(
  tx: Db,
  control: AutoBalanceControlRecord,
  currentBalance: Prisma.Decimal,
  steps: number[],
): Promise<{
  control: AutoBalanceControlRecord;
  completed: boolean;
  direction: 'WIN' | 'LOSS' | 'HOLD';
  fromPercent: number;
  targetPercent: number | null;
  targetBalance: Prisma.Decimal;
  currentStageIndex: number;
}> {
  let stageIndex = Math.max(0, control.currentStageIndex ?? 0);
  let fromPercent = stageIndex === 0 ? 100 : (steps[stageIndex - 1] ?? 100);
  let targetPercent = steps[stageIndex] ?? null;
  let direction = resolveLifecycleDirection(fromPercent, targetPercent);
  let targetBalance =
    targetPercent === null
      ? currentBalance
      : lifecycleBalanceForPercent(control.baselineBalance, targetPercent);

  while (
    targetPercent !== null &&
    isLifecycleStageReached(
      control.baselineBalance,
      currentBalance,
      fromPercent,
      targetPercent,
      direction,
    )
  ) {
    stageIndex += 1;
    fromPercent = stageIndex === 0 ? 100 : (steps[stageIndex - 1] ?? 100);
    targetPercent = steps[stageIndex] ?? null;
    direction = resolveLifecycleDirection(fromPercent, targetPercent);
    targetBalance =
      targetPercent === null
        ? currentBalance
        : lifecycleBalanceForPercent(control.baselineBalance, targetPercent);
  }

  const completed = targetPercent === null;
  const lastBalance = control.lastBalance ?? ZERO;
  if (
    stageIndex !== (control.currentStageIndex ?? 0) ||
    !currentBalance.equals(lastBalance) ||
    (completed && !control.lifecycleCompletedAt)
  ) {
    const updated = await tx.memberAutoBalanceControl.update({
      where: { id: control.id },
      data: {
        currentStageIndex: stageIndex,
        lifecycleCompletedAt: completed ? new Date() : null,
        lastBalance: currentBalance,
        isActive: completed ? false : control.isActive,
        phase:
          completed || direction === 'LOSS'
            ? AutoBalancePhase.DRAIN_TO_ZERO
            : direction === 'WIN'
              ? AutoBalancePhase.REVIVE_TO_70
              : control.phase,
      },
    });
    control = updated as AutoBalanceControlRecord;
  }

  return {
    control,
    completed,
    direction,
    fromPercent,
    targetPercent,
    targetBalance,
    currentStageIndex: stageIndex,
  };
}

function autoBalanceLossDecision(
  controlId: string,
  reason: 'auto_balance_bite' | 'auto_balance_drain' = 'auto_balance_bite',
  controlPercentage?: number | null,
): ControlDecision | null {
  if (!passesAutoBalanceLossInterventionRate(reason, controlPercentage)) {
    return null;
  }

  return { desired: 'LOSS', controlId, reason };
}

function passesAutoBalanceLossInterventionRate(
  reason: 'auto_balance_bite' | 'auto_balance_drain' = 'auto_balance_bite',
  controlPercentage?: number | null,
): boolean {
  return Math.random() < autoBalanceInterventionRate(controlPercentage, 'LOSS', reason);
}

function autoBalanceInterventionRate(
  controlPercentage: number | null | undefined,
  direction: 'WIN' | 'LOSS',
  reason: 'auto_balance_bite' | 'auto_balance_drain' = 'auto_balance_bite',
): number {
  if (typeof controlPercentage === 'number' && Number.isFinite(controlPercentage)) {
    return Math.min(100, Math.max(1, controlPercentage)) / 100;
  }
  if (direction === 'WIN') return AUTO_BALANCE_REVIVE_INTERVENTION_RATE;
  return reason === 'auto_balance_drain'
    ? AUTO_BALANCE_DRAIN_INTERVENTION_RATE
    : AUTO_BALANCE_BITE_INTERVENTION_RATE;
}

async function getLossControlReleasePlan(
  tx: Db,
  controlId: string,
  userId: string,
  predicted: PredictedResult,
  controlPercentage: Prisma.Decimal,
): Promise<ControlReleasePlan | null> {
  const window = getControlGameDayWindow();
  const logs = await tx.winLossControlLogs.findMany({
    where: {
      controlId,
      userId,
      createdAt: { gte: window.start, lt: window.end },
      flipReason: { in: ['loss_control', 'loss_control_release'] },
    },
    orderBy: { createdAt: 'desc' },
    take: CONTROL_RELEASE_LOG_WINDOW,
    select: { flipReason: true, finalResult: true },
  });

  return resolveControlReleasePlan(
    logs,
    predicted,
    LOSS_CONTROL_RELEASE_CONFIG,
    'loss_control_release',
    ['loss_control'],
    controlPercentage,
  );
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
  options: ControlOptions = {},
): Promise<ControlDecisionLookup> {
  const predictedProfit = predicted.payout.sub(predicted.amount);
  if (!predictedProfit.greaterThan(0)) {
    if (!options.forceLossOnProgress || !predicted.won) return null;

    const stats = await getMemberTodayStats(tx, memberId);
    return stats.net.greaterThanOrEqualTo(GLOBAL_MEMBER_DAILY_WIN_CAP)
      ? globalMemberDailyWinCapDrainDecision()
      : null;
  }

  const stats = await getMemberTodayStats(tx, memberId);
  const projected = stats.net.add(predictedProfit);
  const remainingProfit = GLOBAL_MEMBER_DAILY_WIN_CAP.sub(stats.net).toDecimalPlaces(2);
  if (
    stats.net.greaterThanOrEqualTo(GLOBAL_MEMBER_DAILY_WIN_CAP) ||
    remainingProfit.lessThanOrEqualTo(0)
  ) {
    return globalMemberDailyWinCapDrainDecision();
  }
  if (projected.greaterThan(GLOBAL_MEMBER_DAILY_WIN_CAP)) {
    return {
      desired: 'WIN',
      controlId: 'global-member-daily-win-cap',
      reason: 'global_member_daily_win_cap',
      minMultiplier: new Prisma.Decimal('1.0001'),
      maxPayout: predicted.amount.add(remainingProfit).toDecimalPlaces(2),
      forceWinAdjustment: true,
      gameMatchedPayoutOnly: true,
    };
  }
  return null;
}

function globalMemberDailyWinCapDrainDecision(): ControlDecisionLookup {
  if (Math.random() >= GLOBAL_MEMBER_DAILY_WIN_CAP_DRAIN_INTERVENTION_RATE) {
    return CONTROL_INTERVENTION_MISS;
  }

  return {
    desired: 'LOSS',
    controlId: 'global-member-daily-win-cap',
    reason: 'global_member_daily_win_cap',
  };
}

async function enforceNaturalGlobalMemberDailyWinCap(
  tx: Db,
  member: MemberScope,
  predicted: PredictedResult,
  options: ControlOptions,
): Promise<ControlOutcome> {
  const decision = await findGlobalMemberWinCapDecision(tx, member.id, predicted, options);
  if (isControlInterventionMiss(decision)) return { ...predicted, controlled: false };
  if (isControlPathNatural(decision)) return { ...predicted, controlled: false };
  if (!decision) return { ...predicted, controlled: false };

  const predictedNetWin = isNetWin(predicted);
  const shouldForceProgressLoss = options.forceLossOnProgress === true && predicted.won;
  if (decision.desired === 'LOSS') {
    if (!predictedNetWin && !shouldForceProgressLoss) {
      return { ...predicted, controlled: false };
    }
    return flipToLoss(predicted, decision.reason, decision.controlId);
  }
  return flipToWin(predicted, decision);
}

async function shouldBypassGlobalMemberDailyWinCap(
  tx: Db,
  member: MemberScope,
  gameId?: string,
): Promise<boolean> {
  if (await hasActiveDepositControlForGlobalCapBypass(tx, member.id)) return true;
  if (gameId && (await hasActiveBurstControlForGlobalCapBypass(tx, member, gameId))) return true;
  if (await hasActiveAutoBalanceControlForGlobalCapBypass(tx, member.id)) return true;
  return false;
}

async function hasActiveDepositControlForGlobalCapBypass(
  tx: Db,
  memberId: string,
): Promise<boolean> {
  const member = await tx.user.findUnique({
    where: { id: memberId },
    select: { id: true, username: true, agentId: true, balance: true },
  });
  if (!member || !(member as { balance?: Prisma.Decimal }).balance) return false;

  const control = await findApplicableDepositControl(tx, member);
  if (!control) return false;

  const steps = parseDepositLifecycleSteps(control.lifecycleSteps);
  if (steps.length > 0) {
    const state = await getOrCreateDepositLifecycleState(tx, control, member, member.balance);
    if (!state) return false;
    const resolved = await advanceDepositLifecycleStateIfReached(
      tx,
      control,
      state,
      member.balance,
      steps,
    );
    return !resolved.completed;
  }

  const currentProfit = member.balance.sub(control.startBalance);
  if (currentProfit.greaterThanOrEqualTo(control.targetProfit)) {
    await tx.memberDepositControl.update({
      where: { id: control.id },
      data: { isActive: false, isCompleted: true },
    });
    return false;
  }
  return true;
}

async function hasActiveBurstControlForGlobalCapBypass(
  tx: Db,
  member: MemberScope,
  gameId: string,
): Promise<boolean> {
  const db = tx as unknown as {
    burstControl?: {
      findMany?: (args: unknown) => Promise<unknown[]>;
      update?: (args: unknown) => Promise<unknown>;
    };
    winLossControlLogs?: {
      findMany?: (args: unknown) => Promise<unknown[]>;
    };
  };
  if (!BURST_ELIGIBLE_GAME_IDS.has(gameId) || !db.burstControl?.findMany) return false;

  const applicable = await findApplicableBurstControl(tx, member, gameId);
  if (!applicable) return false;
  const control = await normalizeBurstControlDay(tx, applicable.control);
  const memberBurstProfit = await sumMemberBurstProfit(tx, control.id, member.id);
  return (
    control.dailyBudget.sub(control.todayBurstAmount).greaterThan(0) &&
    control.memberDailyCap.sub(memberBurstProfit).greaterThan(0)
  );
}

async function hasActiveAutoBalanceControlForGlobalCapBypass(
  tx: Db,
  memberId: string,
): Promise<boolean> {
  const delegate = (tx as unknown as { memberAutoBalanceControl?: unknown })
    .memberAutoBalanceControl as
    | {
        findUnique?: (args: unknown) => Promise<AutoBalanceControlRecord | null>;
      }
    | undefined;
  if (!delegate?.findUnique) return false;
  const control = await delegate.findUnique({ where: { memberId } });
  return Boolean(control?.isActive && !control.lifecycleCompletedAt);
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
  gameId?: string,
): Promise<ControlDecisionLookup> {
  if (decision.desired !== 'WIN') return decision;

  const maxPayouts: Prisma.Decimal[] = [];
  // 各 cap 翻成 LOSS 時，須回報「實際綁住的那個 cap 的 controlId」與對應 reason，
  // 否則審計日誌會把虧損歸因到原始 WIN 控制(controlId 與 flipReason 不一致)。
  if (!(await shouldBypassGlobalMemberDailyWinCap(tx, member, gameId))) {
    const globalBound = await getGlobalMemberWinCapPayoutBound(tx, member.id, predicted.amount);
    if (globalBound.exhausted) {
      return globalMemberDailyWinCapDrainDecision();
    }
    maxPayouts.push(globalBound.bound);
  }

  const memberBound = await getMemberWinCapPayoutBound(tx, member.id, predicted.amount);
  if (memberBound?.exhausted) {
    return { desired: 'LOSS', controlId: memberBound.controlId, reason: 'win_cap' };
  }
  if (memberBound?.bound) maxPayouts.push(memberBound.bound);

  const agentBound = await getAgentLineCapPayoutBound(tx, member.agentId, predicted.amount);
  if (agentBound?.exhausted) {
    return { desired: 'LOSS', controlId: agentBound.controlId, reason: 'agent_line_cap' };
  }
  if (agentBound?.bound) maxPayouts.push(agentBound.bound);

  if (maxPayouts.length === 0) return decision;
  const capPayout = minDecimal(maxPayouts);
  return {
    ...decision,
    maxPayout: decision.maxPayout ? minDecimal([decision.maxPayout, capPayout]) : capPayout,
  };
}

type CapPayoutBound =
  | { exhausted: true; controlId: string }
  | { exhausted: false; bound: Prisma.Decimal };

async function getGlobalMemberWinCapPayoutBound(
  tx: Db,
  memberId: string,
  amount: Prisma.Decimal,
): Promise<CapPayoutBound> {
  const stats = await getMemberTodayStats(tx, memberId);
  const remainingProfit = GLOBAL_MEMBER_DAILY_WIN_CAP.sub(stats.net);
  if (remainingProfit.lessThanOrEqualTo(0)) {
    return { exhausted: true, controlId: 'global-member-daily-win-cap' };
  }
  return { exhausted: false, bound: amount.add(remainingProfit).toDecimalPlaces(2) };
}

async function getMemberWinCapPayoutBound(
  tx: Db,
  memberId: string,
  amount: Prisma.Decimal,
): Promise<CapPayoutBound | undefined> {
  const control = await tx.memberWinCapControl.findFirst({
    where: { memberId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!control) return undefined;

  const normalized = await normalizeMemberWinCapDay(tx, control);
  const remainingProfit = normalized.winCapAmount.sub(normalized.todayWinAmount);
  if (remainingProfit.lessThanOrEqualTo(0)) {
    return { exhausted: true, controlId: normalized.id };
  }
  return { exhausted: false, bound: amount.add(remainingProfit).toDecimalPlaces(2) };
}

async function getAgentLineCapPayoutBound(
  tx: Db,
  agentId: string | null,
  amount: Prisma.Decimal,
): Promise<CapPayoutBound | undefined> {
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
    if (remainingProfit.lessThanOrEqualTo(0)) {
      return { exhausted: true, controlId: normalized.id };
    }
    bounds.push(amount.add(remainingProfit).toDecimalPlaces(2));
  }
  return { exhausted: false, bound: minDecimal(bounds) };
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

async function findOnlineRewardNextWinDecision(
  tx: Db,
  member: MemberScope,
  predicted: PredictedResult,
): Promise<ControlDecisionLookup> {
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

async function findDepositControlDecision(
  tx: Db,
  member: MemberScope,
  predicted: PredictedResult,
): Promise<ControlDecision | null> {
  const result = await findDepositControlDecisionLookup(tx, member, predicted);
  return isControlInterventionMiss(result) || isControlPathNatural(result) ? null : result;
}

async function findDepositControlDecisionLookup(
  tx: Db,
  member: MemberScope,
  predicted: PredictedResult,
): Promise<ControlDecisionLookup> {
  const control = await findApplicableDepositControl(tx, member);
  if (!control) return null;
  const steps = parseDepositLifecycleSteps(control.lifecycleSteps);
  if (steps.length > 0) return buildDepositLifecycleDecision(tx, member, predicted, control, steps);
  return buildDepositDecision(tx, member, predicted, control);
}

async function findApplicableDepositControl(
  tx: Db,
  member: MemberScope,
): Promise<DepositControlRecord | null> {
  const delegate = (tx as unknown as { memberDepositControl?: unknown }).memberDepositControl as
    | {
        findMany?: (args: unknown) => Promise<DepositControlRecord[]>;
        findFirst?: (args: unknown) => Promise<DepositControlRecord | null>;
      }
    | undefined;
  if (!delegate) return null;
  const select = {
    id: true,
    scope: true,
    memberId: true,
    memberUsername: true,
    targetAgentId: true,
    startBalance: true,
    targetProfit: true,
    controlWinRate: true,
    lifecycleSteps: true,
    notes: true,
    createdAt: true,
  };

  if (!delegate.findMany) {
    const legacy = await delegate.findFirst?.({
      where: {
        memberId: member.id,
        isActive: true,
        isCompleted: false,
        OR: [{ notes: null }, { NOT: { notes: { contains: 'online_reward' } } }],
      },
      orderBy: { createdAt: 'desc' },
      select,
    });
    return legacy
      ? {
          ...legacy,
          scope: legacy.scope ?? 'MEMBER',
          memberId: legacy.memberId ?? member.id,
          memberUsername: legacy.memberUsername ?? member.username,
          targetAgentId: legacy.targetAgentId ?? null,
          lifecycleSteps: legacy.lifecycleSteps ?? null,
          createdAt: legacy.createdAt ?? new Date(0),
        }
      : null;
  }

  const controls = await delegate.findMany({
    where: {
      isActive: true,
      isCompleted: false,
      AND: [
        { OR: [{ notes: null }, { NOT: { notes: { contains: 'online_reward' } } }] },
        { OR: [{ notes: null }, { NOT: { notes: { contains: 'auto_revive' } } }] },
      ],
      OR: [
        { scope: 'MEMBER', memberId: member.id },
        { scope: 'AGENT_LINE', targetAgentId: { not: null } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select,
  });
  if (controls.length === 0) return null;

  const memberControl = controls.find((control) => control.scope === 'MEMBER');
  if (memberControl) return memberControl;

  const ancestors = member.agentId ? await getAgentAncestors(tx, member.agentId) : [];
  return (
    controls
      .filter(
        (control) =>
          control.scope === 'AGENT_LINE' &&
          control.targetAgentId &&
          ancestors.includes(control.targetAgentId),
      )
      .map((control) => ({
        control,
        depth: ancestors.indexOf(control.targetAgentId as string),
      }))
      .sort(
        (a, b) =>
          a.depth - b.depth || b.control.createdAt.getTime() - a.control.createdAt.getTime(),
      )[0]?.control ?? null
  );
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
): Promise<ControlDecisionLookup> {
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
  const rate = clampRate(control.controlWinRate);
  const roll = Math.random();
  const isRegularDepositControl = !isAutoRevive && !isOnlineRewardNextWin;
  if (isRegularDepositControl && roll >= rate) {
    return CONTROL_INTERVENTION_MISS;
  }
  const desired = isRegularDepositControl || roll < rate ? 'WIN' : 'LOSS';
  const maxPayout =
    isAutoRevive || isOnlineRewardNextWin
      ? predicted.amount.add(remainingProfit).toDecimalPlaces(2)
      : undefined;
  const targetMultiplier =
    isOnlineRewardNextWin && maxPayout && predicted.amount.greaterThan(0)
      ? maxPayout.div(predicted.amount).toDecimalPlaces(4)
      : undefined;

  return {
    desired,
    controlId: control.id,
    reason: isOnlineRewardNextWin ? 'online_reward_next_win' : 'deposit_control',
    minMultiplier:
      targetMultiplier && targetMultiplier.greaterThan(1) ? targetMultiplier : undefined,
    maxPayout,
    forceWinAdjustment: isOnlineRewardNextWin,
  };
}

async function buildDepositLifecycleDecision(
  tx: Db,
  member: MemberScope,
  predicted: PredictedResult,
  control: DepositControlRecord,
  steps: number[],
): Promise<ControlDecisionLookup> {
  const currentUser = await tx.user.findUnique({
    where: { id: member.id },
    select: { id: true, username: true, agentId: true, balance: true },
  });
  if (!currentUser || currentUser.balance.lessThanOrEqualTo(0)) return null;

  const state = await getOrCreateDepositLifecycleState(
    tx,
    control,
    currentUser,
    currentUser.balance,
  );
  if (!state) return null;

  const resolved = await advanceDepositLifecycleStateIfReached(
    tx,
    control,
    state,
    currentUser.balance,
    steps,
  );
  if (resolved.completed || resolved.targetPercent === null) return null;
  const pathGuard = lifecyclePathGuardDecision({
    controlId: control.id,
    reason: 'deposit_lifecycle_path_guard',
    startBalance: resolved.state.startBalance,
    currentBalance: currentUser.balance,
    fromPercent: resolved.fromPercent,
    targetPercent: resolved.targetPercent,
    predicted,
  });
  if (Math.random() >= clampRate(control.controlWinRate)) {
    return pathGuard ?? CONTROL_PATH_NATURAL;
  }

  if (resolved.direction === 'LOSS') {
    return { desired: 'LOSS', controlId: control.id, reason: 'deposit_control' };
  }

  if (resolved.direction !== 'WIN') return null;

  const remaining = Prisma.Decimal.max(resolved.targetBalance.sub(currentUser.balance), ZERO);
  if (remaining.lessThanOrEqualTo(0)) return null;
  return {
    desired: 'WIN',
    controlId: control.id,
    reason: 'deposit_control',
    minMultiplier: new Prisma.Decimal('1.01'),
    maxPayout: predicted.amount.add(remaining).toDecimalPlaces(2),
    forceWinAdjustment: true,
  };
}

async function getOrCreateDepositLifecycleState(
  tx: Db,
  control: DepositControlRecord,
  member: { id: string; username: string; balance: Prisma.Decimal },
  currentBalance: Prisma.Decimal,
): Promise<DepositLifecycleStateRecord | null> {
  const existing = await tx.memberDepositLifecycleState.findUnique({
    where: { controlId_memberId: { controlId: control.id, memberId: member.id } },
  });
  if (existing) return existing;

  const startBalance = control.scope === 'MEMBER' ? control.startBalance : currentBalance;
  if (startBalance.lessThanOrEqualTo(0)) return null;
  return tx.memberDepositLifecycleState.create({
    data: {
      controlId: control.id,
      memberId: member.id,
      memberUsername: member.username,
      startBalance,
      currentStageIndex: 0,
      lastBalance: currentBalance,
    },
  });
}

async function advanceDepositLifecycleStateIfReached(
  tx: Db,
  control: Pick<DepositControlRecord, 'id' | 'scope'>,
  state: DepositLifecycleStateRecord,
  currentBalance: Prisma.Decimal,
  steps: number[],
): Promise<{
  state: DepositLifecycleStateRecord;
  completed: boolean;
  direction: 'WIN' | 'LOSS' | 'HOLD';
  fromPercent: number;
  targetPercent: number | null;
  targetBalance: Prisma.Decimal;
}> {
  let stageIndex = state.currentStageIndex;
  let fromPercent = stageIndex === 0 ? 100 : (steps[stageIndex - 1] ?? 100);
  let targetPercent = steps[stageIndex] ?? null;
  let direction = resolveLifecycleDirection(fromPercent, targetPercent);
  let targetBalance =
    targetPercent === null
      ? currentBalance
      : lifecycleBalanceForPercent(state.startBalance, targetPercent);

  while (
    targetPercent !== null &&
    isLifecycleStageReached(
      state.startBalance,
      currentBalance,
      fromPercent,
      targetPercent,
      direction,
    )
  ) {
    stageIndex += 1;
    fromPercent = stageIndex === 0 ? 100 : (steps[stageIndex - 1] ?? 100);
    targetPercent = steps[stageIndex] ?? null;
    direction = resolveLifecycleDirection(fromPercent, targetPercent);
    targetBalance =
      targetPercent === null
        ? currentBalance
        : lifecycleBalanceForPercent(state.startBalance, targetPercent);
  }

  const completed = targetPercent === null;
  if (
    stageIndex !== state.currentStageIndex ||
    completed !== state.isCompleted ||
    !currentBalance.equals(state.lastBalance ?? ZERO)
  ) {
    const updated = await tx.memberDepositLifecycleState.update({
      where: { id: state.id },
      data: {
        currentStageIndex: stageIndex,
        isCompleted: completed,
        completedAt: completed ? new Date() : null,
        lastBalance: currentBalance,
      },
    });
    state = updated;
    if (completed && control.scope === 'MEMBER') {
      await tx.memberDepositControl.update({
        where: { id: control.id },
        data: { isActive: false, isCompleted: true },
      });
    }
  }

  return { state, completed, direction, fromPercent, targetPercent, targetBalance };
}

function parseDepositLifecycleSteps(value: Prisma.JsonValue | null): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'number' ? item : Number.parseFloat(String(item))))
    .filter((item) => Number.isFinite(item) && item >= 0);
}

function lifecycleBalanceForPercent(startBalance: Prisma.Decimal, percent: number): Prisma.Decimal {
  return startBalance.mul(percent).div(100).toDecimalPlaces(2);
}

function resolveLifecycleDirection(
  fromPercent: number,
  targetPercent: number | null,
): 'WIN' | 'LOSS' | 'HOLD' {
  if (targetPercent === null || targetPercent === fromPercent) return 'HOLD';
  return targetPercent > fromPercent ? 'WIN' : 'LOSS';
}

function isLifecycleStageReached(
  startBalance: Prisma.Decimal,
  currentBalance: Prisma.Decimal,
  fromPercent: number,
  targetPercent: number | null,
  direction: 'WIN' | 'LOSS' | 'HOLD',
): boolean {
  if (targetPercent === null) return true;
  if (startBalance.lessThanOrEqualTo(0)) return false;
  if (direction === 'WIN') {
    const thresholdPercent = Math.max(0, targetPercent - LIFECYCLE_PATH_STAGE_BAND_PERCENT);
    return currentBalance.greaterThanOrEqualTo(
      lifecycleBalanceForPercent(startBalance, thresholdPercent),
    );
  }
  if (direction === 'LOSS') {
    const thresholdPercent = Math.min(
      Math.max(0, fromPercent - LIFECYCLE_PATH_STAGE_BAND_PERCENT),
      Math.max(0, targetPercent + LIFECYCLE_PATH_STAGE_BAND_PERCENT),
    );
    return currentBalance.lessThanOrEqualTo(
      lifecycleBalanceForPercent(startBalance, thresholdPercent),
    );
  }
  return true;
}

function legacyAutoBalancePathGuardDecision(
  control: AutoBalanceControlRecord,
  currentBalance: Prisma.Decimal,
  predicted: PredictedResult,
): ControlDecision | null {
  if (control.baselineBalance.lessThanOrEqualTo(0)) return null;

  const toPercent = (balance: Prisma.Decimal) =>
    balance.div(control.baselineBalance).mul(100).toNumber();
  const bitePercent = toPercent(control.biteTargetBalance);
  const revivePercent = toPercent(control.reviveTargetBalance);
  const fromPercent =
    control.phase === 'REVIVE_TO_70'
      ? bitePercent
      : control.phase === 'DRAIN_TO_ZERO'
        ? revivePercent
        : 100;
  const targetPercent =
    control.phase === 'REVIVE_TO_70'
      ? revivePercent
      : control.phase === 'DRAIN_TO_ZERO'
        ? 0
        : bitePercent;

  return lifecyclePathGuardDecision({
    controlId: control.id,
    reason: 'auto_balance_path_guard',
    startBalance: control.baselineBalance,
    currentBalance,
    fromPercent,
    targetPercent,
    predicted,
  });
}

function lifecyclePathGuardDecision(input: {
  controlId: string;
  reason: 'deposit_lifecycle_path_guard' | 'auto_balance_path_guard';
  startBalance: Prisma.Decimal;
  currentBalance: Prisma.Decimal;
  fromPercent: number;
  targetPercent: number | null;
  predicted: PredictedResult;
}): ControlDecision | null {
  if (input.targetPercent === null || input.startBalance.lessThanOrEqualTo(0)) return null;

  const predictedProfit = input.predicted.payout.sub(input.predicted.amount);
  if (!predictedProfit.greaterThan(0)) return null;

  const upperPercent = Math.max(input.fromPercent, input.targetPercent);
  const upperBalance = lifecycleBalanceForPercent(input.startBalance, upperPercent).add(
    input.startBalance.mul(LIFECYCLE_PATH_TARGET_BAND_RATE),
  );
  const projectedBalance = input.currentBalance.add(predictedProfit);
  if (projectedBalance.lessThanOrEqualTo(upperBalance)) return null;

  const maxProfit = upperBalance.sub(input.currentBalance).toDecimalPlaces(2);
  if (maxProfit.lessThanOrEqualTo(0)) {
    return { desired: 'LOSS', controlId: input.controlId, reason: input.reason };
  }

  const maxPayout = input.predicted.amount.add(maxProfit).toDecimalPlaces(2);
  if (maxPayout.lessThanOrEqualTo(input.predicted.amount.mul('1.0001'))) {
    return { desired: 'LOSS', controlId: input.controlId, reason: input.reason };
  }

  return {
    desired: 'WIN',
    controlId: input.controlId,
    reason: input.reason,
    minMultiplier: new Prisma.Decimal('1.0001'),
    maxPayout,
    forceWinAdjustment: true,
    gameMatchedPayoutOnly: true,
  };
}

async function findManualDetectionDecision(
  tx: Db,
  member: MemberScope,
  predicted: PredictedResult,
  scope: 'all' | 'targeted' | 'global' = 'all',
): Promise<ControlDecisionLookup> {
  await checkAndCompleteManualDetectionControls(tx);
  const applicable = await findApplicableManualDetectionControl(tx, member);
  if (!applicable) return null;
  if (scope === 'targeted' && applicable.control.scope === 'ALL') return null;
  if (scope === 'global' && applicable.control.scope !== 'ALL') return null;

  const settlement = await calculateCurrentSettlement(
    tx,
    applicable.control.scope,
    applicable.control.targetAgentId,
    applicable.control.targetMemberUsername,
  );
  const holdTarget = isHoldTargetManualControl(applicable.control);
  if (holdTarget && isWithinManualTargetBand(settlement.superiorSettlement, applicable.control)) {
    return null;
  }

  if (!passesControlInterventionRate(applicable.control.controlPercentage)) {
    return CONTROL_INTERVENTION_MISS;
  }

  const desired = holdTarget
    ? resolveHoldTargetManualDetectionDesired(
        settlement.superiorSettlement,
        applicable.control.targetSettlement,
      )
    : resolveManualDetectionDesired(
        settlement.superiorSettlement,
        applicable.control.targetSettlement,
        applicable.control.startSettlement,
      );
  if (desired === 'LOSS') {
    const release = await getManualDetectionReleasePlan(
      tx,
      applicable.control.id,
      member.id,
      predicted,
      applicable.control.controlPercentage,
    );
    if (release) {
      return {
        desired: 'WIN',
        controlId: applicable.control.id,
        reason: 'manual_detection_release',
        minMultiplier: new Prisma.Decimal('1.01'),
        maxMultiplier: release.maxMultiplier,
        maxPayout: release.maxPayout,
        forceWinAdjustment: true,
      };
    }
  }
  return {
    desired,
    controlId: applicable.control.id,
    reason: 'manual_detection',
    minMultiplier: new Prisma.Decimal('1.01'),
  };
}

async function getManualDetectionReleasePlan(
  tx: Db,
  controlId: string,
  userId: string,
  predicted: PredictedResult,
  controlPercentage: number,
): Promise<ControlReleasePlan | null> {
  const window = getControlGameDayWindow();
  const logs = await tx.winLossControlLogs.findMany({
    where: {
      controlId,
      userId,
      createdAt: { gte: window.start, lt: window.end },
      flipReason: { in: ['manual_detection', 'manual_detection_release'] },
    },
    orderBy: { createdAt: 'desc' },
    take: CONTROL_RELEASE_LOG_WINDOW,
    select: { flipReason: true, finalResult: true },
  });

  return resolveControlReleasePlan(
    logs,
    predicted,
    MANUAL_DETECTION_RELEASE_CONFIG,
    'manual_detection_release',
    ['manual_detection'],
    new Prisma.Decimal(controlPercentage),
  );
}

function resolveManualDetectionDesired(
  currentSettlement: Prisma.Decimal,
  targetSettlement: Prisma.Decimal,
  startSettlement?: Prisma.Decimal | null,
): 'WIN' | 'LOSS' {
  if (startSettlement && !startSettlement.eq(targetSettlement)) {
    return targetSettlement.greaterThan(startSettlement) ? 'LOSS' : 'WIN';
  }
  return currentSettlement.lessThan(targetSettlement) ? 'LOSS' : 'WIN';
}

function resolveHoldTargetManualDetectionDesired(
  currentSettlement: Prisma.Decimal,
  targetSettlement: Prisma.Decimal,
): 'WIN' | 'LOSS' {
  return currentSettlement.lessThan(targetSettlement) ? 'LOSS' : 'WIN';
}

function isWithinManualTargetBand(
  currentSettlement: Prisma.Decimal,
  control: {
    scope: Parameters<typeof isHoldTargetManualControl>[0]['scope'];
    targetSettlement: Prisma.Decimal;
    completionBehavior?: string | null;
    targetBand?: Prisma.Decimal | null;
    bitePercentage?: Prisma.Decimal | null;
  },
): boolean {
  if (currentSettlement.eq(control.targetSettlement)) return true;
  const targetBand = getManualControlTargetBand(control);
  return (
    targetBand.greaterThan(0) &&
    currentSettlement.sub(control.targetSettlement).abs().lte(targetBand)
  );
}

function jsonResultWon(value: Prisma.JsonValue): boolean | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const won = (value as Record<string, unknown>).won;
  return typeof won === 'boolean' ? won : null;
}

function jsonResultAmountPayout(
  value: Prisma.JsonValue,
): { amount: Prisma.Decimal; payout: Prisma.Decimal; won: boolean } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  try {
    const amount = new Prisma.Decimal(String(result.amount ?? 0));
    const payout = new Prisma.Decimal(String(result.payout ?? 0));
    if (amount.lessThanOrEqualTo(0) || payout.lessThan(0)) return null;
    const won = typeof result.won === 'boolean' ? result.won : payout.greaterThan(amount);
    return { amount, payout, won };
  } catch {
    return null;
  }
}

function resolveControlReleasePlan(
  logs: Array<{ flipReason: string; finalResult: Prisma.JsonValue }>,
  predicted: PredictedResult,
  config: ControlReleaseConfig,
  releaseReason: string,
  lossReasons: string[],
  controlPercentage?: Prisma.Decimal,
): ControlReleasePlan | null {
  const profile = buildControlReleaseProfile(logs, releaseReason, lossReasons);
  if (!profile || profile.consecutiveLosses < config.minLosses) return null;
  if (predicted.amount.greaterThan(profile.maxAmount.mul(CONTROL_RELEASE_STAKE_JUMP_RATIO))) {
    return null;
  }

  let chance = Math.min(
    config.maxChance,
    config.baseChance + (profile.consecutiveLosses - config.minLosses) * config.chanceStep,
  );
  if (controlPercentage && Number(controlPercentage) >= 60) {
    chance *= config.highControlDampening;
  }
  if (Math.random() >= chance) return null;

  const avgAmount = profile.totalAmount.div(profile.consecutiveLosses);
  const maxProfit = minDecimal([
    profile.totalLoss.mul(CONTROL_RELEASE_TOTAL_LOSS_PROFIT_RATIO),
    avgAmount.mul(CONTROL_RELEASE_AVG_STAKE_PROFIT_RATIO),
    predicted.amount.mul(CONTROL_RELEASE_CURRENT_STAKE_PROFIT_RATIO),
  ]).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  if (maxProfit.lessThanOrEqualTo(0)) return null;

  return {
    maxMultiplier: config.maxMultiplier,
    maxPayout: predicted.amount.add(maxProfit).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN),
  };
}

function buildControlReleaseProfile(
  logs: Array<{ flipReason: string; finalResult: Prisma.JsonValue }>,
  releaseReason: string,
  lossReasons: string[],
): ControlReleaseProfile | null {
  let consecutiveLosses = 0;
  let totalAmount = new Prisma.Decimal(0);
  let totalLoss = new Prisma.Decimal(0);
  let maxAmount = new Prisma.Decimal(0);

  for (const log of logs) {
    if (log.flipReason === releaseReason) break;
    if (!lossReasons.includes(log.flipReason)) continue;
    const result = jsonResultAmountPayout(log.finalResult);
    if (!result || result.won) break;

    const loss = result.amount.sub(result.payout);
    if (loss.lessThanOrEqualTo(0)) break;
    consecutiveLosses += 1;
    totalAmount = totalAmount.add(result.amount);
    totalLoss = totalLoss.add(loss);
    if (result.amount.greaterThan(maxAmount)) maxAmount = result.amount;
  }

  if (consecutiveLosses === 0) return null;
  return { consecutiveLosses, totalAmount, totalLoss, maxAmount };
}

async function findBurstDecision(
  tx: Db,
  member: MemberScope,
  gameId: string,
  predicted: PredictedResult,
  options: ControlOptions,
): Promise<ControlDecisionLookup> {
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
  const potentialMultiplier = parseBurstPotentialMultiplier(options.burstPotentialMultiplier);
  const potentialPayout = potentialMultiplier
    ? predicted.amount.mul(potentialMultiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN)
    : predicted.payout;
  const potentialProfit = potentialPayout.sub(predicted.amount);
  const potentialNetWin = potentialPayout.greaterThan(predicted.amount);
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
  const projectedPotentialNet = stats.net.add(potentialProfit);
  if (stats.net.greaterThanOrEqualTo(control.riskWinLimit)) {
    return predictedNetWin || potentialNetWin
      ? { desired: 'LOSS', controlId: control.id, reason: 'burst_risk_guard' }
      : null;
  }

  if (
    (predictedNetWin || potentialNetWin) &&
    (predicted.payout.greaterThan(maxPayout) ||
      potentialPayout.greaterThan(maxPayout) ||
      predicted.multiplier.greaterThan(control.singleMultiplierCap) ||
      (potentialMultiplier?.greaterThan(control.singleMultiplierCap) ?? false) ||
      projectedNet.greaterThan(control.riskWinLimit) ||
      projectedPotentialNet.greaterThan(control.riskWinLimit))
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

  const inCooldown = await isBurstCooldownActive(tx, member.id);
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
        burstCooldownRounds: randomBurstCooldownRounds(),
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

  return eligibility.eligible ? CONTROL_INTERVENTION_MISS : null;
}

export function isBurstControlEligible(
  gameId: string,
  _predicted: Pick<PredictedResult, 'multiplier'>,
  options: ControlOptions = {},
): boolean {
  if (!BURST_ELIGIBLE_GAME_IDS.has(gameId)) return false;
  if (options.burstEligible === false) return false;
  return true;
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
  member: { id: string; username: string; agentId: string | null },
  currentBalance: Prisma.Decimal,
): Promise<void> {
  let completedAny = false;
  if (tx.memberDepositLifecycleState?.findMany) {
    const lifecycleStates = await tx.memberDepositLifecycleState.findMany({
      where: {
        memberId: member.id,
        isCompleted: false,
        control: { isActive: true, isCompleted: false },
      },
      include: { control: true },
    });
    for (const state of lifecycleStates) {
      const steps = parseDepositLifecycleSteps(state.control.lifecycleSteps);
      if (steps.length === 0) continue;
      const resolved = await advanceDepositLifecycleStateIfReached(
        tx,
        state.control,
        state,
        currentBalance,
        steps,
      );
      if (resolved.completed) completedAny = true;
    }
  }

  const controls = await tx.memberDepositControl.findMany({
    where: {
      memberId: member.id,
      isActive: true,
      isCompleted: false,
      lifecycleSteps: { equals: Prisma.DbNull },
    },
  });
  for (const control of controls) {
    const currentProfit = currentBalance.minus(control.startBalance);
    if (currentProfit.greaterThanOrEqualTo(control.targetProfit)) {
      await tx.memberDepositControl.update({
        where: { id: control.id },
        data: { isActive: false, isCompleted: true },
      });
      completedAny = true;
    }
  }
  if (completedAny && currentBalance.greaterThan(0)) {
    await resetMemberAutoBalanceControl(tx, {
      memberId: member.id,
      memberUsername: member.username,
      agentId: member.agentId,
      balanceAfter: currentBalance,
      reason: 'deposit_lifecycle_completed',
      operatorUsername: 'auto_balance_model',
    });
  }
}

async function completeAutoBalanceControlIfReached(
  tx: Db,
  memberId: string,
  currentBalance: Prisma.Decimal,
): Promise<void> {
  const control = (await tx.memberAutoBalanceControl.findUnique({
    where: { memberId },
  })) as AutoBalanceControlRecord | null;
  if (!control?.isActive) return;
  const steps = parseDepositLifecycleSteps(control.lifecycleSteps ?? null);
  if (steps.length === 0) return;
  await advanceAutoBalanceLifecycleIfReached(tx, control, currentBalance, steps);
}

async function enforceAutoBalanceBankerGuard(
  tx: Db,
  member: { id: string; username: string; agentId: string | null },
  outcome: ControlOutcome,
): Promise<void> {
  if (isBankerGuardExemptOutcome(outcome)) return;

  const control = (await tx.memberAutoBalanceControl.findUnique({
    where: { memberId: member.id },
    select: { id: true, secondLineAmount: true },
  })) as { id: string; secondLineAmount: Prisma.Decimal | null } | null;
  const guardAmount = control?.secondLineAmount ?? new Prisma.Decimal(50000);
  if (guardAmount.lessThanOrEqualTo(0)) return;

  const settlement = await calculateCurrentSettlement(
    tx,
    ManualDetectionScope.MEMBER,
    null,
    member.username,
  );
  const guardNet = settlement.memberWinLoss.add(settlement.totalRebate);
  if (guardNet.lessThan(guardAmount)) return;

  const now = new Date();
  if (!member.agentId) {
    await tx.user.updateMany({
      where: { id: member.id, disabledAt: null, frozenAt: null },
      data: { frozenAt: now },
    });
    if (control) {
      await tx.memberAutoBalanceControl.update({
        where: { id: control.id },
        data: {
          isActive: false,
          resetReason: 'banker_guard_frozen',
          lifecycleCompletedAt: now,
        },
      });
    }
    return;
  }

  const agentIds = await listAgentDescendants(tx, member.agentId);
  await tx.user.updateMany({
    where: { agentId: { in: agentIds }, disabledAt: null, frozenAt: null },
    data: { frozenAt: now },
  });
  await tx.agent.updateMany({
    where: { id: { in: agentIds }, status: 'ACTIVE', role: { not: 'SUPER_ADMIN' } },
    data: { status: 'FROZEN' },
  });
  if (control) {
    await tx.memberAutoBalanceControl.update({
      where: { id: control.id },
      data: {
        isActive: false,
        resetReason: 'banker_guard_frozen',
        lifecycleCompletedAt: now,
      },
    });
  }
}

function isBankerGuardExemptOutcome(outcome: ControlOutcome): boolean {
  const reason = outcome.flipReason ?? '';
  return (
    reason === 'deposit_control' ||
    reason === 'deposit_lifecycle_path_guard' ||
    reason === 'online_reward_next_win' ||
    reason.startsWith('burst_')
  );
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

async function isBurstCooldownActive(tx: Db, userId: string): Promise<boolean> {
  const latest = await tx.winLossControlLogs.findFirst({
    where: {
      userId,
      gameId: { in: [...BURST_ELIGIBLE_GAME_IDS] },
      flipReason: 'burst_win',
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, finalResult: true },
  });
  if (!latest) return false;
  const cooldownRounds = getStoredBurstCooldownRounds(latest.finalResult);
  const slotSpinCount = await tx.bet.count({
    where: {
      userId,
      gameId: { in: [...BURST_ELIGIBLE_GAME_IDS] },
      status: 'SETTLED',
      createdAt: { gt: latest.createdAt },
    },
  });
  return slotSpinCount < cooldownRounds;
}

function randomBurstCooldownRounds(): number {
  return (
    BURST_COOLDOWN_MIN_ROUNDS +
    Math.floor(Math.random() * (BURST_COOLDOWN_MAX_ROUNDS - BURST_COOLDOWN_MIN_ROUNDS + 1))
  );
}

function getStoredBurstCooldownRounds(value: Prisma.JsonValue): number {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  const raw = record && 'burstCooldownRounds' in record ? record.burstCooldownRounds : undefined;
  const parsed =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return BURST_COOLDOWN_MIN_ROUNDS;
  return Math.max(
    BURST_COOLDOWN_MIN_ROUNDS,
    Math.min(BURST_COOLDOWN_MAX_ROUNDS, Math.trunc(parsed)),
  );
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

function parseBurstPotentialMultiplier(
  value: Prisma.Decimal | number | string | undefined,
): Prisma.Decimal | null {
  if (value === undefined || value === null) return null;
  try {
    const decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
    return decimal.greaterThan(0) ? decimal : null;
  } catch {
    return null;
  }
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
    gameMatchedPayoutOnly: decision.gameMatchedPayoutOnly,
    burstCooldownRounds: decision.burstCooldownRounds,
  };
}

export function shouldForceLossForGameMatchedPayoutOnly(
  multiplier: number | Prisma.Decimal,
  amount: Prisma.Decimal,
  control: Pick<
    ControlOutcome,
    'controlled' | 'won' | 'gameMatchedPayoutOnly' | 'maxMultiplier' | 'maxPayout'
  >,
): boolean {
  return Boolean(
    control.controlled &&
    control.won &&
    control.gameMatchedPayoutOnly &&
    multiplierExceedsControlCeiling(multiplier, amount, control),
  );
}

export function forceControlOutcomeToLoss(outcome: ControlOutcome): ControlOutcome {
  return {
    ...outcome,
    won: false,
    multiplier: new Prisma.Decimal(0),
    payout: new Prisma.Decimal(0),
    gameMatchedPayoutOnly: undefined,
  };
}

export function resolveGameMatchedCashoutControl(
  multiplier: number | Prisma.Decimal,
  amount: Prisma.Decimal,
  control: ControlOutcome,
): ControlOutcome {
  const gameMultiplier =
    multiplier instanceof Prisma.Decimal ? multiplier : new Prisma.Decimal(multiplier);
  const gamePayout = amount.mul(gameMultiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const gameOutcome: ControlOutcome = {
    won: gamePayout.greaterThan(amount),
    multiplier: gameMultiplier,
    payout: gamePayout,
    controlled: false,
  };

  if (!control.controlled) return gameOutcome;
  if (control.won && multiplierMatchesControlBounds(gameMultiplier, amount, control)) {
    return {
      ...control,
      won: gamePayout.greaterThan(amount),
      multiplier: gameMultiplier,
      payout: gamePayout,
    };
  }

  return gameOutcome;
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

export function multiplierExceedsControlCeiling(
  multiplier: number | Prisma.Decimal,
  amount: Prisma.Decimal,
  control: Pick<ControlOutcome, 'maxMultiplier' | 'maxPayout'>,
): boolean {
  const m = multiplier instanceof Prisma.Decimal ? multiplier : new Prisma.Decimal(multiplier);
  if (control.maxMultiplier && m.greaterThan(control.maxMultiplier)) return true;
  if (control.maxPayout && amount.mul(m).greaterThan(control.maxPayout)) return true;
  return false;
}

export const __controlsTestHooks = {
  applyGlobalMemberDailyWinCap,
  enforceAutoBalanceBankerGuard,
  findControlDecision,
  findAutoBalanceDecision,
  findAutoBalanceReviveDecision,
  findDepositControlDecision,
  getGlobalMemberDailyWinCapGuard,
  getStoredBurstCooldownRounds,
  passesAutoBalanceLossInterventionRate,
  randomBurstCooldownRounds,
  rankWinLossControls,
  resolveHoldTargetManualDetectionDesired,
  resolveManualDetectionDesired,
  isWithinManualTargetBand,
};
