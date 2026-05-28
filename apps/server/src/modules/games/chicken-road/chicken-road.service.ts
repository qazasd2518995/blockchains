import { PrismaClient, Prisma } from '@prisma/client';
import {
  CHICKEN_ROAD_TOTAL_STEPS,
  chickenRoadMultiplier,
  chickenRoadNextMultiplier,
  chickenRoadPath,
  type ChickenRoadDifficulty,
} from '@bg/provably-fair';
import {
  GameId,
  type ChickenRoadCashoutResult,
  type ChickenRoadRoundState,
  type ChickenRoadStepResult,
} from '@bg/shared';
import {
  SeedHelper,
  creditAndRecord,
  debitAndRecord,
  lockUserAndCheckFunds,
  runSerializable,
} from '../_common/BaseGameService.js';
import {
  applyControls,
  finalizeControls,
  multiplierMatchesControlBounds,
} from '../_common/controls.js';
import { ApiError } from '../../../utils/errors.js';
import type {
  ChickenRoadCashoutInput,
  ChickenRoadStartInput,
  ChickenRoadStepInput,
} from './chicken-road.schema.js';

type ChickenRoadStoredStatus = 'ACTIVE' | 'BUSTED' | 'CASHED_OUT';

interface ChickenRoadStoredData {
  kind: 'chicken-road';
  status: ChickenRoadStoredStatus;
  difficulty: ChickenRoadDifficulty;
  totalSteps: number;
  path: boolean[];
  currentStep: number;
  hitStep?: number | null;
  cashedOut?: boolean;
  controlled?: boolean;
  flipReason?: string | null;
  raw?: unknown;
}

export class ChickenRoadService {
  constructor(private readonly prisma: PrismaClient) {}

  async start(userId: string, input: ChickenRoadStartInput): Promise<ChickenRoadRoundState> {
    const amount = new Prisma.Decimal(input.amount);

    return runSerializable(this.prisma, async (tx) => {
      const active = await tx.bet.findFirst({
        where: { userId, gameId: GameId.CHICKEN_ROAD, status: 'PENDING' },
      });
      if (active) throw new ApiError('INVALID_ACTION', 'You have an active Chicken Road round');

      await lockUserAndCheckFunds(tx, userId, amount, GameId.CHICKEN_ROAD);
      const seed = await new SeedHelper(tx).getActiveBundle(
        userId,
        GameId.CHICKEN_ROAD,
        input.clientSeed,
      );
      const path = chickenRoadPath(
        seed.serverSeed,
        seed.clientSeed,
        seed.nonce,
        input.difficulty as ChickenRoadDifficulty,
      );

      await debitAndRecord(tx, userId, amount);

      const resultData: ChickenRoadStoredData = {
        kind: 'chicken-road',
        status: 'ACTIVE',
        difficulty: input.difficulty as ChickenRoadDifficulty,
        totalSteps: CHICKEN_ROAD_TOTAL_STEPS,
        path,
        currentStep: 0,
        hitStep: null,
      };

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: GameId.CHICKEN_ROAD,
          amount,
          multiplier: new Prisma.Decimal(1),
          payout: new Prisma.Decimal(0),
          profit: amount.negated(),
          nonce: seed.nonce,
          clientSeedUsed: seed.clientSeed,
          serverSeedId: seed.serverSeedId,
          resultData: resultData as unknown as Prisma.InputJsonValue,
          status: 'PENDING',
        },
      });

      return this.toState(bet, resultData, seed.serverSeedHash);
    });
  }

  async step(userId: string, input: ChickenRoadStepInput): Promise<ChickenRoadStepResult> {
    return runSerializable(this.prisma, async (tx) => {
      const bet = await this.findActiveBet(tx, userId, input.roundId);
      const parsedData = parseRoundData(bet.resultData);
      const serverSeed = await tx.serverSeed.findUniqueOrThrow({
        where: { id: bet.serverSeedId },
      });
      const data = normalizeRoundData(parsedData, serverSeed.seed, bet.clientSeedUsed, bet.nonce);
      if (data.currentStep >= data.totalSteps) {
        throw new ApiError('INVALID_ACTION', 'Chicken Road safety limit reached');
      }

      const stepIndex = data.currentStep;
      const nextStep = stepIndex + 1;
      const rawPath = data.path.slice();
      const rawSafe = Boolean(rawPath[stepIndex]);
      const nextMult = new Prisma.Decimal(
        chickenRoadMultiplier(data.difficulty, nextStep).toFixed(4),
      );
      const predictedPayout = rawSafe
        ? bet.amount.mul(nextMult).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN)
        : new Prisma.Decimal(0);
      const controlled = await applyControls(tx, userId, GameId.CHICKEN_ROAD, {
        won: rawSafe && predictedPayout.greaterThan(bet.amount),
        amount: bet.amount,
        multiplier: rawSafe ? nextMult : new Prisma.Decimal(0),
        payout: predictedPayout,
      });
      const controlledWinFitsChickenRoadPayout =
        !controlled.controlled ||
        !controlled.won ||
        multiplierMatchesControlBounds(nextMult, bet.amount, controlled);
      const shapedControl =
        controlled.controlled && controlled.won && !controlledWinFitsChickenRoadPayout
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

      const finalPath = rawPath.slice();
      const canForceLoss = data.currentStep > 0;
      if (shapedControl.controlled && shapedControl.won && !rawSafe) {
        finalPath[stepIndex] = true;
      } else if (canForceLoss && shapedControl.controlled && !shapedControl.won && rawSafe) {
        finalPath[stepIndex] = false;
      }
      const isSafe = Boolean(finalPath[stepIndex]);
      const effectiveControl =
        isSafe !== rawSafe
          ? shapedControl
          : { ...shapedControl, controlled: false, flipReason: undefined, controlId: undefined };

      if (!isSafe) {
        const originalResult = {
          difficulty: data.difficulty,
          path: rawPath,
          currentStep: data.currentStep,
          selectedStep: nextStep,
          safe: rawSafe,
        };
        const finalResult: ChickenRoadStoredData = {
          ...data,
          status: 'BUSTED',
          path: finalPath,
          hitStep: nextStep,
          controlled: effectiveControl.controlled,
          flipReason: effectiveControl.flipReason ?? null,
          raw: effectiveControl.controlled ? originalResult : null,
        };
        const updated = await tx.bet.update({
          where: { id: bet.id },
          data: {
            multiplier: new Prisma.Decimal(0),
            payout: new Prisma.Decimal(0),
            profit: bet.amount.negated(),
            status: 'SETTLED',
            settledAt: new Date(),
            resultData: finalResult as unknown as Prisma.InputJsonValue,
          },
        });
        await finalizeControls(
          tx,
          userId,
          GameId.CHICKEN_ROAD,
          {
            won: rawSafe && predictedPayout.greaterThan(bet.amount),
            amount: bet.amount,
            multiplier: rawSafe ? nextMult : new Prisma.Decimal(0),
            payout: predictedPayout,
          },
          {
            won: false,
            amount: bet.amount,
            multiplier: new Prisma.Decimal(0),
            payout: new Prisma.Decimal(0),
          },
          effectiveControl,
          updated.id,
          originalResult as unknown as Prisma.InputJsonValue,
          finalResult as unknown as Prisma.InputJsonValue,
        );
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { balance: true },
        });
        return {
          state: this.toState(updated, finalResult, serverSeed.seedHash, true),
          hit: true,
          newBalance: user.balance.toFixed(2),
        };
      }

      const currentMult = nextMult;
      const currentPayout = bet.amount
        .mul(currentMult)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const crossedData: ChickenRoadStoredData = {
        ...data,
        path: finalPath,
        currentStep: nextStep,
      };

      if (nextStep >= data.totalSteps) {
        const finalResult: ChickenRoadStoredData = {
          ...crossedData,
          status: 'CASHED_OUT',
          cashedOut: true,
          controlled: effectiveControl.controlled,
          flipReason: effectiveControl.flipReason ?? null,
        };
        const profit = currentPayout.minus(bet.amount);
        const settled = await tx.bet.update({
          where: { id: bet.id },
          data: {
            multiplier: currentMult,
            payout: currentPayout,
            profit,
            status: 'SETTLED',
            settledAt: new Date(),
            resultData: finalResult as unknown as Prisma.InputJsonValue,
          },
        });
        const newBalance = await creditAndRecord(tx, userId, currentPayout, settled.id, 'CASHOUT');
        await finalizeControls(
          tx,
          userId,
          GameId.CHICKEN_ROAD,
          {
            won: predictedPayout.greaterThan(bet.amount),
            amount: bet.amount,
            multiplier: nextMult,
            payout: predictedPayout,
          },
          {
            won: currentPayout.greaterThan(bet.amount),
            amount: bet.amount,
            multiplier: currentMult,
            payout: currentPayout,
          },
          effectiveControl,
          settled.id,
          {
            difficulty: data.difficulty,
            path: rawPath,
            currentStep: data.currentStep,
            selectedStep: nextStep,
            safe: rawSafe,
          } as unknown as Prisma.InputJsonValue,
          finalResult as unknown as Prisma.InputJsonValue,
        );
        return {
          state: this.toState(settled, finalResult, serverSeed.seedHash, true),
          hit: false,
          autoCashedOut: true,
          payout: currentPayout.toFixed(2),
          newBalance: newBalance.toFixed(2),
        };
      }

      const updated = await tx.bet.update({
        where: { id: bet.id },
        data: {
          multiplier: currentMult,
          resultData: crossedData as unknown as Prisma.InputJsonValue,
        },
      });
      return {
        state: this.toState(updated, crossedData, serverSeed.seedHash),
        hit: false,
      };
    });
  }

  async cashout(userId: string, input: ChickenRoadCashoutInput): Promise<ChickenRoadCashoutResult> {
    return runSerializable(this.prisma, async (tx) => {
      const bet = await this.findActiveBet(tx, userId, input.roundId);
      const parsedData = parseRoundData(bet.resultData);
      const serverSeed = await tx.serverSeed.findUniqueOrThrow({
        where: { id: bet.serverSeedId },
      });
      const data = normalizeRoundData(parsedData, serverSeed.seed, bet.clientSeedUsed, bet.nonce);
      if (data.currentStep <= 0) {
        throw new ApiError('INVALID_ACTION', 'Cross at least one lane before cashing out');
      }

      const multiplier = new Prisma.Decimal(
        chickenRoadMultiplier(data.difficulty, data.currentStep).toFixed(4),
      );
      const payout = bet.amount.mul(multiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const controlOutcome = {
        won: payout.greaterThan(bet.amount),
        amount: bet.amount,
        multiplier,
        payout,
        controlled: false,
      };
      const finalMultiplier = multiplier;
      const finalPayout = payout;
      const finalStatus: ChickenRoadStoredStatus = 'CASHED_OUT';
      const finalResult: ChickenRoadStoredData = {
        ...data,
        status: finalStatus,
        hitStep: null,
        cashedOut: true,
        controlled: false,
        flipReason: null,
        raw: null,
      };
      const profit = finalPayout.minus(bet.amount);
      const settled = await tx.bet.update({
        where: { id: bet.id },
        data: {
          multiplier: finalMultiplier,
          payout: finalPayout,
          profit,
          status: 'SETTLED',
          settledAt: new Date(),
          resultData: finalResult as unknown as Prisma.InputJsonValue,
        },
      });
      const newBalance = finalPayout.greaterThan(0)
        ? await creditAndRecord(tx, userId, finalPayout, settled.id, 'CASHOUT')
        : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;
      await finalizeControls(
        tx,
        userId,
        GameId.CHICKEN_ROAD,
        { won: payout.greaterThan(bet.amount), amount: bet.amount, multiplier, payout },
        {
          won: finalPayout.greaterThan(bet.amount),
          amount: bet.amount,
          multiplier: finalMultiplier,
          payout: finalPayout,
        },
        controlOutcome,
        settled.id,
        {
          difficulty: data.difficulty,
          path: data.path,
          currentStep: data.currentStep,
          cashedOut: true,
        } as unknown as Prisma.InputJsonValue,
        finalResult as unknown as Prisma.InputJsonValue,
      );

      return {
        state: this.toState(settled, finalResult, serverSeed.seedHash, true),
        payout: finalPayout.toFixed(2),
        newBalance: newBalance.toFixed(2),
      };
    });
  }

  async getActive(userId: string): Promise<ChickenRoadRoundState | null> {
    const bet = await this.prisma.bet.findFirst({
      where: { userId, gameId: GameId.CHICKEN_ROAD, status: 'PENDING' },
    });
    if (!bet) return null;
    const serverSeed = await this.prisma.serverSeed.findUniqueOrThrow({
      where: { id: bet.serverSeedId },
    });
    const data = normalizeRoundData(
      parseRoundData(bet.resultData),
      serverSeed.seed,
      bet.clientSeedUsed,
      bet.nonce,
    );
    return this.toState(bet, data, serverSeed.seedHash);
  }

  private async findActiveBet(tx: Prisma.TransactionClient, userId: string, roundId: string) {
    const bet = await tx.bet.findFirst({
      where: { id: roundId, userId, gameId: GameId.CHICKEN_ROAD },
    });
    if (!bet) throw new ApiError('ROUND_NOT_FOUND', 'Round not found');
    if (bet.status !== 'PENDING') throw new ApiError('ROUND_NOT_ACTIVE', 'Round is not active');
    return bet;
  }

  private toState(
    bet: {
      id: string;
      amount: Prisma.Decimal;
      nonce: number;
      createdAt: Date;
    },
    data: ChickenRoadStoredData,
    serverSeedHash: string,
    exposePath = false,
  ): ChickenRoadRoundState {
    const active = data.status === 'ACTIVE';
    const currentMultiplier =
      active || data.status === 'CASHED_OUT'
        ? chickenRoadMultiplier(data.difficulty, data.currentStep)
        : 0;
    const nextMult = active ? chickenRoadNextMultiplier(data.difficulty, data.currentStep) : null;
    const potentialPayout = bet.amount
      .mul(new Prisma.Decimal(currentMultiplier.toFixed(4)))
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);

    return {
      roundId: bet.id,
      status: data.status,
      difficulty: data.difficulty,
      totalSteps: data.totalSteps,
      currentStep: data.currentStep,
      currentMultiplier: currentMultiplier.toFixed(4),
      nextMultiplier: nextMult !== null ? nextMult.toFixed(4) : null,
      amount: bet.amount.toFixed(2),
      potentialPayout: data.status === 'BUSTED' ? '0.00' : potentialPayout.toFixed(2),
      ...(exposePath || data.status !== 'ACTIVE' ? { path: data.path } : {}),
      hitStep: data.hitStep ?? null,
      serverSeedHash,
      nonce: bet.nonce,
      createdAt: bet.createdAt.toISOString(),
    };
  }
}

function parseRoundData(value: Prisma.JsonValue): ChickenRoadStoredData {
  const data = value as Partial<ChickenRoadStoredData>;
  if (
    data.kind !== 'chicken-road' ||
    !data.status ||
    !data.difficulty ||
    !Array.isArray(data.path) ||
    typeof data.currentStep !== 'number'
  ) {
    throw new ApiError('INVALID_ACTION', 'Invalid Chicken Road round data');
  }
  return {
    kind: 'chicken-road',
    status: data.status,
    difficulty: data.difficulty,
    totalSteps: data.totalSteps ?? CHICKEN_ROAD_TOTAL_STEPS,
    path: data.path.map(Boolean),
    currentStep: data.currentStep,
    hitStep: data.hitStep ?? null,
    cashedOut: data.cashedOut,
    controlled: data.controlled,
    flipReason: data.flipReason,
    raw: data.raw,
  };
}

function normalizeRoundData(
  data: ChickenRoadStoredData,
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): ChickenRoadStoredData {
  if (data.totalSteps >= CHICKEN_ROAD_TOTAL_STEPS && data.path.length >= CHICKEN_ROAD_TOTAL_STEPS) {
    return data;
  }

  const regeneratedPath = chickenRoadPath(serverSeed, clientSeed, nonce, data.difficulty);
  const mergedPath = regeneratedPath.map((cell, index) => data.path[index] ?? cell);
  return {
    ...data,
    totalSteps: CHICKEN_ROAD_TOTAL_STEPS,
    path: mergedPath,
  };
}
