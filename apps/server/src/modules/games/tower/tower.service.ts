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

      const layout = round.safeLayout as unknown as number[][];
      const safeCols = layout[round.currentLevel] ?? [];
      const isSafe = safeCols.includes(input.col);

      const serverSeedRecord = await tx.serverSeed.findUniqueOrThrow({
        where: { id: round.serverSeedId },
      });

      if (!isSafe) {
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
            resultData: {
              difficulty,
              layout,
              picks: [...round.picks, input.col],
              bustedLevel: round.currentLevel,
            },
            towerRoundId: round.id,
          },
        });
        const updated = await tx.towerRound.update({
          where: { id: round.id },
          data: {
            picks: [...round.picks, input.col],
            status: 'BUSTED',
            finishedAt: new Date(),
          },
        });
        return {
          state: this.toState(updated, serverSeedRecord.seedHash, bet.id, true),
          hitTrap: true,
        };
      }

      const newLevel = round.currentLevel + 1;
      const newMult = new Prisma.Decimal(
        towerMultiplier(difficulty, newLevel).toFixed(4),
      );
      const updated = await tx.towerRound.update({
        where: { id: round.id },
        data: {
          currentLevel: newLevel,
          picks: [...round.picks, input.col],
          currentMultiplier: newMult,
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
      const profit = payout.minus(round.betAmount);

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: GameId.TOWER,
          amount: round.betAmount,
          multiplier,
          payout,
          profit,
          nonce: round.nonce,
          clientSeedUsed: round.clientSeedUsed,
          serverSeedId: round.serverSeedId,
          resultData: {
            difficulty: round.difficulty,
            layout: round.safeLayout,
            picks: round.picks,
            cashedOut: true,
          },
          towerRoundId: round.id,
        },
      });
      const newBalance = await creditAndRecord(tx, userId, payout, bet.id, 'CASHOUT');
      const updated = await tx.towerRound.update({
        where: { id: round.id },
        data: { status: 'CASHED_OUT', finishedAt: new Date() },
      });
      return {
        state: this.toState(updated, serverSeedRecord.seedHash, bet.id, true),
        payout: payout.toFixed(2),
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
