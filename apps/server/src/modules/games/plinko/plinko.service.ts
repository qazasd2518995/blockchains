import { PrismaClient, Prisma } from '@prisma/client';
import { plinkoPath, plinkoMultiplier, plinkoTable } from '@bg/provably-fair';
import { GameId, type PlinkoBatchBetResult, type PlinkoBetResult } from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runSerializable,
} from '../_common/BaseGameService.js';
import {
  applyControls,
  finalizeControls,
  multiplierMatchesControlBounds,
} from '../_common/controls.js';
import { ApiError } from '../../../utils/errors.js';
import type { PlinkoBatchBetInput, PlinkoBetInput } from './plinko.schema.js';

export class PlinkoService {
  constructor(private readonly prisma: PrismaClient) {}

  async bet(userId: string, input: PlinkoBetInput): Promise<PlinkoBetResult> {
    const amount = new Prisma.Decimal(input.amount);

    return runSerializable(this.prisma, async (tx) => {
      await lockUserAndCheckFunds(tx, userId, amount);
      return this.settleOne(tx, userId, input, amount);
    });
  }

  async betBatch(userId: string, input: PlinkoBatchBetInput): Promise<PlinkoBatchBetResult> {
    const amount = new Prisma.Decimal(input.amount);
    const totalStake = amount.mul(input.balls);

    return runSerializable(this.prisma, async (tx) => {
      const user = await lockUserAndCheckFunds(tx, userId, amount);
      if (user.balance.lessThan(totalStake)) {
        throw new ApiError('INSUFFICIENT_FUNDS', 'Insufficient balance');
      }
      const results: PlinkoBetResult[] = [];
      for (let index = 0; index < input.balls; index += 1) {
        results.push(await this.settleOne(tx, userId, input, amount));
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
  ): Promise<PlinkoBetResult> {
    const seed = await new SeedHelper(tx).getActiveBundle(userId, 'plinko', input.clientSeed);
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
      );
      finalPath = pathForBucket(input.rows, finalBucket);
      finalMultiplier = new Prisma.Decimal((multipliers[finalBucket] ?? 0).toFixed(4));
      finalPayout = amount.mul(finalMultiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
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
): number {
  const candidates = table
    .map((multiplier, bucket) => ({ bucket, multiplier }))
    .filter((x) =>
      wantWin
        ? x.multiplier > 1 && multiplierMatchesControlBounds(x.multiplier, amount, controlled)
        : x.multiplier <= 1,
    );
  const pool =
    candidates.length > 0
      ? candidates
      : table.map((multiplier, bucket) => ({ bucket, multiplier }));
  pool.sort((a, b) => {
    if (wantWin) {
      const targetDiff =
        Math.abs(a.multiplier - targetMultiplier) - Math.abs(b.multiplier - targetMultiplier);
      if (targetDiff !== 0) return targetDiff;
    }
    const bucketDiff = Math.abs(a.bucket - originalBucket) - Math.abs(b.bucket - originalBucket);
    if (bucketDiff !== 0) return bucketDiff;
    return a.multiplier - b.multiplier;
  });
  return pool[0]?.bucket ?? 0;
}

function pathForBucket(rows: number, bucket: number): ('left' | 'right')[] {
  const rights = Math.max(0, Math.min(rows, bucket));
  return Array.from({ length: rows }, (_, index) => {
    const before = Math.floor((index * rights) / rows);
    const after = Math.floor(((index + 1) * rights) / rows);
    return after > before ? 'right' : 'left';
  });
}
