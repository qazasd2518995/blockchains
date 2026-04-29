import { PrismaClient, Prisma } from '@prisma/client';
import { plinkoPath, plinkoMultiplier, plinkoTable } from '@bg/provably-fair';
import { GameId, type PlinkoBetResult } from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runSerializable,
  serializableTxOpts,
} from '../_common/BaseGameService.js';
import { applyControls, finalizeControls, multiplierMatchesControlBounds } from '../_common/controls.js';
import type { PlinkoBetInput } from './plinko.schema.js';

export class PlinkoService {
  constructor(private readonly prisma: PrismaClient) {}

  async bet(userId: string, input: PlinkoBetInput): Promise<PlinkoBetResult> {
    const amount = new Prisma.Decimal(input.amount);

    return runSerializable(this.prisma, async (tx) => {
      await lockUserAndCheckFunds(tx, userId, amount);
      const seed = await new SeedHelper(tx).getActiveBundle(
        userId,
        'plinko',
        input.clientSeed,
      );
      const { path, bucket } = plinkoPath(
        seed.serverSeed,
        seed.clientSeed,
        seed.nonce,
        input.rows,
      );
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
        finalBucket = choosePlinkoBucket(multipliers, controlled.won, amount, controlled);
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
      const newBalance =
        finalPayout.greaterThan(0)
          ? await creditAndRecord(tx, userId, finalPayout, bet.id, 'BET_WIN')
          : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;
      await finalizeControls(
        tx,
        userId,
        GameId.PLINKO,
        { won: payout.greaterThan(amount), amount, multiplier: multiplierD, payout },
        { won: finalPayout.greaterThan(amount), amount, multiplier: finalMultiplier, payout: finalPayout },
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
    });
  }
}

function choosePlinkoBucket(
  table: number[],
  wantWin: boolean,
  amount: Prisma.Decimal,
  controlled: Parameters<typeof multiplierMatchesControlBounds>[2],
): number {
  const candidates = table
    .map((multiplier, bucket) => ({ bucket, multiplier }))
    .filter((x) =>
      wantWin
        ? x.multiplier > 1 && multiplierMatchesControlBounds(x.multiplier, amount, controlled)
        : x.multiplier <= 1,
    );
  const pool = candidates.length > 0 ? candidates : table.map((multiplier, bucket) => ({ bucket, multiplier }));
  pool.sort((a, b) => (wantWin ? b.multiplier - a.multiplier : a.multiplier - b.multiplier));
  return pool[0]?.bucket ?? 0;
}

function pathForBucket(rows: number, bucket: number): ('left' | 'right')[] {
  const rights = Math.max(0, Math.min(rows, bucket));
  return Array.from({ length: rows }, (_, index) => (index < rights ? 'right' : 'left'));
}
