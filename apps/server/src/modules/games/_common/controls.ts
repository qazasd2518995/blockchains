import { Prisma } from '@prisma/client';

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
}

const DEFAULT_AGENT_LINE_CONTROL_WIN_RATE = new Prisma.Decimal('0.30');
const DEFAULT_AGENT_LINE_TRIGGER_THRESHOLD = new Prisma.Decimal('0.80');

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

  if (predictedNetWin) return { ...predicted, controlled: false };
  return flipToWin(predicted, decision.reason, decision.controlId);
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
          multiplier: final.multiplier.toFixed(4),
          payout: final.payout.toFixed(2),
          result: finalResult,
        },
        flipReason: outcome.flipReason,
      },
    });
  }
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function isNetWin(result: PredictedResult | FinalizedControlResult): boolean {
  return result.payout.greaterThan(result.amount);
}

async function findControlDecision(
  tx: Db,
  member: MemberScope,
  predicted: PredictedResult,
): Promise<ControlDecision | null> {
  const deposit = await findDepositDecision(tx, member);
  if (deposit) return deposit;

  const memberCap = await findMemberWinCapDecision(tx, member.id, predicted);
  if (memberCap) return memberCap;

  const agentLineCap = await findAgentLineCapDecision(tx, member.agentId, predicted);
  if (agentLineCap) return agentLineCap;

  return findWinLossDecision(tx, member);
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

    const triggerThreshold =
      'triggerThreshold' in normalized
        ? (normalized as { triggerThreshold?: Prisma.Decimal }).triggerThreshold ?? DEFAULT_AGENT_LINE_TRIGGER_THRESHOLD
        : DEFAULT_AGENT_LINE_TRIGGER_THRESHOLD;
    const controlWinRate =
      'controlWinRate' in normalized
        ? (normalized as { controlWinRate?: Prisma.Decimal }).controlWinRate ?? DEFAULT_AGENT_LINE_CONTROL_WIN_RATE
        : DEFAULT_AGENT_LINE_CONTROL_WIN_RATE;
    if (todayWin.greaterThanOrEqualTo(cap.mul(triggerThreshold))) {
      return {
        desired: Math.random() < Number(controlWinRate) ? 'WIN' : 'LOSS',
        controlId: normalized.id,
        reason: 'agent_line_cap_rate',
      };
    }
  }

  return null;
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
        if (control.lossControl) return { control, priority: 3, desired: 'LOSS' as const };
      }

      if (control.controlMode === 'AGENT_LINE' && control.targetId && ancestors.includes(control.targetId)) {
        const depth = ancestors.indexOf(control.targetId);
        if (control.winControl) return { control, priority: 20 + depth, desired: 'WIN' as const };
        if (control.lossControl) return { control, priority: 40 + depth, desired: 'LOSS' as const };
      }

      if (control.controlMode === 'AUTO_DETECT' || control.controlMode === 'NORMAL') {
        if (control.winControl) return { control, priority: 80, desired: 'WIN' as const };
        if (control.lossControl) return { control, priority: 81, desired: 'LOSS' as const };
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
      data: { todayWinAmount: nextWin },
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

async function normalizeMemberWinCapDay(
  tx: Db,
  control: Awaited<ReturnType<Db['memberWinCapControl']['findFirst']>> & { id: string },
) {
  const day = todayString();
  if (control.currentGameDay === day) return control;
  return tx.memberWinCapControl.update({
    where: { id: control.id },
    data: {
      currentGameDay: day,
      todayWinAmount: new Prisma.Decimal(0),
      todayBetCount: 0,
      isCapped: false,
    },
  });
}

async function normalizeAgentLineCapDay(
  tx: Db,
  control: Awaited<ReturnType<Db['agentLineWinCap']['findFirst']>> & { id: string },
) {
  const day = todayString();
  if (control.currentGameDay === day) return control;
  return tx.agentLineWinCap.update({
    where: { id: control.id },
    data: {
      currentGameDay: day,
      todayWinAmount: new Prisma.Decimal(0),
    },
  });
}

async function getAgentAncestors(tx: Db, agentId: string): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string; depth: number }[]>`
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

function flipToLoss(p: PredictedResult, reason: string, controlId: string): ControlOutcome {
  return {
    won: false,
    multiplier: new Prisma.Decimal(0),
    payout: new Prisma.Decimal(0),
    controlled: true,
    flipReason: reason,
    controlId,
  };
}

function flipToWin(p: PredictedResult, reason: string, controlId: string): ControlOutcome {
  const multiplier = p.multiplier.greaterThan(1) ? p.multiplier : new Prisma.Decimal(2);
  return {
    won: true,
    multiplier,
    payout: p.amount.mul(multiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN),
    controlled: true,
    flipReason: reason,
    controlId,
  };
}
