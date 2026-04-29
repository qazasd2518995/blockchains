import { PrismaClient, Prisma } from '@prisma/client';
import {
  towerLayout,
  towerMultiplier,
  towerNextMultiplier,
  TOWER_CONFIG,
  TOWER_LEVELS,
  type TowerDifficulty,
} from '@bg/provably-fair';
import { GameId, type TowerRoundState, type TowerPickResult, type TowerCashoutResult } from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runSerializable,
  serializableTxOpts,
} from '../_common/BaseGameService.js';
import { applyControls, finalizeControls } from '../_common/controls.js';
import { ApiError } from '../../../utils/errors.js';
import type { TowerStartInput, TowerPickInput, TowerCashoutInput } from './tower.schema.js';

export class TowerService {
  constructor(private readonly prisma: PrismaClient) {}

  async start(userId: string, input: TowerStartInput): Promise<TowerRoundState> {
    const amount = new Prisma.Decimal(input.amount);

    return runSerializable(this.prisma, async (tx) => {
      const active = await tx.towerRound.findFirst({ where: { userId, status: 'ACTIVE' } });
      if (active) throw new ApiError('INVALID_ACTION', 'You have an active Tower round');

      await lockUserAndCheckFunds(tx, userId, amount);
      const seed = await new SeedHelper(tx).getActiveBundle(userId, 'tower', input.clientSeed);
      const layout = towerLayout(
        seed.serverSeed,
        seed.clientSeed,
        seed.nonce,
        input.difficulty as TowerDifficulty,
      );

      await debitAndRecord(tx, userId, amount);

      const round = await tx.towerRound.create({
        data: {
          userId,
          betAmount: amount,
          difficulty: input.difficulty,
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

      const difficulty = round.difficulty as TowerDifficulty;
      const cfg = TOWER_CONFIG[difficulty];
      if (input.col < 0 || input.col >= cfg.cols) {
        throw new ApiError('INVALID_ACTION', 'Col out of range');
      }

      const rawLayout = round.safeLayout as unknown as number[][];
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
      const controlled = await applyControls(tx, userId, GameId.TOWER, {
        won: rawSafe && predictedPayout.greaterThan(round.betAmount),
        amount: round.betAmount,
        multiplier: rawSafe ? nextMult : new Prisma.Decimal(0),
        payout: predictedPayout,
      });
      if (controlled.controlled) {
        layout = controlled.won
          ? forceTowerSafe(rawLayout, round.currentLevel, input.col, cfg.cols)
          : forceTowerTrap(rawLayout, round.currentLevel, input.col, cfg.cols);
      }
      const isSafe = (layout[round.currentLevel] ?? []).includes(input.col);
      const effectiveControl = isSafe !== rawSafe
        ? controlled
        : { ...controlled, controlled: false, flipReason: undefined, controlId: undefined };

      if (!isSafe) {
        const originalResult = {
          difficulty,
          layout: rawLayout,
          picks: [...round.picks, input.col],
          bustedLevel: round.currentLevel,
          safe: rawSafe,
        };
        const finalResult = {
          difficulty,
          layout,
          picks: [...round.picks, input.col],
          bustedLevel: round.currentLevel,
          controlled: effectiveControl.controlled,
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
          {
            won: rawSafe && predictedPayout.greaterThan(round.betAmount),
            amount: round.betAmount,
            multiplier: rawSafe ? nextMult : new Prisma.Decimal(0),
            payout: predictedPayout,
          },
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
        return {
          state: this.toState(updated, serverSeedRecord.seedHash, bet.id, true),
          hitTrap: true,
        };
      }

      const newLevel = nextLevel;
      const newMult = nextMult;
      const updated = await tx.towerRound.update({
        where: { id: round.id },
        data: {
          currentLevel: newLevel,
          picks: [...round.picks, input.col],
          currentMultiplier: newMult,
          safeLayout: layout as unknown as Prisma.InputJsonValue,
          ...(newLevel >= TOWER_LEVELS ? { status: 'CASHED_OUT', finishedAt: new Date() } : {}),
        },
      });
      return {
        state: this.toState(updated, serverSeedRecord.seedHash, undefined, newLevel >= TOWER_LEVELS),
        hitTrap: false,
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
      const controlled = await applyControls(tx, userId, GameId.TOWER, {
        won: payout.greaterThan(round.betAmount),
        amount: round.betAmount,
        multiplier,
        payout,
      });
      const forceLoss = controlled.controlled && !controlled.won;
      const finalMultiplier = forceLoss ? new Prisma.Decimal(0) : multiplier;
      const finalPayout = forceLoss ? new Prisma.Decimal(0) : payout;
      const profit = finalPayout.minus(round.betAmount);
      const finalStatus = forceLoss ? 'BUSTED' : 'CASHED_OUT';

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
        cashedOut: !forceLoss,
        bustedByCashoutControl: forceLoss,
        controlled: controlled.controlled,
        flipReason: controlled.flipReason ?? null,
        raw: controlled.controlled ? originalResult : null,
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
        { won: payout.greaterThan(round.betAmount), amount: round.betAmount, multiplier, payout },
        { won: finalPayout.greaterThan(round.betAmount), amount: round.betAmount, multiplier: finalMultiplier, payout: finalPayout },
        controlled,
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
    const difficulty = round.difficulty as TowerDifficulty;
    const cfg = TOWER_CONFIG[difficulty];
    const nextMult = towerNextMultiplier(difficulty, round.currentLevel);
    const potentialPayout = round.betAmount
      .mul(round.currentMultiplier)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    return {
      roundId: round.id,
      status: round.status,
      difficulty,
      cols: cfg.cols,
      totalLevels: TOWER_LEVELS,
      currentLevel: round.currentLevel,
      picks: round.picks,
      currentMultiplier: round.currentMultiplier.toFixed(4),
      nextMultiplier: nextMult !== null ? nextMult.toFixed(4) : null,
      amount: round.betAmount.toFixed(2),
      potentialPayout: potentialPayout.toFixed(2),
      ...(exposeLayout || round.status !== 'ACTIVE'
        ? { revealedLayout: round.safeLayout as unknown as number[][] }
        : {}),
      serverSeedHash,
      nonce: round.nonce,
    };
  }
}

function forceTowerSafe(layout: number[][], level: number, col: number, cols: number): number[][] {
  const next = layout.map((row) => row.slice());
  const safe = new Set(next[level] ?? []);
  if (!safe.has(col)) {
    const keep = Array.from(safe).filter((value) => value !== Array.from(safe)[0]);
    keep.push(col);
    next[level] = keep.sort((a, b) => a - b);
  }
  return trimTowerSafeCount(next, level, layout[level]?.length ?? 1, cols);
}

function forceTowerTrap(layout: number[][], level: number, col: number, cols: number): number[][] {
  const next = layout.map((row) => row.slice());
  const safe = new Set(next[level] ?? []);
  if (safe.has(col)) {
    safe.delete(col);
    const replacement = Array.from({ length: cols }, (_, index) => index)
      .find((value) => !safe.has(value) && value !== col);
    if (replacement !== undefined) safe.add(replacement);
    next[level] = Array.from(safe).sort((a, b) => a - b);
  }
  return trimTowerSafeCount(next, level, layout[level]?.length ?? 1, cols);
}

function trimTowerSafeCount(layout: number[][], level: number, safeCount: number, cols: number): number[][] {
  const safe = new Set(layout[level] ?? []);
  for (let col = 0; safe.size < safeCount && col < cols; col += 1) safe.add(col);
  layout[level] = Array.from(safe).slice(0, safeCount).sort((a, b) => a - b);
  return layout;
}
