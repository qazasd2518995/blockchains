import { PrismaClient, Prisma } from '@prisma/client';
import {
  minesPositions,
  minesMultiplier,
  minesNextMultiplier,
  MINES_GRID_SIZE,
} from '@bg/provably-fair';
import { GameId, type MinesRoundState, type MinesRevealResult, type MinesCashoutResult } from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  serializableTxOpts,
} from '../_common/BaseGameService.js';
import { ApiError } from '../../../utils/errors.js';
import type { MinesStartInput, MinesRevealInput, MinesCashoutInput } from './mines.schema.js';

export class MinesService {
  constructor(private readonly prisma: PrismaClient) {}

  async start(userId: string, input: MinesStartInput): Promise<MinesRoundState> {
    const amount = new Prisma.Decimal(input.amount);

    return this.prisma.$transaction(async (tx) => {
      const active = await tx.minesRound.findFirst({
        where: { userId, status: 'ACTIVE' },
      });
      if (active) {
        throw new ApiError('INVALID_ACTION', 'You have an active mines round already');
      }

      await lockUserAndCheckFunds(tx, userId, amount);

      const seed = await new SeedHelper(tx).getActiveBundle(
        userId,
        'mines',
        input.clientSeed,
      );
      const positions = minesPositions(
        seed.serverSeed,
        seed.clientSeed,
        seed.nonce,
        input.mineCount,
      );

      await debitAndRecord(tx, userId, amount);

      const round = await tx.minesRound.create({
        data: {
          userId,
          betAmount: amount,
          mineCount: input.mineCount,
          minePositions: positions,
          revealed: [],
          currentMultiplier: new Prisma.Decimal(1),
          status: 'ACTIVE',
          nonce: seed.nonce,
          serverSeedId: seed.serverSeedId,
          clientSeedUsed: seed.clientSeed,
        },
      });

      return this.toState(round, seed.serverSeedHash);
    }, serializableTxOpts());
  }

  async reveal(userId: string, input: MinesRevealInput): Promise<MinesRevealResult> {
    return this.prisma.$transaction(async (tx) => {
      const round = await tx.minesRound.findFirst({
        where: { id: input.roundId, userId },
      });
      if (!round) throw new ApiError('ROUND_NOT_FOUND', 'Round not found');
      if (round.status !== 'ACTIVE') {
        throw new ApiError('ROUND_NOT_ACTIVE', 'Round is not active');
      }
      if (round.revealed.includes(input.cellIndex)) {
        throw new ApiError('INVALID_ACTION', 'Cell already revealed');
      }

      const serverSeed = await tx.serverSeed.findUniqueOrThrow({
        where: { id: round.serverSeedId },
      });

      const hitMine = round.minePositions.includes(input.cellIndex);
      const newRevealed = [...round.revealed, input.cellIndex];

      if (hitMine) {
        const bet = await tx.bet.create({
          data: {
            userId,
            gameId: GameId.MINES,
            amount: round.betAmount,
            multiplier: new Prisma.Decimal(0),
            payout: new Prisma.Decimal(0),
            profit: round.betAmount.negated(),
            nonce: round.nonce,
            clientSeedUsed: round.clientSeedUsed,
            serverSeedId: round.serverSeedId,
            resultData: {
              mineCount: round.mineCount,
              minePositions: round.minePositions,
              revealed: newRevealed,
              hitMine: true,
              hitCell: input.cellIndex,
            },
            minesRoundId: round.id,
          },
        });
        const updated = await tx.minesRound.update({
          where: { id: round.id },
          data: {
            status: 'BUSTED',
            revealed: newRevealed,
            finishedAt: new Date(),
          },
        });
        return {
          state: this.toState(updated, serverSeed.seedHash, bet.id),
          hitMine: true,
        };
      }

      const gemsRevealed = newRevealed.length;
      const currentMult = new Prisma.Decimal(
        minesMultiplier(round.mineCount, gemsRevealed).toFixed(4),
      );
      const updated = await tx.minesRound.update({
        where: { id: round.id },
        data: {
          revealed: newRevealed,
          currentMultiplier: currentMult,
        },
      });
      return {
        state: this.toState(updated, serverSeed.seedHash),
        hitMine: false,
      };
    }, serializableTxOpts());
  }

  async cashout(userId: string, input: MinesCashoutInput): Promise<MinesCashoutResult> {
    return this.prisma.$transaction(async (tx) => {
      const round = await tx.minesRound.findFirst({
        where: { id: input.roundId, userId },
      });
      if (!round) throw new ApiError('ROUND_NOT_FOUND', 'Round not found');
      if (round.status !== 'ACTIVE') {
        throw new ApiError('ROUND_NOT_ACTIVE', 'Round is not active');
      }
      if (round.revealed.length === 0) {
        throw new ApiError('INVALID_ACTION', 'Reveal at least one cell before cashing out');
      }

      const serverSeed = await tx.serverSeed.findUniqueOrThrow({
        where: { id: round.serverSeedId },
      });

      const multiplier = round.currentMultiplier;
      const payout = round.betAmount.mul(multiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const profit = payout.minus(round.betAmount);

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: GameId.MINES,
          amount: round.betAmount,
          multiplier,
          payout,
          profit,
          nonce: round.nonce,
          clientSeedUsed: round.clientSeedUsed,
          serverSeedId: round.serverSeedId,
          resultData: {
            mineCount: round.mineCount,
            minePositions: round.minePositions,
            revealed: round.revealed,
            hitMine: false,
            cashedOut: true,
          },
          minesRoundId: round.id,
        },
      });

      const newBalance = await creditAndRecord(tx, userId, payout, bet.id, 'CASHOUT');

      const updated = await tx.minesRound.update({
        where: { id: round.id },
        data: {
          status: 'CASHED_OUT',
          finishedAt: new Date(),
        },
      });

      return {
        state: this.toState(updated, serverSeed.seedHash, bet.id),
        payout: payout.toFixed(2),
        newBalance: newBalance.toFixed(2),
      };
    }, serializableTxOpts());
  }

  async getActive(userId: string): Promise<MinesRoundState | null> {
    const round = await this.prisma.minesRound.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { bet: true },
    });
    if (!round) return null;
    const serverSeed = await this.prisma.serverSeed.findUniqueOrThrow({
      where: { id: round.serverSeedId },
    });
    return this.toState(round, serverSeed.seedHash);
  }

  private toState(
    round: {
      id: string;
      status: 'ACTIVE' | 'CASHED_OUT' | 'BUSTED';
      mineCount: number;
      minePositions: number[];
      revealed: number[];
      currentMultiplier: Prisma.Decimal;
      betAmount: Prisma.Decimal;
      nonce: number;
      createdAt: Date;
    },
    serverSeedHash: string,
    _betId?: string,
  ): MinesRoundState {
    const gems = round.revealed.length;
    const nextMult = round.status === 'ACTIVE'
      ? minesNextMultiplier(round.mineCount, gems)
      : null;
    const potentialPayout = round.betAmount
      .mul(round.currentMultiplier)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    const exposeMines = round.status !== 'ACTIVE';
    return {
      roundId: round.id,
      status: round.status,
      mineCount: round.mineCount,
      gridSize: MINES_GRID_SIZE,
      revealed: round.revealed,
      currentMultiplier: round.currentMultiplier.toFixed(4),
      nextMultiplier: nextMult !== null ? nextMult.toFixed(4) : null,
      amount: round.betAmount.toFixed(2),
      potentialPayout: potentialPayout.toFixed(2),
      ...(exposeMines ? { minePositions: round.minePositions } : {}),
      serverSeedHash,
      nonce: round.nonce,
      createdAt: round.createdAt.toISOString(),
    };
  }
}
