import { PrismaClient, Prisma } from '@prisma/client';
import {
  towerLayout,
  towerMultiplier,
  towerSafeCountForLevel,
  TOWER_CONFIG,
  type TowerDifficulty,
} from '@bg/provably-fair';
import {
  GameId,
  type TowerRoundState,
  type TowerPickResult,
  type TowerCashoutResult,
} from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runSerializable,
  serializableTxOpts,
} from '../_common/BaseGameService.js';
import {
  applyControls,
  finalizeControls,
  multiplierExceedsControlCeiling,
  type ControlOutcome,
} from '../_common/controls.js';
import {
  buildEntertainmentShapeMeta,
  shapeControlOutcomeForEntertainment,
  shouldAllowEntertainmentSafeProgress,
  type EntertainmentShapeMeta,
} from '../_common/entertainmentShaper.js';
import { pickRandomItem } from '../_common/resultSelection.js';
import { ApiError } from '../../../utils/errors.js';
import type { TowerStartInput, TowerPickInput, TowerCashoutInput } from './tower.schema.js';

const TOWER_FORCED_LOSS_GRACE_LEVELS = 0;
const TOWER_VISIBLE_LEVELS = 9;
const TOWER_REPEAT_COLUMN_FORCED_LOSS_STREAK = 3;
const TOWER_LATE_LEVEL_FORCED_LOSS_START: Partial<Record<TowerDifficulty, number>> = {
  // 0-indexed currentLevel: expert level 6, master level 5.
  expert: 5,
  master: 4,
};

export class TowerService {
  constructor(private readonly prisma: PrismaClient) {}

  async start(userId: string, input: TowerStartInput): Promise<TowerRoundState> {
    const amount = new Prisma.Decimal(input.amount);

    return runSerializable(this.prisma, async (tx) => {
      const active = await tx.towerRound.findFirst({ where: { userId, status: 'ACTIVE' } });
      if (active) throw new ApiError('INVALID_ACTION', 'You have an active Tower round');

      await lockUserAndCheckFunds(tx, userId, amount, GameId.TOWER);
      const seed = await new SeedHelper(tx).getActiveBundle(userId, 'tower', input.clientSeed);
      const difficulty = input.difficulty as TowerDifficulty;
      const layout = ensureTowerVisibleLayout(
        towerLayout(seed.serverSeed, seed.clientSeed, seed.nonce, difficulty),
        difficulty,
        seed.nonce,
      );

      await debitAndRecord(tx, userId, amount);

      const round = await tx.towerRound.create({
        data: {
          userId,
          betAmount: amount,
          difficulty,
          safeLayout: layout as unknown as Prisma.InputJsonValue,
          picks: [],
          currentLevel: 0,
          currentMultiplier: new Prisma.Decimal(1),
          status: 'ACTIVE',
          nonce: seed.nonce,
          serverSeedId: seed.serverSeedId,
          clientSeedUsed: seed.clientSeed,
        },
      });

      return this.toState(round, seed.serverSeedHash);
    });
  }

  async pick(userId: string, input: TowerPickInput): Promise<TowerPickResult> {
    return runSerializable(this.prisma, async (tx) => {
      const round = await tx.towerRound.findFirst({
        where: { id: input.roundId, userId },
      });
      if (!round) throw new ApiError('ROUND_NOT_FOUND', 'Round not found');
      if (round.status !== 'ACTIVE') throw new ApiError('ROUND_NOT_ACTIVE', 'Round is not active');
      if (input.level !== undefined && input.level !== round.currentLevel) {
        throw new ApiError('INVALID_ACTION', 'Selected tower level is no longer active');
      }

      const difficulty = normalizeTowerDifficulty(round.difficulty);
      const cfg = TOWER_CONFIG[difficulty];
      const totalLevels = towerVisibleLevelCount();
      if (round.currentLevel >= totalLevels) {
        throw new ApiError('INVALID_ACTION', 'Tower is already complete');
      }
      if (input.col < 0 || input.col >= cfg.cols) {
        throw new ApiError('INVALID_ACTION', 'Col out of range');
      }

      const rawLayout = ensureTowerVisibleLayout(
        round.safeLayout as unknown as number[][],
        difficulty,
        round.nonce,
      );
      let layout = rawLayout;
      const safeCols = rawLayout[round.currentLevel] ?? [];
      const rawSafe = safeCols.includes(input.col);

      const serverSeedRecord = await tx.serverSeed.findUniqueOrThrow({
        where: { id: round.serverSeedId },
      });
      const nextLevel = round.currentLevel + 1;
      const nextMult = new Prisma.Decimal(towerMultiplier(difficulty, nextLevel).toFixed(4));
      const predictedPayout = rawSafe
        ? round.betAmount.mul(nextMult).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN)
        : new Prisma.Decimal(0);
      const predictedProgress = {
        won: rawSafe,
        amount: round.betAmount,
        multiplier: rawSafe ? nextMult : new Prisma.Decimal(0),
        payout: predictedPayout,
      };
      const controlled = await applyControls(tx, userId, GameId.TOWER, predictedProgress, {
        forceLossOnProgress: true,
      });
      const controlledWinExceedsTowerCeiling =
        controlled.controlled &&
        controlled.won &&
        multiplierExceedsControlCeiling(nextMult, round.betAmount, controlled);
      const shapedControl =
        controlledWinExceedsTowerCeiling
          ? {
              ...controlled,
              won: false,
              multiplier: new Prisma.Decimal(0),
              payout: new Prisma.Decimal(0),
              flipReason: controlled.flipReason?.startsWith('burst_')
                ? 'burst_risk_guard'
                : controlled.flipReason,
            }
          : controlled;
      const lateLevelForcedLoss = mustForceTowerLateLevelLoss(difficulty, round.currentLevel);
      const repeatedColumnForcedLoss = mustForceTowerRepeatedColumnLoss(round.picks, input.col);
      const entertainmentSafeProgress = shouldAllowEntertainmentSafeProgress({
        outcome: shapedControl,
        amount: round.betAmount,
        nextMultiplier: nextMult,
        gameKind: 'tower',
        progressIndex: round.currentLevel,
      });
      const canForceLoss = canForceTowerLossAtLevel(round.currentLevel);
      if (shapedControl.controlled) {
        layout = shapedControl.won
          ? forceTowerSafe(rawLayout, round.currentLevel, input.col, cfg.cols)
          : canForceLoss && !entertainmentSafeProgress
            ? forceTowerTrap(rawLayout, round.currentLevel, input.col, cfg.cols)
            : rawLayout;
      }
      if (lateLevelForcedLoss || repeatedColumnForcedLoss) {
        layout = forceTowerTrap(layout, round.currentLevel, input.col, cfg.cols);
      }
      const isSafe = (layout[round.currentLevel] ?? []).includes(input.col);
      const effectiveControl = resolveTowerEffectiveControl(shapedControl, {
        rawSafe,
        isSafe,
        lateLevelForcedLoss,
        repeatedColumnForcedLoss,
      });

      if (!isSafe) {
        const originalResult = {
          difficulty,
          layout: rawLayout,
          picks: [...round.picks, input.col],
          bustedLevel: round.currentLevel,
          safe: rawSafe,
          forcedByTowerRiskLimit: false,
          forcedByRepeatedColumnRisk: false,
        };
        const finalResult = {
          difficulty,
          layout,
          picks: [...round.picks, input.col],
          bustedLevel: round.currentLevel,
          controlled: effectiveControl.controlled,
          forcedByTowerRiskLimit: lateLevelForcedLoss,
          forcedByRepeatedColumnRisk: repeatedColumnForcedLoss,
          flipReason: effectiveControl.flipReason ?? null,
          raw: effectiveControl.controlled ? originalResult : null,
        };
        const bet = await tx.bet.create({
          data: {
            userId,
            gameId: GameId.TOWER,
            amount: round.betAmount,
            multiplier: new Prisma.Decimal(0),
            payout: new Prisma.Decimal(0),
            profit: round.betAmount.negated(),
            nonce: round.nonce,
            clientSeedUsed: round.clientSeedUsed,
            serverSeedId: round.serverSeedId,
            resultData: finalResult as unknown as Prisma.InputJsonValue,
            towerRoundId: round.id,
          },
        });
        const updated = await tx.towerRound.update({
          where: { id: round.id },
          data: {
            picks: [...round.picks, input.col],
            safeLayout: layout as unknown as Prisma.InputJsonValue,
            status: 'BUSTED',
            finishedAt: new Date(),
          },
        });
        await finalizeControls(
          tx,
          userId,
          GameId.TOWER,
          predictedProgress,
          {
            won: false,
            amount: round.betAmount,
            multiplier: new Prisma.Decimal(0),
            payout: new Prisma.Decimal(0),
          },
          effectiveControl,
          bet.id,
          originalResult as unknown as Prisma.InputJsonValue,
          finalResult as unknown as Prisma.InputJsonValue,
        );
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { balance: true },
        });
        return {
          state: this.toState(updated, serverSeedRecord.seedHash, bet.id, true),
          hitTrap: true,
          newBalance: user.balance.toFixed(2),
        };
      }

      const newLevel = nextLevel;
      const newMult = nextMult;
      const nextPicks = [...round.picks, input.col];
      const autoCashout = newLevel >= totalLevels;
      const updated = await tx.towerRound.update({
        where: { id: round.id },
        data: {
          currentLevel: newLevel,
          picks: nextPicks,
          currentMultiplier: newMult,
          safeLayout: layout as unknown as Prisma.InputJsonValue,
          ...(autoCashout ? { status: 'CASHED_OUT', finishedAt: new Date() } : {}),
        },
      });
      let betId: string | undefined;
      let newBalance: Prisma.Decimal | undefined;
      if (autoCashout) {
        const payout = round.betAmount.mul(newMult).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
        const profit = payout.minus(round.betAmount);
        const originalResult = {
          difficulty,
          layout: rawLayout,
          picks: nextPicks,
          completedTower: rawSafe,
        };
        const finalResult = {
          difficulty,
          layout,
          picks: nextPicks,
          completedTower: true,
          autoCashedOut: true,
          controlled: effectiveControl.controlled,
          flipReason: effectiveControl.flipReason ?? null,
          raw: effectiveControl.controlled ? originalResult : null,
        };
        const bet = await tx.bet.create({
          data: {
            userId,
            gameId: GameId.TOWER,
            amount: round.betAmount,
            multiplier: newMult,
            payout,
            profit,
            nonce: round.nonce,
            clientSeedUsed: round.clientSeedUsed,
            serverSeedId: round.serverSeedId,
            resultData: finalResult as unknown as Prisma.InputJsonValue,
            towerRoundId: round.id,
          },
        });
        betId = bet.id;
        newBalance = await creditAndRecord(tx, userId, payout, bet.id, 'CASHOUT');
        await finalizeControls(
          tx,
          userId,
          GameId.TOWER,
          predictedProgress,
          {
            won: payout.greaterThan(round.betAmount),
            amount: round.betAmount,
            multiplier: newMult,
            payout,
          },
          effectiveControl,
          bet.id,
          originalResult as unknown as Prisma.InputJsonValue,
          finalResult as unknown as Prisma.InputJsonValue,
        );
      }
      return {
        state: this.toState(updated, serverSeedRecord.seedHash, betId, autoCashout),
        hitTrap: false,
        ...(newBalance ? { newBalance: newBalance.toFixed(2) } : {}),
      };
    });
  }

  async cashout(userId: string, input: TowerCashoutInput): Promise<TowerCashoutResult> {
    return runSerializable(this.prisma, async (tx) => {
      const round = await tx.towerRound.findFirst({ where: { id: input.roundId, userId } });
      if (!round) throw new ApiError('ROUND_NOT_FOUND', 'Round not found');
      if (round.status !== 'ACTIVE') throw new ApiError('ROUND_NOT_ACTIVE', 'Round is not active');
      if (round.currentLevel <= 0) {
        throw new ApiError('INVALID_ACTION', 'Clear at least one level before cashing out');
      }

      const serverSeedRecord = await tx.serverSeed.findUniqueOrThrow({
        where: { id: round.serverSeedId },
      });

      const multiplier = round.currentMultiplier;
      const payout = round.betAmount.mul(multiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const predicted = {
        won: payout.greaterThan(round.betAmount),
        amount: round.betAmount,
        multiplier,
        payout,
      };
      const controlOutcome = await applyControls(tx, userId, GameId.TOWER, predicted);
      const entertainmentShape = shapeControlOutcomeForEntertainment(
        controlOutcome,
        round.betAmount,
        'tower',
        round.currentLevel + round.nonce,
      );
      const effectiveControl = entertainmentShape?.outcome ?? controlOutcome;
      const finalMultiplier = effectiveControl.controlled ? effectiveControl.multiplier : multiplier;
      const finalPayout = effectiveControl.controlled ? effectiveControl.payout : payout;
      const profit = finalPayout.minus(round.betAmount);
      const entertainmentMeta: EntertainmentShapeMeta | undefined = entertainmentShape
        ? buildEntertainmentShapeMeta(
            entertainmentShape.envelope,
            controlOutcome.multiplier,
            finalMultiplier,
            finalPayout,
          )
        : undefined;
      const bustedByCashoutControl =
        effectiveControl.controlled && !effectiveControl.won && finalPayout.lessThanOrEqualTo(0);
      const finalStatus = bustedByCashoutControl ? 'BUSTED' : 'CASHED_OUT';

      const originalResult = {
        difficulty: round.difficulty,
        layout: round.safeLayout,
        picks: round.picks,
        cashedOut: true,
      };
      const finalResult = {
        difficulty: round.difficulty,
        layout: round.safeLayout,
        picks: round.picks,
        cashedOut: !bustedByCashoutControl,
        bustedByCashoutControl,
        controlled: effectiveControl.controlled,
        flipReason: effectiveControl.flipReason ?? null,
        ...(entertainmentMeta ? { entertainment: entertainmentMeta } : {}),
        raw: effectiveControl.controlled ? originalResult : null,
      };

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: GameId.TOWER,
          amount: round.betAmount,
          multiplier: finalMultiplier,
          payout: finalPayout,
          profit,
          nonce: round.nonce,
          clientSeedUsed: round.clientSeedUsed,
          serverSeedId: round.serverSeedId,
          resultData: finalResult as unknown as Prisma.InputJsonValue,
          towerRoundId: round.id,
        },
      });
      const newBalance = finalPayout.greaterThan(0)
        ? await creditAndRecord(tx, userId, finalPayout, bet.id, 'CASHOUT')
        : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;
      const updated = await tx.towerRound.update({
        where: { id: round.id },
        data: { status: finalStatus, finishedAt: new Date() },
      });
      await finalizeControls(
        tx,
        userId,
        GameId.TOWER,
        predicted,
        {
          won: finalPayout.greaterThan(round.betAmount),
          amount: round.betAmount,
          multiplier: finalMultiplier,
          payout: finalPayout,
        },
        effectiveControl,
        bet.id,
        originalResult as unknown as Prisma.InputJsonValue,
        finalResult as unknown as Prisma.InputJsonValue,
      );
      return {
        state: this.toState(updated, serverSeedRecord.seedHash, bet.id, true),
        payout: finalPayout.toFixed(2),
        newBalance: newBalance.toFixed(2),
      };
    });
  }

  async getActive(userId: string): Promise<TowerRoundState | null> {
    const round = await this.prisma.towerRound.findFirst({
      where: { userId, status: 'ACTIVE' },
    });
    if (!round) return null;
    const serverSeedRecord = await this.prisma.serverSeed.findUniqueOrThrow({
      where: { id: round.serverSeedId },
    });
    return this.toState(round, serverSeedRecord.seedHash);
  }

  private toState(
    round: {
      id: string;
      status: 'ACTIVE' | 'BUSTED' | 'CASHED_OUT';
      difficulty: string;
      safeLayout: Prisma.JsonValue;
      picks: number[];
      currentLevel: number;
      currentMultiplier: Prisma.Decimal;
      betAmount: Prisma.Decimal;
      nonce: number;
    },
    serverSeedHash: string,
    _betId?: string,
    exposeLayout = false,
  ): TowerRoundState {
    const difficulty = normalizeTowerDifficulty(round.difficulty);
    const cfg = TOWER_CONFIG[difficulty];
    const nextMult = towerNextVisibleMultiplier(difficulty, round.currentLevel);
    const totalLevels = towerVisibleLevelCount();
    const potentialPayout = round.betAmount
      .mul(round.currentMultiplier)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    const visibleLayout = ensureTowerVisibleLayout(
      round.safeLayout as unknown as number[][],
      difficulty,
      round.nonce,
    );
    return {
      roundId: round.id,
      status: round.status,
      difficulty,
      cols: cfg.cols,
      totalLevels,
      currentLevel: round.currentLevel,
      picks: round.picks,
      currentMultiplier: round.currentMultiplier.toFixed(4),
      nextMultiplier: nextMult !== null ? nextMult.toFixed(4) : null,
      amount: round.betAmount.toFixed(2),
      potentialPayout: potentialPayout.toFixed(2),
      ...(exposeLayout || round.status !== 'ACTIVE'
        ? { revealedLayout: visibleLayout }
        : {}),
      serverSeedHash,
      nonce: round.nonce,
    };
  }
}

function canForceTowerLossAtLevel(level: number): boolean {
  return level >= TOWER_FORCED_LOSS_GRACE_LEVELS;
}

function towerVisibleLevelCount(): number {
  return TOWER_VISIBLE_LEVELS;
}

function towerNextVisibleMultiplier(
  difficulty: TowerDifficulty,
  currentLevel: number,
): number | null {
  if (currentLevel >= towerVisibleLevelCount()) return null;
  return towerMultiplier(difficulty, currentLevel + 1);
}

function mustForceTowerLateLevelLoss(difficulty: TowerDifficulty, level: number): boolean {
  const forcedLossStart = TOWER_LATE_LEVEL_FORCED_LOSS_START[difficulty];
  return forcedLossStart !== undefined && level >= forcedLossStart;
}

function mustForceTowerRepeatedColumnLoss(picks: number[], col: number): boolean {
  if (picks.length < TOWER_REPEAT_COLUMN_FORCED_LOSS_STREAK - 1) return false;
  const recent = picks.slice(-(TOWER_REPEAT_COLUMN_FORCED_LOSS_STREAK - 1));
  return recent.every((pick) => pick === col);
}

function resolveTowerEffectiveControl(
  shapedControl: ControlOutcome,
  context: {
    rawSafe: boolean;
    isSafe: boolean;
    lateLevelForcedLoss: boolean;
    repeatedColumnForcedLoss?: boolean;
  },
): ControlOutcome {
  if (context.lateLevelForcedLoss || context.repeatedColumnForcedLoss) {
    return shapedControl.controlled && !shapedControl.won
      ? shapedControl
      : { ...shapedControl, controlled: false, flipReason: undefined, controlId: undefined };
  }
  return context.isSafe !== context.rawSafe
    ? shapedControl
    : { ...shapedControl, controlled: false, flipReason: undefined, controlId: undefined };
}

function ensureTowerVisibleLayout(
  layout: number[][],
  difficulty: TowerDifficulty,
  nonce: number,
): number[][] {
  const cfg = TOWER_CONFIG[difficulty];
  const next = Array.from({ length: towerVisibleLevelCount() }, (_, level) => {
    const safeCount = towerSafeCountForLevel(difficulty, level);
    const row = normalizeTowerSafeRow(layout[level], cfg.cols, safeCount);
    return row ?? deterministicTowerSafeRow(difficulty, level, nonce, cfg.cols, safeCount);
  });
  return next;
}

function normalizeTowerSafeRow(
  row: number[] | undefined,
  cols: number,
  safeCount: number,
): number[] | null {
  if (!Array.isArray(row)) return null;
  const safe = Array.from(
    new Set(row.filter((col) => Number.isInteger(col) && col >= 0 && col < cols)),
  ).sort((a, b) => a - b);
  if (safe.length !== safeCount) return null;
  return safe;
}

function deterministicTowerSafeRow(
  difficulty: TowerDifficulty,
  level: number,
  nonce: number,
  cols: number,
  safeCount: number,
): number[] {
  const positions = Array.from({ length: cols }, (_, index) => index);
  let state =
    (Math.imul(nonce + 1, 1664525) ^
      Math.imul(level + 1, 1013904223) ^
      Math.imul(difficulty.length + 1, 265443576)) >>>
    0;
  for (let index = cols - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    const current = positions[index]!;
    positions[index] = positions[swapIndex]!;
    positions[swapIndex] = current;
  }
  return positions.slice(0, safeCount).sort((a, b) => a - b);
}

function forceTowerSafe(layout: number[][], level: number, col: number, cols: number): number[][] {
  const next = layout.map((row) => row.slice());
  const safe = new Set(next[level] ?? []);
  if (!safe.has(col)) {
    const removed = pickRandomItem(Array.from(safe));
    const keep = Array.from(safe).filter((value) => value !== removed);
    keep.push(col);
    next[level] = keep.sort((a, b) => a - b);
  }
  return trimTowerSafeCount(next, level, layout[level]?.length ?? 1, cols);
}

function normalizeTowerDifficulty(difficulty: string): TowerDifficulty {
  if (
    difficulty === 'easy' ||
    difficulty === 'medium' ||
    difficulty === 'hard' ||
    difficulty === 'expert' ||
    difficulty === 'master'
  ) {
    return difficulty;
  }
  return 'hard';
}

function forceTowerTrap(layout: number[][], level: number, col: number, cols: number): number[][] {
  const next = layout.map((row) => row.slice());
  const safe = new Set(next[level] ?? []);
  if (safe.has(col)) {
    safe.delete(col);
    const replacement = pickRandomItem(
      Array.from({ length: cols }, (_, index) => index).filter(
        (value) => !safe.has(value) && value !== col,
      ),
    );
    if (replacement !== undefined) safe.add(replacement);
    next[level] = Array.from(safe).sort((a, b) => a - b);
  }
  return trimTowerSafeCount(next, level, layout[level]?.length ?? 1, cols);
}

function trimTowerSafeCount(
  layout: number[][],
  level: number,
  safeCount: number,
  cols: number,
): number[][] {
  const safe = new Set(layout[level] ?? []);
  while (safe.size < safeCount) {
    const replacement = pickRandomItem(
      Array.from({ length: cols }, (_, index) => index).filter((col) => !safe.has(col)),
    );
    if (replacement === undefined) break;
    safe.add(replacement);
  }
  while (safe.size > safeCount) {
    const removed = pickRandomItem(Array.from(safe));
    if (removed === undefined) break;
    safe.delete(removed);
  }
  layout[level] = Array.from(safe).sort((a, b) => a - b);
  return layout;
}

export const __towerServiceTestHooks = {
  canForceTowerLossAtLevel,
  towerVisibleLevelCount,
  towerNextVisibleMultiplier,
  mustForceTowerLateLevelLoss,
  mustForceTowerRepeatedColumnLoss,
  resolveTowerEffectiveControl,
  ensureTowerVisibleLayout,
};
