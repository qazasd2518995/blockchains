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
  runSerializable,
  serializableTxOpts,
} from '../_common/BaseGameService.js';
import { applyControls, finalizeControls } from '../_common/controls.js';
import { ApiError } from '../../../utils/errors.js';
import type { MinesStartInput, MinesRevealInput, MinesCashoutInput } from './mines.schema.js';

export class MinesService {
  constructor(private readonly prisma: PrismaClient) {}

  async start(userId: string, input: MinesStartInput): Promise<MinesRoundState> {
    const amount = new Prisma.Decimal(input.amount);

    return runSerializable(this.prisma, async (tx) => {
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
    });
  }

  async reveal(userId: string, input: MinesRevealInput): Promise<MinesRevealResult> {
    return runSerializable(this.prisma, async (tx) => {
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

      const rawMinePositions = round.minePositions;
      let finalMinePositions = rawMinePositions;
      const rawHitMine = rawMinePositions.includes(input.cellIndex);
      let hitMine = rawHitMine;
      const newRevealed = [...round.revealed, input.cellIndex];

      const safeMultiplier = new Prisma.Decimal(
        minesMultiplier(round.mineCount, newRevealed.length).toFixed(4),
      );
      const safePayout = round.betAmount.mul(safeMultiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const controlled = await applyControls(tx, userId, GameId.MINES, {
        won: !rawHitMine && safePayout.greaterThan(round.betAmount),
        amount: round.betAmount,
        multiplier: rawHitMine ? new Prisma.Decimal(0) : safeMultiplier,
        payout: rawHitMine ? new Prisma.Decimal(0) : safePayout,
      });
      if (controlled.controlled && controlled.won && rawHitMine) {
        const moved = moveMineAway(rawMinePositions, input.cellIndex, newRevealed);
        if (moved) {
          finalMinePositions = moved;
          hitMine = false;
        }
      } else if (controlled.controlled && !controlled.won && !rawHitMine) {
        finalMinePositions = moveMineToCell(rawMinePositions, input.cellIndex);
        hitMine = true;
      }
      const effectiveControl = hitMine !== rawHitMine
        ? controlled
        : { ...controlled, controlled: false, flipReason: undefined, controlId: undefined };

      if (hitMine) {
        const originalResult = {
          mineCount: round.mineCount,
          minePositions: rawMinePositions,
          revealed: newRevealed,
          hitMine: rawHitMine,
          hitCell: input.cellIndex,
        };
        const finalResult = {
          mineCount: round.mineCount,
          minePositions: finalMinePositions,
          revealed: newRevealed,
          hitMine: true,
          hitCell: input.cellIndex,
          controlled: effectiveControl.controlled,
          flipReason: effectiveControl.flipReason ?? null,
          raw: effectiveControl.controlled ? originalResult : null,
        };
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
            resultData: finalResult,
            minesRoundId: round.id,
          },
        });
        const updated = await tx.minesRound.update({
          where: { id: round.id },
          data: {
            status: 'BUSTED',
            revealed: newRevealed,
            minePositions: finalMinePositions,
            finishedAt: new Date(),
          },
        });
        await finalizeControls(
          tx,
          userId,
          GameId.MINES,
          {
            won: !rawHitMine && safePayout.greaterThan(round.betAmount),
            amount: round.betAmount,
            multiplier: rawHitMine ? new Prisma.Decimal(0) : safeMultiplier,
            payout: rawHitMine ? new Prisma.Decimal(0) : safePayout,
          },
          {
            won: false,
            amount: round.betAmount,
            multiplier: new Prisma.Decimal(0),
            payout: new Prisma.Decimal(0),
          },
          effectiveControl,
          bet.id,
          originalResult,
          finalResult,
        );
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
          minePositions: finalMinePositions,
        },
      });
      return {
        state: this.toState(updated, serverSeed.seedHash),
        hitMine: false,
      };
    });
  }

  async cashout(userId: string, input: MinesCashoutInput): Promise<MinesCashoutResult> {
    return runSerializable(this.prisma, async (tx) => {
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
      const controlled = await applyControls(tx, userId, GameId.MINES, {
        won: payout.greaterThan(round.betAmount),
        amount: round.betAmount,
        multiplier,
        payout,
      });
      const forceLoss = controlled.controlled && !controlled.won;
      const controlledWin = controlled.controlled && controlled.won;
      const finalMultiplier = forceLoss
        ? new Prisma.Decimal(0)
        : controlledWin
          ? controlled.multiplier
          : multiplier;
      const finalPayout = forceLoss
        ? new Prisma.Decimal(0)
        : controlledWin
          ? controlled.payout
          : payout;
      const profit = finalPayout.minus(round.betAmount);
      const finalStatus = forceLoss ? 'BUSTED' : 'CASHED_OUT';

      const originalResult = {
        mineCount: round.mineCount,
        minePositions: round.minePositions,
        revealed: round.revealed,
        hitMine: false,
        cashedOut: true,
      };
      const finalResult = {
        mineCount: round.mineCount,
        minePositions: round.minePositions,
        revealed: round.revealed,
        hitMine: forceLoss,
        cashedOut: !forceLoss,
        controlled: controlled.controlled,
        flipReason: controlled.flipReason ?? null,
        raw: controlled.controlled ? originalResult : null,
      };

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: GameId.MINES,
          amount: round.betAmount,
          multiplier: finalMultiplier,
          payout: finalPayout,
          profit,
          nonce: round.nonce,
          clientSeedUsed: round.clientSeedUsed,
          serverSeedId: round.serverSeedId,
          resultData: finalResult,
          minesRoundId: round.id,
        },
      });

      const newBalance = finalPayout.greaterThan(0)
        ? await creditAndRecord(tx, userId, finalPayout, bet.id, 'CASHOUT')
        : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;

      const updated = await tx.minesRound.update({
        where: { id: round.id },
        data: {
          status: finalStatus,
          finishedAt: new Date(),
        },
      });
      await finalizeControls(
        tx,
        userId,
        GameId.MINES,
        { won: payout.greaterThan(round.betAmount), amount: round.betAmount, multiplier, payout },
        { won: finalPayout.greaterThan(round.betAmount), amount: round.betAmount, multiplier: finalMultiplier, payout: finalPayout },
        controlled,
        bet.id,
        originalResult,
        finalResult,
      );

      return {
        state: this.toState(updated, serverSeed.seedHash, bet.id),
        payout: finalPayout.toFixed(2),
        newBalance: newBalance.toFixed(2),
      };
    });
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

function moveMineAway(minePositions: number[], cellIndex: number, revealed: number[]): number[] | null {
  const blocked = new Set([...minePositions, ...revealed]);
  const replacement = Array.from({ length: MINES_GRID_SIZE }, (_, index) => index)
    .find((index) => !blocked.has(index));
  if (replacement === undefined) return null;
  return minePositions.map((pos) => (pos === cellIndex ? replacement : pos));
}

function moveMineToCell(minePositions: number[], cellIndex: number): number[] {
  if (minePositions.includes(cellIndex)) return minePositions;
  const copy = minePositions.slice();
  copy[0] = cellIndex;
  return Array.from(new Set(copy)).slice(0, minePositions.length);
}
