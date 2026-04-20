import { PrismaClient, Prisma } from '@prisma/client';
import {
  hiloDraw,
  hiloProbHigherOrEqual,
  hiloProbLowerOrEqual,
  hiloMultiplier,
} from '@bg/provably-fair';
import { GameId, type HiLoCard, type HiLoRoundState, type HiLoGuessResult, type HiLoCashoutResult } from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runSerializable,
  serializableTxOpts,
} from '../_common/BaseGameService.js';
import { ApiError } from '../../../utils/errors.js';
import type { HiLoStartInput, HiLoGuessInput, HiLoCashoutInput } from './hilo.schema.js';

const MAX_SKIPS = 3;

export class HiLoService {
  constructor(private readonly prisma: PrismaClient) {}

  async start(userId: string, input: HiLoStartInput): Promise<HiLoRoundState> {
    const amount = new Prisma.Decimal(input.amount);

    return runSerializable(this.prisma, async (tx) => {
      const active = await tx.hiLoRound.findFirst({ where: { userId, status: 'ACTIVE' } });
      if (active) throw new ApiError('INVALID_ACTION', 'You have an active Hi-Lo round');

      await lockUserAndCheckFunds(tx, userId, amount);
      const seed = await new SeedHelper(tx).getActiveBundle(userId, 'hilo', input.clientSeed);

      const firstCard = hiloDraw(seed.serverSeed, seed.clientSeed, seed.nonce, 0);

      await debitAndRecord(tx, userId, amount);

      const round = await tx.hiLoRound.create({
        data: {
          userId,
          betAmount: amount,
          cardIndex: 0,
          history: [firstCard] as unknown as Prisma.InputJsonValue,
          currentMultiplier: new Prisma.Decimal(1),
          skipsUsed: 0,
          status: 'ACTIVE',
          nonce: seed.nonce,
          serverSeedId: seed.serverSeedId,
          clientSeedUsed: seed.clientSeed,
        },
      });

      return this.toState(round, firstCard, seed.serverSeedHash);
    });
  }

  async guess(userId: string, input: HiLoGuessInput): Promise<HiLoGuessResult> {
    return runSerializable(this.prisma, async (tx) => {
      const round = await tx.hiLoRound.findFirst({
        where: { id: input.roundId, userId },
      });
      if (!round) throw new ApiError('ROUND_NOT_FOUND', 'Round not found');
      if (round.status !== 'ACTIVE') throw new ApiError('ROUND_NOT_ACTIVE', 'Round is not active');

      const history = round.history as unknown as HiLoCard[];
      const current = history[history.length - 1];
      if (!current) throw new ApiError('INTERNAL', 'No current card');

      const serverSeedRecord = await tx.serverSeed.findUniqueOrThrow({
        where: { id: round.serverSeedId },
      });

      const nextIndex = round.cardIndex + 1;
      const drawn = hiloDraw(serverSeedRecord.seed, round.clientSeedUsed, round.nonce, nextIndex);

      const winChance =
        input.guess === 'higher'
          ? hiloProbHigherOrEqual(current.rank)
          : hiloProbLowerOrEqual(current.rank);
      const stepMultiplier = hiloMultiplier(winChance);

      const correct =
        input.guess === 'higher' ? drawn.rank >= current.rank : drawn.rank <= current.rank;

      const newHistory = [...history, drawn];

      if (!correct) {
        const bet = await tx.bet.create({
          data: {
            userId,
            gameId: GameId.HILO,
            amount: round.betAmount,
            multiplier: new Prisma.Decimal(0),
            payout: new Prisma.Decimal(0),
            profit: round.betAmount.negated(),
            nonce: round.nonce,
            clientSeedUsed: round.clientSeedUsed,
            serverSeedId: round.serverSeedId,
            resultData: {
              history: newHistory,
              lastGuess: input.guess,
              correct: false,
            } as unknown as Prisma.InputJsonValue,
            hiloRoundId: round.id,
          },
        });
        const updated = await tx.hiLoRound.update({
          where: { id: round.id },
          data: {
            cardIndex: nextIndex,
            history: newHistory as unknown as Prisma.InputJsonValue,
            status: 'BUSTED',
            finishedAt: new Date(),
          },
        });
        return {
          state: this.toState(updated, drawn, serverSeedRecord.seedHash, bet.id),
          drawn,
          correct: false,
        };
      }

      const newMult = round.currentMultiplier.mul(
        new Prisma.Decimal(stepMultiplier.toFixed(4)),
      );
      const updated = await tx.hiLoRound.update({
        where: { id: round.id },
        data: {
          cardIndex: nextIndex,
          history: newHistory as unknown as Prisma.InputJsonValue,
          currentMultiplier: newMult,
        },
      });
      return {
        state: this.toState(updated, drawn, serverSeedRecord.seedHash),
        drawn,
        correct: true,
      };
    });
  }

  async skip(userId: string, roundId: string): Promise<HiLoRoundState> {
    return runSerializable(this.prisma, async (tx) => {
      const round = await tx.hiLoRound.findFirst({ where: { id: roundId, userId } });
      if (!round) throw new ApiError('ROUND_NOT_FOUND', 'Round not found');
      if (round.status !== 'ACTIVE') throw new ApiError('ROUND_NOT_ACTIVE', 'Round is not active');
      if (round.skipsUsed >= MAX_SKIPS) {
        throw new ApiError('INVALID_ACTION', 'No skips remaining');
      }

      const serverSeedRecord = await tx.serverSeed.findUniqueOrThrow({
        where: { id: round.serverSeedId },
      });
      const history = round.history as unknown as HiLoCard[];
      const nextIndex = round.cardIndex + 1;
      const drawn = hiloDraw(serverSeedRecord.seed, round.clientSeedUsed, round.nonce, nextIndex);
      const newHistory = [...history.slice(0, -1), drawn];

      const updated = await tx.hiLoRound.update({
        where: { id: round.id },
        data: {
          cardIndex: nextIndex,
          history: newHistory as unknown as Prisma.InputJsonValue,
          skipsUsed: { increment: 1 },
        },
      });
      return this.toState(updated, drawn, serverSeedRecord.seedHash);
    });
  }

  async cashout(userId: string, input: HiLoCashoutInput): Promise<HiLoCashoutResult> {
    return runSerializable(this.prisma, async (tx) => {
      const round = await tx.hiLoRound.findFirst({
        where: { id: input.roundId, userId },
      });
      if (!round) throw new ApiError('ROUND_NOT_FOUND', 'Round not found');
      if (round.status !== 'ACTIVE') throw new ApiError('ROUND_NOT_ACTIVE', 'Round is not active');
      if (round.currentMultiplier.lessThanOrEqualTo(1)) {
        throw new ApiError('INVALID_ACTION', 'Make at least one correct guess to cashout');
      }

      const serverSeedRecord = await tx.serverSeed.findUniqueOrThrow({
        where: { id: round.serverSeedId },
      });
      const history = round.history as unknown as HiLoCard[];
      const current = history[history.length - 1];
      if (!current) throw new ApiError('INTERNAL', 'No current card');

      const multiplier = round.currentMultiplier;
      const payout = round.betAmount
        .mul(multiplier)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const profit = payout.minus(round.betAmount);

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: GameId.HILO,
          amount: round.betAmount,
          multiplier,
          payout,
          profit,
          nonce: round.nonce,
          clientSeedUsed: round.clientSeedUsed,
          serverSeedId: round.serverSeedId,
          resultData: { history, cashedOut: true } as unknown as Prisma.InputJsonValue,
          hiloRoundId: round.id,
        },
      });
      const newBalance = await creditAndRecord(tx, userId, payout, bet.id, 'CASHOUT');
      const updated = await tx.hiLoRound.update({
        where: { id: round.id },
        data: { status: 'CASHED_OUT', finishedAt: new Date() },
      });
      return {
        state: this.toState(updated, current, serverSeedRecord.seedHash, bet.id),
        payout: payout.toFixed(2),
        newBalance: newBalance.toFixed(2),
      };
    });
  }

  async getActive(userId: string): Promise<HiLoRoundState | null> {
    const round = await this.prisma.hiLoRound.findFirst({
      where: { userId, status: 'ACTIVE' },
    });
    if (!round) return null;
    const serverSeedRecord = await this.prisma.serverSeed.findUniqueOrThrow({
      where: { id: round.serverSeedId },
    });
    const history = round.history as unknown as HiLoCard[];
    const current = history[history.length - 1];
    if (!current) return null;
    return this.toState(round, current, serverSeedRecord.seedHash);
  }

  private toState(
    round: {
      id: string;
      status: 'ACTIVE' | 'BUSTED' | 'CASHED_OUT';
      history: Prisma.JsonValue;
      currentMultiplier: Prisma.Decimal;
      betAmount: Prisma.Decimal;
      skipsUsed: number;
      cardIndex: number;
      nonce: number;
    },
    current: HiLoCard,
    serverSeedHash: string,
    _betId?: string,
  ): HiLoRoundState {
    const history = round.history as unknown as HiLoCard[];
    const higherChance = hiloProbHigherOrEqual(current.rank);
    const lowerChance = hiloProbLowerOrEqual(current.rank);
    const higherStep = hiloMultiplier(higherChance);
    const lowerStep = hiloMultiplier(lowerChance);
    const potentialHigher = round.currentMultiplier.mul(higherStep.toString());
    const potentialLower = round.currentMultiplier.mul(lowerStep.toString());
    const potentialPayout = round.betAmount
      .mul(round.currentMultiplier)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);

    return {
      roundId: round.id,
      status: round.status,
      currentCard: current,
      history,
      currentMultiplier: round.currentMultiplier.toFixed(4),
      higherMultiplier: potentialHigher.toFixed(4),
      lowerMultiplier: potentialLower.toFixed(4),
      higherChance,
      lowerChance,
      amount: round.betAmount.toFixed(2),
      potentialPayout: potentialPayout.toFixed(2),
      skipsUsed: round.skipsUsed,
      maxSkips: MAX_SKIPS,
      cardIndex: round.cardIndex,
      serverSeedHash,
      nonce: round.nonce,
    };
  }
}
