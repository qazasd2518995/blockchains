import { Prisma } from '@prisma/client';

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

/**
 * Phase F 控制 hook：在每筆遊戲結算前呼叫，決定是否要翻轉結果。
 *
 * 完整克隆 `/Users/justin/Desktop/Bet/agent/api/*` 的邏輯：
 *   1) MemberDepositControl — 依 controlWinRate roll，未達 targetProfit 時調整勝率
 *   2) MemberWinCapControl — 今日贏額達 cap → force loss
 *   3) AgentLineWinCap — 代理線今日贏額達 dailyCap → force loss
 *   4) WinLossControl — 依 mode + controlPercentage 主動翻轉輸贏
 *
 * 所有翻轉都寫入 WinLossControlLogs 供審計。
 *
 * ⚠️ 與 Provably Fair 關係：PF 的 HMAC 原始結果仍會寫進 Bet.resultData，
 *    但 Bet.payout/profit 會反映 controlled 後的最終值。
 *    回給前端的 response 可帶 `controlled` 旗標讓玩家端知悉此局受控。
 */
export async function applyControls(
  tx: Prisma.TransactionClient,
  userId: string,
  gameId: string,
  predicted: PredictedResult,
): Promise<ControlOutcome> {
  const member = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, agentId: true, username: true },
  });
  if (!member) {
    return { ...predicted, controlled: false };
  }

  // === 1) MemberDepositControl ===
  const depositCtrl = await tx.memberDepositControl.findFirst({
    where: { memberId: userId, isActive: true, isCompleted: false },
    orderBy: { createdAt: 'desc' },
  });
  if (depositCtrl) {
    const rate = Number(depositCtrl.controlWinRate);
    const shouldWin = Math.random() < rate;
    if (predicted.won && !shouldWin) {
      await logFlip(tx, depositCtrl.id, userId, gameId, predicted, 'deposit_control');
      return flipToLoss(predicted, 'deposit_control', depositCtrl.id);
    }
    if (!predicted.won && shouldWin) {
      await logFlip(tx, depositCtrl.id, userId, gameId, predicted, 'deposit_control');
      return flipToWin(predicted, 'deposit_control', depositCtrl.id);
    }
  }

  // === 2) MemberWinCapControl ===
  const winCap = await tx.memberWinCapControl.findFirst({
    where: { memberId: userId, isActive: true, isCapped: false },
  });
  if (winCap && predicted.won) {
    const projectedTodayWin = winCap.todayWinAmount.add(predicted.payout.sub(predicted.amount));
    if (projectedTodayWin.greaterThanOrEqualTo(winCap.winCapAmount)) {
      await tx.memberWinCapControl.update({
        where: { id: winCap.id },
        data: { isCapped: true },
      });
      await logFlip(tx, winCap.id, userId, gameId, predicted, 'win_cap');
      return flipToLoss(predicted, 'win_cap', winCap.id);
    }
  }

  // === 3) AgentLineWinCap ===
  if (member.agentId && predicted.won) {
    const lineCap = await tx.agentLineWinCap.findFirst({
      where: { agentId: member.agentId, isActive: true },
    });
    if (lineCap) {
      const projectedLineWin = lineCap.todayWinAmount.add(predicted.payout.sub(predicted.amount));
      if (projectedLineWin.greaterThanOrEqualTo(lineCap.dailyCap)) {
        await logFlip(tx, lineCap.id, userId, gameId, predicted, 'agent_line_cap');
        return flipToLoss(predicted, 'agent_line_cap', lineCap.id);
      }
    }
  }

  // === 4) WinLossControl ===
  const orConditions: Prisma.WinLossControlWhereInput[] = [
    { controlMode: 'SINGLE_MEMBER', targetType: 'member', targetId: userId },
    { controlMode: 'NORMAL', targetType: null },
  ];
  if (member.agentId) {
    orConditions.push({
      controlMode: 'AGENT_LINE',
      targetType: 'agent',
      targetId: member.agentId,
    });
  }
  const wlc = await tx.winLossControl.findFirst({
    where: {
      isActive: true,
      OR: orConditions,
    },
    orderBy: { createdAt: 'desc' },
  });
  if (wlc) {
    const pct = Number(wlc.controlPercentage) / 100;
    const roll = Math.random();
    if (wlc.lossControl && predicted.won && roll < pct) {
      await logFlip(tx, wlc.id, userId, gameId, predicted, 'loss_control');
      return flipToLoss(predicted, 'loss_control', wlc.id);
    }
    if (wlc.winControl && !predicted.won && roll < pct) {
      await logFlip(tx, wlc.id, userId, gameId, predicted, 'win_control');
      return flipToWin(predicted, 'win_control', wlc.id);
    }
  }

  // 更新 winCap 今日累計（正常派獎時）
  if (winCap && predicted.won) {
    const profit = predicted.payout.sub(predicted.amount);
    await tx.memberWinCapControl.update({
      where: { id: winCap.id },
      data: {
        todayWinAmount: winCap.todayWinAmount.add(profit),
        todayBetCount: winCap.todayBetCount + 1,
      },
    });
  }

  return { ...predicted, controlled: false };
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
  const mult = p.multiplier.greaterThan(1) ? p.multiplier : p.multiplier.add(1);
  return {
    won: true,
    multiplier: mult,
    payout: p.amount.mul(mult),
    controlled: true,
    flipReason: reason,
    controlId,
  };
}

async function logFlip(
  tx: Prisma.TransactionClient,
  controlId: string,
  userId: string,
  gameId: string,
  predicted: PredictedResult,
  reason: string,
): Promise<void> {
  await tx.winLossControlLogs.create({
    data: {
      controlId,
      userId,
      gameId,
      originalResult: {
        won: predicted.won,
        multiplier: predicted.multiplier.toFixed(4),
        payout: predicted.payout.toFixed(2),
      },
      finalResult: {
        won: !predicted.won,
        flipReason: reason,
      },
      flipReason: reason,
    },
  });
}
