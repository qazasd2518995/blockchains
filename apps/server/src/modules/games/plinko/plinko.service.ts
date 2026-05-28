import { PrismaClient, Prisma } from '@prisma/client';
import { plinkoPath, plinkoMultiplier, plinkoTable } from '@bg/provably-fair';
import { GameId, type PlinkoBatchBetResult, type PlinkoBetResult } from '@bg/shared';
import {
  SeedHelper,
  type ActiveSeedBundle,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runLockedTransaction,
} from '../_common/BaseGameService.js';
import {
  applyControls,
  finalizeControls,
  multiplierMatchesControlBounds,
} from '../_common/controls.js';
import { pickRandomBest } from '../_common/resultSelection.js';
import { ApiError } from '../../../utils/errors.js';
import type { PlinkoBatchBetInput, PlinkoBetInput } from './plinko.schema.js';

interface PlinkoBatchShapeContext {
  totalStake: Prisma.Decimal;
  totalPayout: Prisma.Decimal;
  settledBalls: number;
  totalBalls: number;
}

export class PlinkoService {
  constructor(private readonly prisma: PrismaClient) {}

  async bet(userId: string, input: PlinkoBetInput): Promise<PlinkoBetResult> {
    const amount = new Prisma.Decimal(input.amount);

    return runLockedTransaction(this.prisma, async (tx) => {
      await lockUserAndCheckFunds(tx, userId, amount, GameId.PLINKO);
      return this.settleOne(tx, userId, input, amount);
    });
  }

  async betBatch(userId: string, input: PlinkoBatchBetInput): Promise<PlinkoBatchBetResult> {
    const amount = new Prisma.Decimal(input.amount);
    const totalStake = amount.mul(input.balls);

    return runLockedTransaction(this.prisma, async (tx) => {
      const user = await lockUserAndCheckFunds(tx, userId, amount, GameId.PLINKO);
      if (user.balance.lessThan(totalStake)) {
        throw new ApiError('INSUFFICIENT_FUNDS', 'Insufficient balance');
      }
      const seedBundles = await new SeedHelper(tx).getActiveBundles(
        userId,
        'plinko',
        input.balls,
        input.clientSeed,
      );
      const batchShapeContext: PlinkoBatchShapeContext = {
        totalStake,
        totalPayout: new Prisma.Decimal(0),
        settledBalls: 0,
        totalBalls: input.balls,
      };
      const results: PlinkoBetResult[] = [];
      for (let index = 0; index < input.balls; index += 1) {
        results.push(
          await this.settleOne(tx, userId, input, amount, seedBundles[index], batchShapeContext),
        );
      }
      const newBalance =
        results.at(-1)?.newBalance ??
        (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance.toFixed(2);
      return { results, newBalance };
    });
  }

  private async settleOne(
    tx: Prisma.TransactionClient,
    userId: string,
    input: PlinkoBetInput | PlinkoBatchBetInput,
    amount: Prisma.Decimal,
    seedBundle?: ActiveSeedBundle,
    batchShapeContext?: PlinkoBatchShapeContext,
  ): Promise<PlinkoBetResult> {
    const seed =
      seedBundle ?? (await new SeedHelper(tx).getActiveBundle(userId, 'plinko', input.clientSeed));
    const { path, bucket } = plinkoPath(seed.serverSeed, seed.clientSeed, seed.nonce, input.rows);
    const multiplier = plinkoMultiplier(input.risk, input.rows, bucket);
    const multipliers = plinkoTable(input.risk, input.rows);
    const multiplierD = new Prisma.Decimal(multiplier.toFixed(4));
    const payout = amount.mul(multiplierD).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    const controlled = await applyControls(tx, userId, GameId.PLINKO, {
      won: payout.greaterThan(amount),
      amount,
      multiplier: multiplierD,
      payout,
    });

    let finalPath = path;
    let finalBucket = bucket;
    let finalMultiplier = multiplierD;
    let finalPayout = payout;
    if (controlled.controlled) {
      finalBucket = choosePlinkoBucket(
        multipliers,
        controlled.won,
        amount,
        controlled,
        bucket,
        Number(controlled.multiplier.toFixed(4)),
        batchShapeContext,
      );
      finalPath = pathForBucket(input.rows, finalBucket);
      finalMultiplier = new Prisma.Decimal((multipliers[finalBucket] ?? 0).toFixed(4));
      finalPayout = amount.mul(finalMultiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    }
    if (batchShapeContext) {
      batchShapeContext.totalPayout = batchShapeContext.totalPayout.add(finalPayout);
      batchShapeContext.settledBalls += 1;
    }
    const profit = finalPayout.minus(amount);

    const originalResult = { path, bucket, rows: input.rows, risk: input.risk, multipliers };
    const finalResult = {
      path: finalPath,
      bucket: finalBucket,
      rows: input.rows,
      risk: input.risk,
      multipliers,
      controlled: controlled.controlled,
      flipReason: controlled.flipReason ?? null,
      raw: controlled.controlled ? originalResult : null,
    };

    const bet = await tx.bet.create({
      data: {
        userId,
        gameId: GameId.PLINKO,
        amount,
        multiplier: finalMultiplier,
        payout: finalPayout,
        profit,
        nonce: seed.nonce,
        clientSeedUsed: seed.clientSeed,
        serverSeedId: seed.serverSeedId,
        resultData: finalResult,
      },
    });
    await debitAndRecord(tx, userId, amount, bet.id);
    const newBalance = finalPayout.greaterThan(0)
      ? await creditAndRecord(tx, userId, finalPayout, bet.id, 'BET_WIN')
      : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;
    await finalizeControls(
      tx,
      userId,
      GameId.PLINKO,
      { won: payout.greaterThan(amount), amount, multiplier: multiplierD, payout },
      {
        won: finalPayout.greaterThan(amount),
        amount,
        multiplier: finalMultiplier,
        payout: finalPayout,
      },
      controlled,
      bet.id,
      originalResult,
      finalResult,
    );

    return {
      betId: bet.id,
      path: finalPath,
      bucket: finalBucket,
      rows: input.rows,
      risk: input.risk,
      multiplier: Number(finalMultiplier.toFixed(4)),
      multipliers,
      amount: amount.toFixed(2),
      payout: finalPayout.toFixed(2),
      profit: profit.toFixed(2),
      newBalance: newBalance.toFixed(2),
      nonce: seed.nonce,
      serverSeedHash: seed.serverSeedHash,
      clientSeed: seed.clientSeed,
    };
  }
}

function choosePlinkoBucket(
  table: number[],
  wantWin: boolean,
  amount: Prisma.Decimal,
  controlled: Parameters<typeof multiplierMatchesControlBounds>[2],
  originalBucket: number,
  targetMultiplier: number,
  batchShapeContext?: PlinkoBatchShapeContext,
): number {
  if (!wantWin) {
    return chooseControlledLossBucket(table, amount, originalBucket, batchShapeContext);
  }

  const candidates = table
    .map((multiplier, bucket) => ({ bucket, multiplier }))
    .filter(
      (x) => x.multiplier > 1 && multiplierMatchesControlBounds(x.multiplier, amount, controlled),
    );
  const losingFallback = table
    .map((multiplier, bucket) => ({ bucket, multiplier }))
    .filter((x) => x.multiplier <= 1);
  const pool = candidates.length > 0 ? candidates : losingFallback;
  const picked = pickRandomBest(pool, (x) => {
    const targetDiff = Math.abs(x.multiplier - targetMultiplier);
    const bucketDiff = Math.abs(x.bucket - originalBucket);
    return targetDiff * 1000 + bucketDiff / 100;
  });
  return picked?.bucket ?? pool[0]?.bucket ?? 0;
}

function chooseControlledLossBucket(
  table: number[],
  amount: Prisma.Decimal,
  originalBucket: number,
  batchShapeContext?: PlinkoBatchShapeContext,
): number {
  const options = table.map((multiplier, bucket) => ({ bucket, multiplier }));
  const batchLossBudget = batchShapeContext?.totalStake.mul(0.96);
  const pool = options
    .map((option) => {
      const isSingleBall = !batchShapeContext || batchShapeContext.totalBalls <= 1;
      if (isSingleBall && option.multiplier > 1) return null;
      if (!isSingleBall && option.multiplier > 1.25) return null;
      if (
        batchShapeContext &&
        batchLossBudget &&
        !fitsBatchLossBudget(option.multiplier, amount, batchShapeContext, batchLossBudget)
      ) {
        return null;
      }
      const bucketDistance = Math.abs(option.bucket - originalBucket);
      const naturalBucketBias = 1 / (1 + bucketDistance * 0.2);
      let multiplierWeight = 1;
      if (option.multiplier > 1) {
        multiplierWeight = 0.45;
      } else if (option.multiplier >= 0.85) {
        multiplierWeight = 2.2;
      } else if (option.multiplier >= 0.45) {
        multiplierWeight = 1.4;
      } else {
        multiplierWeight = 0.75;
      }
      return {
        ...option,
        weight: multiplierWeight * naturalBucketBias,
      };
    })
    .filter((option): option is { bucket: number; multiplier: number; weight: number } =>
      Boolean(option),
    );

  const fallback = options.filter((option) => option.multiplier <= 1);
  return (
    pickWeightedBucket(pool)?.bucket ??
    pickRandomBest(fallback, (x) => Math.abs(x.bucket - originalBucket))?.bucket ??
    0
  );
}

function fitsBatchLossBudget(
  multiplier: number,
  amount: Prisma.Decimal,
  batchShapeContext: PlinkoBatchShapeContext,
  batchLossBudget: Prisma.Decimal,
): boolean {
  const remainingBallsAfterThis = Math.max(
    0,
    batchShapeContext.totalBalls - batchShapeContext.settledBalls - 1,
  );
  const reserveForRemainingBalls = amount.mul(0.45).mul(remainingBallsAfterThis);
  const projectedPayout = batchShapeContext.totalPayout
    .add(amount.mul(multiplier))
    .add(reserveForRemainingBalls);
  return projectedPayout.lessThanOrEqualTo(batchLossBudget);
}

function pickWeightedBucket<T extends { weight: number }>(items: readonly T[]): T | undefined {
  const totalWeight = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (totalWeight <= 0) return undefined;
  let roll = Math.random() * totalWeight;
  for (const item of items) {
    roll -= Math.max(0, item.weight);
    if (roll <= 0) return item;
  }
  return items.at(-1);
}

function pathForBucket(rows: number, bucket: number): ('left' | 'right')[] {
  const rights = Math.max(0, Math.min(rows, bucket));
  return Array.from({ length: rows }, (_, index) => {
    const before = Math.floor((index * rights) / rows);
    const after = Math.floor(((index + 1) * rights) / rows);
    return after > before ? 'right' : 'left';
  });
}

export const __plinkoServiceTestHooks = {
  chooseControlledLossBucket,
};
