import { ManualDetectionScope, Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { BACCARAT_GAME_IDS } from '@bg/shared';
import {
  isMemberInControlExcludedLine,
  listAgentDescendants,
  listControlIncludedAgentIds,
  listControlIncludedAgentDescendants,
} from '../../../utils/hierarchy.js';
import { getAdminGameDay, getAdminGameDayWindow } from '../gameDay.js';
import { calculateRebateAmountByCategory, effectiveDownlineRebate } from '../rebate.js';

type Db = PrismaClient | Prisma.TransactionClient;

const ZERO = new Prisma.Decimal(0);
const MANUAL_HOLD_TARGET_BEHAVIOR = 'hold_target';
const MANUAL_STOP_ON_TARGET_BEHAVIOR = 'stop_on_target';
const MANUAL_TARGET_BAND_RATE = new Prisma.Decimal('0.05');
const MANUAL_TARGET_BAND_MIN = new Prisma.Decimal(1000);
const MANUAL_TARGET_BAND_MAX = new Prisma.Decimal(10000);

export interface SettlementSummary {
  gameDay: string;
  totalBet: Prisma.Decimal;
  totalPayout: Prisma.Decimal;
  memberWinLoss: Prisma.Decimal;
  totalRebate: Prisma.Decimal;
  superiorSettlement: Prisma.Decimal;
  totalBets: number;
  totalPlayers: number;
  status: 'green' | 'red';
  statusText: string;
}

export interface AutoDetectionBitePlan {
  gameDay: string;
  bitePercentage: Prisma.Decimal;
  houseTakePercentage: Prisma.Decimal;
  capitalAmount: Prisma.Decimal;
  biteAmount: Prisma.Decimal;
  platformTake: Prisma.Decimal;
  redistributionAmount: Prisma.Decimal;
  currentSettlement: Prisma.Decimal;
  targetSettlement: Prisma.Decimal;
}

interface BetAggregate {
  totalBet: Prisma.Decimal;
  totalPayout: Prisma.Decimal;
  memberWinLoss: Prisma.Decimal;
  totalBets: number;
  totalPlayers: number;
  electronicBetAmount: Prisma.Decimal;
  baccaratBetAmount: Prisma.Decimal;
}

interface AgentRebateProfile {
  id: string;
  parentId: string | null;
  rebateMode: 'PERCENTAGE' | 'ALL' | 'NONE';
  rebatePercentage: Prisma.Decimal;
  maxRebatePercentage: Prisma.Decimal;
  baccaratRebateMode: 'PERCENTAGE' | 'ALL' | 'NONE';
  baccaratRebatePercentage: Prisma.Decimal;
  maxBaccaratRebatePercentage: Prisma.Decimal;
}

interface FundedControlMember {
  id: string;
  username: string;
  balance: Prisma.Decimal;
}

const AUTO_REVIVAL_NOTE = 'auto_revive';
export const STARTER_CONFIDENCE_OPERATOR = 'auto_starter_confidence';
export const AUTO_BALANCE_OPERATOR = 'auto_balance_model';
const AUTO_BALANCE_BITE_RATE = new Prisma.Decimal('0.30');
const AUTO_BALANCE_REVIVE_RATE = new Prisma.Decimal('0.70');

export function getControlGameDay(now: Date = new Date()): string {
  return getAdminGameDay(now);
}

export function getControlGameDayWindow(now: Date = new Date()): {
  gameDay: string;
  start: Date;
  end: Date;
} {
  return getAdminGameDayWindow(now);
}

export async function calculateCurrentSettlement(
  db: Db,
  scope: ManualDetectionScope,
  targetAgentId?: string | null,
  targetMemberUsername?: string | null,
): Promise<SettlementSummary> {
  if (scope === 'MEMBER') {
    return calculateMemberSettlement(db, targetMemberUsername);
  }
  if (scope === 'AGENT_LINE') {
    return calculateAgentLineSettlement(db, targetAgentId);
  }
  return calculateAllSettlement(db);
}

export async function getAllActiveManualDetectionControls(db: Db) {
  const items = await db.manualDetectionControl.findMany({
    where: {
      isActive: true,
      isCompleted: false,
      OR: [{ operatorUsername: null }, { operatorUsername: { not: STARTER_CONFIDENCE_OPERATOR } }],
    },
    orderBy: { createdAt: 'desc' },
  });
  return [...items].sort((a, b) => {
    const rankA = manualScopeRank(a.scope);
    const rankB = manualScopeRank(b.scope);
    if (rankA !== rankB) return rankA - rankB;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export async function resetMemberAutoBalanceControl(
  db: Db,
  input: {
    memberId: string;
    memberUsername: string;
    agentId: string | null;
    balanceAfter: Prisma.Decimal | string | number;
    reason: string;
    operatorUsername?: string | null;
  },
) {
  const baselineBalance = decimal(input.balanceAfter).toDecimalPlaces(2);
  const biteTargetBalance = baselineBalance
    .mul(AUTO_BALANCE_BITE_RATE)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const reviveTargetBalance = baselineBalance
    .mul(AUTO_BALANCE_REVIVE_RATE)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const isActive = baselineBalance.greaterThan(0);

  await deactivateLegacyAutomaticControls(db, input.memberId, input.memberUsername);

  return db.memberAutoBalanceControl.upsert({
    where: { memberId: input.memberId },
    create: {
      memberId: input.memberId,
      memberUsername: input.memberUsername,
      agentId: input.agentId,
      baselineBalance,
      biteTargetBalance,
      reviveTargetBalance,
      phase: 'BITE_TO_30',
      isActive,
      resetReason: input.reason,
      operatorUsername: input.operatorUsername ?? AUTO_BALANCE_OPERATOR,
    },
    update: {
      memberUsername: input.memberUsername,
      agentId: input.agentId,
      baselineBalance,
      biteTargetBalance,
      reviveTargetBalance,
      phase: 'BITE_TO_30',
      isActive,
      resetReason: input.reason,
      operatorUsername: input.operatorUsername ?? AUTO_BALANCE_OPERATOR,
    },
  });
}

export async function getOrCreateMemberAutoBalanceControl(
  db: Db,
  member: {
    id: string;
    username: string;
    agentId: string | null;
    balance: Prisma.Decimal;
  },
) {
  const existing = await db.memberAutoBalanceControl.findUnique({
    where: { memberId: member.id },
  });
  if (existing) return existing;

  if (member.balance.lessThanOrEqualTo(0)) return null;
  return resetMemberAutoBalanceControl(db, {
    memberId: member.id,
    memberUsername: member.username,
    agentId: member.agentId,
    balanceAfter: member.balance,
    reason: 'lazy_current_balance',
    operatorUsername: AUTO_BALANCE_OPERATOR,
  });
}

export async function setMemberAutoBalancePhase(
  db: Db,
  controlId: string,
  phase: 'BITE_TO_30' | 'REVIVE_TO_70' | 'DRAIN_TO_ZERO',
) {
  return db.memberAutoBalanceControl.update({
    where: { id: controlId },
    data: { phase },
  });
}

async function deactivateLegacyAutomaticControls(
  db: Db,
  memberId: string,
  memberUsername: string,
): Promise<void> {
  await db.memberDepositControl.updateMany({
    where: {
      memberId,
      isActive: true,
      isCompleted: false,
      AND: [
        { notes: { contains: AUTO_REVIVAL_NOTE } },
        { NOT: { notes: { contains: 'online_reward' } } },
      ],
    },
    data: { isActive: false, isCompleted: true },
  });
  await db.manualDetectionControl.updateMany({
    where: {
      scope: ManualDetectionScope.MEMBER,
      targetMemberUsername: memberUsername,
      isActive: true,
      isCompleted: false,
      operatorUsername: STARTER_CONFIDENCE_OPERATOR,
    },
    data: { isActive: false, isCompleted: true, completedAt: new Date() },
  });
}

export async function findApplicableManualDetectionControl(
  db: Db,
  member: { username: string; agentId: string | null },
) {
  const controls = await getAllActiveManualDetectionControls(db);
  if (controls.length === 0) return null;

  const memberControl = controls.find(
    (control) => control.scope === 'MEMBER' && control.targetMemberUsername === member.username,
  );
  if (memberControl) {
    return { control: memberControl, depth: -1 };
  }

  const ancestors = member.agentId ? await getAgentAncestors(db, member.agentId) : [];
  const lineCandidates = controls
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
      (a, b) => a.depth - b.depth || b.control.createdAt.getTime() - a.control.createdAt.getTime(),
    );
  if (lineCandidates.length > 0) return lineCandidates[0];

  if (await isMemberInControlExcludedLine(db, member)) return null;

  const allControl = controls.find((control) => control.scope === 'ALL');
  if (!allControl) return null;
  return { control: allControl, depth: Number.POSITIVE_INFINITY };
}

export async function checkAndCompleteManualDetectionControls(
  db: Db,
): Promise<{ completedCount: number }> {
  const activeControls = await getAllActiveManualDetectionControls(db);
  let completedCount = 0;

  for (const control of activeControls) {
    const settlement = await calculateCurrentSettlement(
      db,
      control.scope,
      control.targetAgentId,
      control.targetMemberUsername,
    );
    const reached = isTargetReached(
      settlement.superiorSettlement,
      control.targetSettlement,
      control.startSettlement,
    );
    if (!reached) continue;

    if (isHoldTargetManualControl(control)) {
      continue;
    }

    if (control.bitePercentage && control.bitePercentage.greaterThan(0)) {
      const plan = await calculateAutoDetectionBitePlan(db, {
        scope: control.scope,
        targetAgentId: control.targetAgentId,
        targetMemberUsername: control.targetMemberUsername,
        bitePercentage: control.bitePercentage,
        houseTakePercentage: control.houseTakePercentage,
        currentSettlement: settlement.superiorSettlement,
      });
      if (plan.platformTake.greaterThan(0)) {
        const distribution = await distributeAutoDetectionRedistribution(db, control, plan);
        await db.manualDetectionControl.update({
          where: { id: control.id },
          data: {
            targetSettlement: plan.targetSettlement,
            startSettlement: settlement.superiorSettlement,
            cycleCount: { increment: 1 },
            lastCycleSettlement: settlement.superiorSettlement,
            lastCycleAt: new Date(),
            lastCapitalAmount: plan.capitalAmount,
            lastPlatformTake: plan.platformTake,
            lastRedistributionAmount: distribution.distributedAmount,
            totalDistributedAmount: { increment: distribution.distributedAmount },
            isActive: true,
            isCompleted: false,
            completedAt: null,
            completionSettlement: null,
          },
        });
        completedCount += 1;
      }
      continue;
    }

    if (control.scope === 'MEMBER') {
      if (control.isCompleted) continue;
      await db.manualDetectionControl.update({
        where: { id: control.id },
        data: {
          isActive: false,
          isCompleted: true,
          completedAt: new Date(),
          completionSettlement: settlement.superiorSettlement,
        },
      });
      completedCount += 1;
      continue;
    }

    await db.manualDetectionControl.update({
      where: { id: control.id },
      data: {
        isActive: false,
        isCompleted: true,
        completedAt: new Date(),
        completionSettlement: settlement.superiorSettlement,
      },
    });
    completedCount += 1;
  }

  return { completedCount };
}

export async function distributeAutoDetectionRedistribution(
  db: Db,
  control: {
    id: string;
    scope: ManualDetectionScope;
    targetAgentId?: string | null;
    targetMemberUsername?: string | null;
    cycleCount: number;
  },
  plan: AutoDetectionBitePlan,
): Promise<{
  memberCount: number;
  shareAmount: Prisma.Decimal;
  distributedAmount: Prisma.Decimal;
}> {
  const amount = plan.redistributionAmount.toDecimalPlaces(2);
  if (amount.lessThanOrEqualTo(0)) {
    return { memberCount: 0, shareAmount: ZERO, distributedAmount: ZERO };
  }

  const members = await listFundedControlMembers(
    db,
    control.scope,
    control.targetAgentId,
    control.targetMemberUsername,
  );
  if (members.length === 0) {
    return { memberCount: 0, shareAmount: ZERO, distributedAmount: ZERO };
  }

  const collectedAmount = await collectAutoDetectionRedistributionPool(
    db,
    control,
    plan,
    members,
    amount,
  );
  if (collectedAmount.lessThanOrEqualTo(0)) {
    return { memberCount: 0, shareAmount: ZERO, distributedAmount: ZERO };
  }

  const baseShare = collectedAmount
    .div(members.length)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const remainder = collectedAmount.sub(baseShare.mul(members.length)).toDecimalPlaces(2);
  let distributedAmount = ZERO;
  let creditedMembers = 0;

  for (const [index, member] of members.entries()) {
    const share = index === 0 ? baseShare.add(remainder) : baseShare;
    if (share.lessThanOrEqualTo(0)) continue;

    const updated = await db.user.update({
      where: { id: member.id },
      data: { balance: { increment: share } },
      select: { balance: true },
    });
    await db.transaction.create({
      data: {
        userId: member.id,
        type: 'ADJUSTMENT',
        amount: share,
        balanceAfter: updated.balance,
        meta: {
          control: 'auto_detection_redistribution',
          controlId: control.id,
          gameDay: plan.gameDay,
          cycle: control.cycleCount + 1,
          bitePercentage: plan.bitePercentage.toFixed(2),
          houseTakePercentage: plan.houseTakePercentage.toFixed(2),
          biteAmount: plan.biteAmount.toFixed(2),
          platformTake: plan.platformTake.toFixed(2),
          redistributionAmount: collectedAmount.toFixed(2),
        },
      },
    });
    distributedAmount = distributedAmount.add(share);
    creditedMembers += 1;
  }

  return {
    memberCount: creditedMembers,
    shareAmount: baseShare,
    distributedAmount: distributedAmount.toDecimalPlaces(2),
  };
}

async function collectAutoDetectionRedistributionPool(
  db: Db,
  control: {
    id: string;
    cycleCount: number;
  },
  plan: AutoDetectionBitePlan,
  members: FundedControlMember[],
  targetAmount: Prisma.Decimal,
): Promise<Prisma.Decimal> {
  const totalBalance = members.reduce(
    (sum, member) => sum.add(Prisma.Decimal.max(member.balance, ZERO)),
    ZERO,
  );
  if (totalBalance.lessThanOrEqualTo(0)) return ZERO;

  const collectTarget = Prisma.Decimal.min(targetAmount, totalBalance).toDecimalPlaces(2);
  let collectedAmount = ZERO;

  for (const [index, member] of members.entries()) {
    const available = Prisma.Decimal.max(member.balance, ZERO);
    if (available.lessThanOrEqualTo(0)) continue;

    const isLast = index === members.length - 1;
    const proportional = available.mul(collectTarget).div(totalBalance);
    let debit = isLast
      ? collectTarget.sub(collectedAmount)
      : proportional.toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    debit = Prisma.Decimal.min(
      debit,
      available,
      collectTarget.sub(collectedAmount),
    ).toDecimalPlaces(2);
    if (debit.lessThanOrEqualTo(0)) continue;

    const updated = await db.user.update({
      where: { id: member.id },
      data: { balance: { decrement: debit } },
      select: { balance: true },
    });
    await db.transaction.create({
      data: {
        userId: member.id,
        type: 'ADJUSTMENT',
        amount: debit.negated(),
        balanceAfter: updated.balance,
        meta: {
          control: 'auto_detection_redistribution_pool_debit',
          controlId: control.id,
          gameDay: plan.gameDay,
          cycle: control.cycleCount + 1,
          bitePercentage: plan.bitePercentage.toFixed(2),
          houseTakePercentage: plan.houseTakePercentage.toFixed(2),
          biteAmount: plan.biteAmount.toFixed(2),
          platformTake: plan.platformTake.toFixed(2),
          redistributionAmount: collectTarget.toFixed(2),
        },
      },
    });
    collectedAmount = collectedAmount.add(debit).toDecimalPlaces(2);
    if (collectedAmount.greaterThanOrEqualTo(collectTarget)) break;
  }

  return collectedAmount;
}

export async function calculateAutoDetectionBitePlan(
  db: Db,
  input: {
    scope: ManualDetectionScope;
    targetAgentId?: string | null;
    targetMemberUsername?: string | null;
    bitePercentage: Prisma.Decimal | string | number;
    houseTakePercentage?: Prisma.Decimal | string | number | null;
    currentSettlement?: Prisma.Decimal | string | number | null;
  },
): Promise<AutoDetectionBitePlan> {
  const window = getControlGameDayWindow();
  const bitePercentage = clampPercent(
    decimal(input.bitePercentage),
    new Prisma.Decimal(10),
    new Prisma.Decimal(70),
  );
  const houseTakePercentage = clampPercent(
    decimal(input.houseTakePercentage ?? 10),
    ZERO,
    new Prisma.Decimal(100),
  );
  const currentSettlement =
    input.currentSettlement === undefined || input.currentSettlement === null
      ? (
          await calculateCurrentSettlement(
            db,
            input.scope,
            input.targetAgentId,
            input.targetMemberUsername,
          )
        ).superiorSettlement
      : decimal(input.currentSettlement);
  const capitalAmount = await calculateControlCapital(
    db,
    input.scope,
    input.targetAgentId,
    input.targetMemberUsername,
  );
  const biteAmount = capitalAmount.mul(bitePercentage).div(100).toDecimalPlaces(2);
  const platformTake = biteAmount.mul(houseTakePercentage).div(100).toDecimalPlaces(2);
  const redistributionAmount = biteAmount.sub(platformTake).toDecimalPlaces(2);

  return {
    gameDay: window.gameDay,
    bitePercentage,
    houseTakePercentage,
    capitalAmount,
    biteAmount,
    platformTake,
    redistributionAmount,
    currentSettlement,
    targetSettlement: currentSettlement.add(platformTake).toDecimalPlaces(2),
  };
}

export async function calculateControlCapital(
  db: Db,
  scope: ManualDetectionScope,
  targetAgentId?: string | null,
  targetMemberUsername?: string | null,
): Promise<Prisma.Decimal> {
  const memberIds = await listControlScopeMemberIds(db, scope, targetAgentId, targetMemberUsername);
  if (memberIds.length === 0) return ZERO;
  const aggregate = await db.user.aggregate({
    where: {
      id: { in: memberIds },
      disabledAt: null,
      balance: { gt: 0 },
    },
    _sum: { balance: true },
  });
  return aggregate._sum.balance ?? ZERO;
}

async function listControlScopeMemberIds(
  db: Db,
  scope: ManualDetectionScope,
  targetAgentId?: string | null,
  targetMemberUsername?: string | null,
): Promise<string[]> {
  if (scope === 'MEMBER') {
    if (!targetMemberUsername) return [];
    const member = await db.user.findUnique({
      where: { username: targetMemberUsername },
      select: { id: true },
    });
    return member ? [member.id] : [];
  }

  if (scope === 'AGENT_LINE') {
    if (!targetAgentId) return [];
    const agentIds = await listAgentDescendants(db, targetAgentId);
    const members = await db.user.findMany({
      where: { agentId: { in: agentIds } },
      select: { id: true },
    });
    return members.map((member) => member.id);
  }

  const members = await db.user.findMany({
    where: {
      disabledAt: null,
      OR: [{ agentId: null }, { agentId: { in: await listControlIncludedAgentIds(db) } }],
    },
    select: { id: true },
  });
  return members.map((member) => member.id);
}

async function listFundedControlMembers(
  db: Db,
  scope: ManualDetectionScope,
  targetAgentId?: string | null,
  targetMemberUsername?: string | null,
): Promise<FundedControlMember[]> {
  const memberIds = await listControlScopeMemberIds(db, scope, targetAgentId, targetMemberUsername);
  if (memberIds.length === 0) return [];

  const window = getControlGameDayWindow();
  const fundedRows = await db.transaction.findMany({
    where: {
      userId: { in: memberIds },
      createdAt: { gte: window.start, lt: window.end },
      type: { in: ['SIGNUP_BONUS', 'TRANSFER_IN', 'ADJUSTMENT'] },
      amount: { gt: 0 },
    },
    distinct: ['userId'],
    select: { userId: true },
  });
  const fundedIds = fundedRows.map((row) => row.userId);
  const targetIds = fundedIds.length > 0 ? fundedIds : memberIds;

  return db.user.findMany({
    where: {
      id: { in: targetIds },
      disabledAt: null,
      ...(fundedIds.length === 0 ? { balance: { gt: 0 } } : {}),
    },
    select: { id: true, username: true, balance: true },
    orderBy: { username: 'asc' },
  });
}

export async function getAgentAncestors(db: Db, agentId: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string; depth: number }[]>`
    WITH RECURSIVE path AS (
      SELECT id, "parentId", 0 AS depth FROM "Agent" WHERE id = ${agentId}
      UNION ALL
      SELECT a.id, a."parentId", path.depth + 1 AS depth
      FROM "Agent" a
      JOIN path ON a.id = path."parentId"
      WHERE path.depth < 20
    )
    SELECT id, depth FROM path ORDER BY depth ASC
  `;
  return rows.map((row) => row.id);
}

export async function normalizeMemberWinCapDay<T extends { id: string; currentGameDay: string }>(
  db: Db,
  control: T,
) {
  const day = getControlGameDay();
  if (control.currentGameDay === day) return control;
  return db.memberWinCapControl.update({
    where: { id: control.id },
    data: {
      currentGameDay: day,
      todayWinAmount: ZERO,
      todayBetCount: 0,
      isCapped: false,
    },
  });
}

export async function normalizeAgentLineCapDay<T extends { id: string; currentGameDay: string }>(
  db: Db,
  control: T,
) {
  const day = getControlGameDay();
  if (control.currentGameDay === day) return control;
  return db.agentLineWinCap.update({
    where: { id: control.id },
    data: {
      currentGameDay: day,
      todayWinAmount: ZERO,
      isCapped: false,
    },
  });
}

export async function normalizeBurstControlDay<T extends { id: string; currentGameDay: string }>(
  db: Db,
  control: T,
) {
  const day = getControlGameDay();
  if (control.currentGameDay === day) return control;
  return db.burstControl.update({
    where: { id: control.id },
    data: {
      currentGameDay: day,
      todayBurstAmount: ZERO,
      todayBurstCount: 0,
    },
  });
}

export async function getAllActiveBurstControls(db: Db) {
  const items = await db.burstControl.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  return [...items].sort((a, b) => {
    const rankA = manualScopeRank(a.scope);
    const rankB = manualScopeRank(b.scope);
    if (rankA !== rankB) return rankA - rankB;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export async function findApplicableBurstControl(
  db: Db,
  member: { username: string; agentId: string | null },
  gameId?: string,
) {
  const controls = (await getAllActiveBurstControls(db)).filter(
    (control) =>
      control.scope === 'MEMBER' &&
      (!gameId || control.gameIds.length === 0 || control.gameIds.includes(gameId)),
  );
  if (controls.length === 0) return null;

  const memberControl = controls.find(
    (control) => control.scope === 'MEMBER' && control.targetMemberUsername === member.username,
  );
  if (memberControl) {
    return { control: memberControl, depth: -1 };
  }
  return null;
}

function manualScopeRank(scope: ManualDetectionScope): number {
  if (scope === 'MEMBER') return 0;
  if (scope === 'AGENT_LINE') return 1;
  return 2;
}

function decimal(value: Prisma.Decimal | string | number | null | undefined): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Prisma.Decimal(value);
  return ZERO;
}

export type ManualDetectionCompletionBehavior =
  | typeof MANUAL_HOLD_TARGET_BEHAVIOR
  | typeof MANUAL_STOP_ON_TARGET_BEHAVIOR;

export function getDefaultManualDetectionCompletionBehavior(
  scope: ManualDetectionScope,
  bitePercentage?: Prisma.Decimal | string | number | null,
): ManualDetectionCompletionBehavior {
  return scope === ManualDetectionScope.AGENT_LINE && decimal(bitePercentage).lessThanOrEqualTo(0)
    ? MANUAL_HOLD_TARGET_BEHAVIOR
    : MANUAL_STOP_ON_TARGET_BEHAVIOR;
}

export function calculateDefaultManualTargetBand(
  scope: ManualDetectionScope,
  targetSettlement: Prisma.Decimal | string | number | null | undefined,
  completionBehavior: ManualDetectionCompletionBehavior = getDefaultManualDetectionCompletionBehavior(
    scope,
  ),
): Prisma.Decimal {
  const target = decimal(targetSettlement).abs();
  if (completionBehavior !== MANUAL_HOLD_TARGET_BEHAVIOR || target.lessThanOrEqualTo(0)) {
    return ZERO;
  }
  return Prisma.Decimal.max(
    MANUAL_TARGET_BAND_MIN,
    Prisma.Decimal.min(target.mul(MANUAL_TARGET_BAND_RATE), MANUAL_TARGET_BAND_MAX),
  ).toDecimalPlaces(2);
}

export function isHoldTargetManualControl(control: {
  scope: ManualDetectionScope;
  completionBehavior?: string | null;
  bitePercentage?: Prisma.Decimal | null;
}): boolean {
  const behavior = control.completionBehavior?.trim().toLowerCase();
  if (behavior) return behavior === MANUAL_HOLD_TARGET_BEHAVIOR;
  return getDefaultManualDetectionCompletionBehavior(
    control.scope,
    control.bitePercentage,
  ) === MANUAL_HOLD_TARGET_BEHAVIOR;
}

export function getManualControlTargetBand(control: {
  scope: ManualDetectionScope;
  targetSettlement: Prisma.Decimal;
  completionBehavior?: string | null;
  targetBand?: Prisma.Decimal | null;
  bitePercentage?: Prisma.Decimal | null;
}): Prisma.Decimal {
  const configured = control.targetBand ? decimal(control.targetBand) : ZERO;
  if (configured.greaterThan(0)) return configured.toDecimalPlaces(2);
  if (!isHoldTargetManualControl(control)) return ZERO;
  return calculateDefaultManualTargetBand(
    control.scope,
    control.targetSettlement,
    MANUAL_HOLD_TARGET_BEHAVIOR,
  );
}

function clampPercent(
  value: Prisma.Decimal,
  min: Prisma.Decimal,
  max: Prisma.Decimal,
): Prisma.Decimal {
  if (value.lessThan(min)) return min;
  if (value.greaterThan(max)) return max;
  return value;
}

function isTargetReached(
  currentSettlement: Prisma.Decimal,
  targetSettlement: Prisma.Decimal,
  startSettlement: Prisma.Decimal | null,
): boolean {
  if (targetSettlement.eq(0) && startSettlement) {
    if (startSettlement.gt(0)) return currentSettlement.lte(0);
    if (startSettlement.lt(0)) return currentSettlement.gte(0);
    return true;
  }
  return targetSettlement.gte(0)
    ? currentSettlement.gte(targetSettlement)
    : currentSettlement.lte(targetSettlement);
}

async function calculateMemberSettlement(
  db: Db,
  targetMemberUsername?: string | null,
): Promise<SettlementSummary> {
  const window = getControlGameDayWindow();
  if (!targetMemberUsername) return emptySummary(window.gameDay);

  const member = await db.user.findUnique({
    where: { username: targetMemberUsername },
    select: { id: true, agentId: true },
  });
  if (!member?.agentId) return emptySummary(window.gameDay);

  const [aggregate, agent] = await Promise.all([
    queryBetAggregate(db, window, { userId: member.id }),
    db.agent.findUnique({
      where: { id: member.agentId },
      select: {
        id: true,
        parentId: true,
        rebateMode: true,
        rebatePercentage: true,
        maxRebatePercentage: true,
        baccaratRebateMode: true,
        baccaratRebatePercentage: true,
        maxBaccaratRebatePercentage: true,
      },
    }),
  ]);
  if (!agent) return toSummary(window.gameDay, aggregate, ZERO);

  const parent = agent.parentId
    ? await db.agent.findUnique({
        where: { id: agent.parentId },
        select: {
          rebateMode: true,
          rebatePercentage: true,
          maxRebatePercentage: true,
          baccaratRebateMode: true,
          baccaratRebatePercentage: true,
          maxBaccaratRebatePercentage: true,
        },
      })
    : null;
  const electronicRate = parent
    ? effectiveDownlineRebate(parent, 'electronic')
    : effectiveDownlineRebate(agent, 'electronic');
  const baccaratRate = parent
    ? effectiveDownlineRebate(parent, 'baccarat')
    : effectiveDownlineRebate(agent, 'baccarat');
  return toSummary(
    window.gameDay,
    aggregate,
    calculateRebateAmountByCategory(
      {
        betAmount: aggregate.totalBet,
        electronicBetAmount: aggregate.electronicBetAmount,
        baccaratBetAmount: aggregate.baccaratBetAmount,
      },
      electronicRate,
      baccaratRate,
    ),
  );
}

async function calculateAgentLineSettlement(
  db: Db,
  targetAgentId?: string | null,
): Promise<SettlementSummary> {
  const window = getControlGameDayWindow();
  if (!targetAgentId) return emptySummary(window.gameDay);
  return calculateAgentSubtreeSettlement(db, targetAgentId, window, {
    excludeControlExcludedLines: false,
  });
}

async function calculateAllSettlement(db: Db): Promise<SettlementSummary> {
  const window = getControlGameDayWindow();
  const [superAdmins, roots] = await Promise.all([
    db.agent.findMany({
      where: { role: 'SUPER_ADMIN', status: { not: 'DELETED' } },
      select: {
        id: true,
        parentId: true,
        rebateMode: true,
        rebatePercentage: true,
        maxRebatePercentage: true,
        baccaratRebateMode: true,
        baccaratRebatePercentage: true,
        maxBaccaratRebatePercentage: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    findPlatformRootAgents(db),
  ]);

  const summaries = await Promise.all(
    roots.map((root) => calculateAgentSubtreeSettlement(db, root.id, window)),
  );
  const directMemberSummary = await calculatePlatformDirectMembersSettlement(
    db,
    window,
    superAdmins,
  );
  const allSummaries = [...summaries, directMemberSummary].filter((item) => item.totalBets > 0);
  if (allSummaries.length === 0) return emptySummary(window.gameDay);

  return allSummaries.reduce(
    (acc, current) => ({
      gameDay: current.gameDay,
      totalBet: acc.totalBet.add(current.totalBet),
      totalPayout: acc.totalPayout.add(current.totalPayout),
      memberWinLoss: acc.memberWinLoss.add(current.memberWinLoss),
      totalRebate: acc.totalRebate.add(current.totalRebate),
      superiorSettlement: acc.superiorSettlement.add(current.superiorSettlement),
      totalBets: acc.totalBets + current.totalBets,
      totalPlayers: acc.totalPlayers + current.totalPlayers,
      status: acc.superiorSettlement.add(current.superiorSettlement).gt(0) ? 'green' : 'red',
      statusText: acc.superiorSettlement.add(current.superiorSettlement).gt(0)
        ? '绿色(上级盈利)'
        : '红色(上级亏损)',
    }),
    emptySummary(window.gameDay),
  );
}

async function findPlatformRootAgents(db: Db): Promise<Array<{ id: string }>> {
  const superAdmins = await db.agent.findMany({
    where: { role: 'SUPER_ADMIN', status: { not: 'DELETED' } },
    select: { id: true },
  });
  const superAdminIds = superAdmins.map((agent) => agent.id);
  const parentFilters: Prisma.AgentWhereInput[] = [{ parentId: null }];
  if (superAdminIds.length > 0) {
    parentFilters.push({ parentId: { in: superAdminIds } });
  }

  return db.agent.findMany({
    where: {
      OR: parentFilters,
      role: { not: 'SUPER_ADMIN' },
      status: { not: 'DELETED' },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
}

async function calculatePlatformDirectMembersSettlement(
  db: Db,
  window: ReturnType<typeof getControlGameDayWindow>,
  superAdmins: AgentRebateProfile[],
): Promise<SettlementSummary> {
  const summaries: SettlementSummary[] = [];
  const unattachedMembers = await db.user.findMany({
    where: { agentId: null },
    select: { id: true },
  });
  if (unattachedMembers.length > 0) {
    const aggregate = await queryBetAggregate(db, window, {
      userIds: unattachedMembers.map((member) => member.id),
    });
    summaries.push(toSummary(window.gameDay, aggregate, ZERO));
  }

  for (const admin of superAdmins) {
    const directMembers = await db.user.findMany({
      where: { agentId: admin.id },
      select: { id: true },
    });
    if (directMembers.length === 0) continue;

    const aggregate = await queryBetAggregate(db, window, {
      userIds: directMembers.map((member) => member.id),
    });
    summaries.push(
      toSummary(
        window.gameDay,
        aggregate,
        calculateRebateAmountByCategory(
          {
            betAmount: aggregate.totalBet,
            electronicBetAmount: aggregate.electronicBetAmount,
            baccaratBetAmount: aggregate.baccaratBetAmount,
          },
          effectiveDownlineRebate(admin, 'electronic'),
          effectiveDownlineRebate(admin, 'baccarat'),
        ),
      ),
    );
  }

  return summaries.reduce(
    (acc, current) => ({
      gameDay: current.gameDay,
      totalBet: acc.totalBet.add(current.totalBet),
      totalPayout: acc.totalPayout.add(current.totalPayout),
      memberWinLoss: acc.memberWinLoss.add(current.memberWinLoss),
      totalRebate: acc.totalRebate.add(current.totalRebate),
      superiorSettlement: acc.superiorSettlement.add(current.superiorSettlement),
      totalBets: acc.totalBets + current.totalBets,
      totalPlayers: acc.totalPlayers + current.totalPlayers,
      status: acc.superiorSettlement.add(current.superiorSettlement).gt(0) ? 'green' : 'red',
      statusText: acc.superiorSettlement.add(current.superiorSettlement).gt(0)
        ? '绿色(上级盈利)'
        : '红色(上级亏损)',
    }),
    emptySummary(window.gameDay),
  );
}

async function calculateAgentSubtreeSettlement(
  db: Db,
  agentId: string,
  window: ReturnType<typeof getControlGameDayWindow>,
  options: { excludeControlExcludedLines?: boolean } = {},
): Promise<SettlementSummary> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      parentId: true,
      rebateMode: true,
      rebatePercentage: true,
      maxRebatePercentage: true,
      baccaratRebateMode: true,
      baccaratRebatePercentage: true,
      maxBaccaratRebatePercentage: true,
    },
  });
  if (!agent) return emptySummary(window.gameDay);

  const includedAgentIds =
    options.excludeControlExcludedLines === false
      ? await listAgentDescendants(db, agent.id)
      : await listControlIncludedAgentDescendants(db, agent.id);
  const members = await db.user.findMany({
    where: { agentId: { in: includedAgentIds } },
    select: { id: true },
  });
  if (members.length === 0) return emptySummary(window.gameDay);

  const aggregate = await queryBetAggregate(db, window, {
    userIds: members.map((member) => member.id),
  });
  const parent = agent.parentId
    ? await db.agent.findUnique({
        where: { id: agent.parentId },
        select: {
          rebateMode: true,
          rebatePercentage: true,
          maxRebatePercentage: true,
          baccaratRebateMode: true,
          baccaratRebatePercentage: true,
          maxBaccaratRebatePercentage: true,
        },
      })
    : null;
  const electronicRate = parent
    ? effectiveDownlineRebate(parent, 'electronic')
    : effectiveDownlineRebate(agent, 'electronic');
  const baccaratRate = parent
    ? effectiveDownlineRebate(parent, 'baccarat')
    : effectiveDownlineRebate(agent, 'baccarat');
  return toSummary(
    window.gameDay,
    aggregate,
    calculateRebateAmountByCategory(
      {
        betAmount: aggregate.totalBet,
        electronicBetAmount: aggregate.electronicBetAmount,
        baccaratBetAmount: aggregate.baccaratBetAmount,
      },
      electronicRate,
      baccaratRate,
    ),
  );
}

async function queryBetAggregate(
  db: Db,
  window: ReturnType<typeof getControlGameDayWindow>,
  filter: { userId?: string; userIds?: string[] },
): Promise<BetAggregate> {
  if (filter.userIds && filter.userIds.length === 0) {
    return emptyAggregate();
  }

  const userWhere = filter.userId
    ? { userId: filter.userId }
    : filter.userIds
      ? { userId: { in: filter.userIds } }
      : {};

  const [standardAgg, baccaratAgg, crashAgg] = await Promise.all([
    db.bet.aggregate({
      where: {
        ...userWhere,
        status: 'SETTLED',
        createdAt: { gte: window.start, lt: window.end },
      },
      _count: { _all: true },
      _sum: { amount: true, payout: true, profit: true },
    }),
    db.bet.aggregate({
      where: {
        ...userWhere,
        gameId: { in: [...BACCARAT_GAME_IDS] },
        status: 'SETTLED',
        createdAt: { gte: window.start, lt: window.end },
      },
      _sum: { amount: true },
    }),
    db.crashBet.aggregate({
      where: {
        ...userWhere,
        createdAt: { gte: window.start, lt: window.end },
        round: { status: 'CRASHED' },
      },
      _count: { _all: true },
      _sum: { amount: true, payout: true },
    }),
  ]);

  const standardAmount = standardAgg._sum.amount ?? ZERO;
  const standardPayout = standardAgg._sum.payout ?? ZERO;
  const standardProfit = standardAgg._sum.profit ?? ZERO;
  const baccaratAmount = baccaratAgg._sum.amount ?? ZERO;
  const crashAmount = crashAgg._sum.amount ?? ZERO;
  const crashPayout = crashAgg._sum.payout ?? ZERO;
  const electronicAmount = standardAmount.sub(baccaratAmount).add(crashAmount);
  return {
    totalBet: standardAmount.add(crashAmount),
    totalPayout: standardPayout.add(crashPayout),
    memberWinLoss: standardProfit.add(crashPayout.sub(crashAmount)),
    totalBets: standardAgg._count._all + crashAgg._count._all,
    totalPlayers: await countDistinctPlayers(db, window, filter),
    electronicBetAmount: electronicAmount,
    baccaratBetAmount: baccaratAmount,
  };
}

async function countDistinctPlayers(
  db: Db,
  window: ReturnType<typeof getControlGameDayWindow>,
  filter: { userId?: string; userIds?: string[] },
): Promise<number> {
  if (filter.userIds && filter.userIds.length === 0) return 0;

  const userWhere = filter.userId
    ? filter.userId
    : filter.userIds
      ? { in: filter.userIds }
      : undefined;
  const [betPlayers, crashPlayers] = await Promise.all([
    db.bet.findMany({
      where: {
        ...(userWhere !== undefined ? { userId: userWhere } : {}),
        status: 'SETTLED',
        createdAt: { gte: window.start, lt: window.end },
      },
      select: { userId: true },
      distinct: ['userId'],
    }),
    db.crashBet.findMany({
      where: {
        ...(userWhere !== undefined ? { userId: userWhere } : {}),
        createdAt: { gte: window.start, lt: window.end },
        round: { status: 'CRASHED' },
      },
      select: { userId: true },
      distinct: ['userId'],
    }),
  ]);
  return new Set([...betPlayers.map((row) => row.userId), ...crashPlayers.map((row) => row.userId)])
    .size;
}

function emptyAggregate(): BetAggregate {
  return {
    totalBet: ZERO,
    totalPayout: ZERO,
    memberWinLoss: ZERO,
    totalBets: 0,
    totalPlayers: 0,
    electronicBetAmount: ZERO,
    baccaratBetAmount: ZERO,
  };
}

function emptySummary(gameDay: string): SettlementSummary {
  return {
    gameDay,
    totalBet: ZERO,
    totalPayout: ZERO,
    memberWinLoss: ZERO,
    totalRebate: ZERO,
    superiorSettlement: ZERO,
    totalBets: 0,
    totalPlayers: 0,
    status: 'red',
    statusText: '红色(上级持平)',
  };
}

function toSummary(
  gameDay: string,
  aggregate: BetAggregate,
  totalRebate: Prisma.Decimal,
): SettlementSummary {
  const superiorSettlement = aggregate.memberWinLoss.add(totalRebate).neg();
  return {
    gameDay,
    totalBet: aggregate.totalBet,
    totalPayout: aggregate.totalPayout,
    memberWinLoss: aggregate.memberWinLoss,
    totalRebate,
    superiorSettlement,
    totalBets: aggregate.totalBets,
    totalPlayers: aggregate.totalPlayers,
    status: superiorSettlement.gt(0) ? 'green' : 'red',
    statusText: superiorSettlement.gt(0) ? '绿色(上级盈利)' : '红色(上级亏损)',
  };
}
