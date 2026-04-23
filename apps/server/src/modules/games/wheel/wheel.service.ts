import { PrismaClient, Prisma } from '@prisma/client';
import { wheelSpin, wheelMultiplier, wheelTable, type WheelSegmentCount } from '@bg/provably-fair';
import { GameId, type WheelBetResult } from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runSerializable,
  serializableTxOpts,
} from '../_common/BaseGameService.js';
import { applyControls, finalizeControls } from '../_common/controls.js';
import type { WheelBetInput } from './wheel.schema.js';

export class WheelService {
  constructor(private readonly prisma: PrismaClient) {}

  async bet(userId: string, input: WheelBetInput): Promise<WheelBetResult> {
    const amount = new Prisma.Decimal(input.amount);

    return runSerializable(this.prisma, async (tx) => {
      await lockUserAndCheckFunds(tx, userId, amount);
      const seed = await new SeedHelper(tx).getActiveBundle(
        userId,
        'wheel',
        input.clientSeed,
      );
      const segments = input.segments as WheelSegmentCount;
      const { segmentIndex } = wheelSpin(
        seed.serverSeed,
        seed.clientSeed,
        seed.nonce,
        segments,
      );
      const multiplier = wheelMultiplier(input.risk, segments, segmentIndex);
      const table = wheelTable(input.risk, segments);
      const multiplierD = new Prisma.Decimal(multiplier.toFixed(4));
      const payout = amount
        .mul(multiplierD)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const controlled = await applyControls(tx, userId, GameId.WHEEL, {
        won: payout.greaterThan(amount),
        amount,
        multiplier: multiplierD,
        payout,
      });

      let finalSegmentIndex = segmentIndex;
      let finalMultiplier = multiplierD;
      let finalPayout = payout;
      if (controlled.controlled) {
        finalSegmentIndex = chooseWheelSegment(table, controlled.won);
        finalMultiplier = new Prisma.Decimal((table[finalSegmentIndex] ?? 0).toFixed(4));
        finalPayout = amount.mul(finalMultiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      }
      const profit = finalPayout.minus(amount);

      const originalResult = { segmentIndex, segments, risk: input.risk, multipliers: table };
      const finalResult = {
        segmentIndex: finalSegmentIndex,
        segments,
        risk: input.risk,
        multipliers: table,
        controlled: controlled.controlled,
        flipReason: controlled.flipReason ?? null,
        raw: controlled.controlled ? originalResult : null,
      };

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: GameId.WHEEL,
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
        GameId.WHEEL,
        { won: payout.greaterThan(amount), amount, multiplier: multiplierD, payout },
        { won: finalPayout.greaterThan(amount), amount, multiplier: finalMultiplier, payout: finalPayout },
        controlled,
        bet.id,
        originalResult,
        finalResult,
      );

      return {
        betId: bet.id,
        segmentIndex: finalSegmentIndex,
        multiplier: Number(finalMultiplier.toFixed(4)),
        risk: input.risk,
        segments,
        segmentMultipliers: table,
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

function chooseWheelSegment(table: number[], wantWin: boolean): number {
  const candidates = table
    .map((multiplier, segmentIndex) => ({ segmentIndex, multiplier }))
    .filter((x) => (wantWin ? x.multiplier > 1 : x.multiplier <= 1));
  const pool = candidates.length > 0 ? candidates : table.map((multiplier, segmentIndex) => ({ segmentIndex, multiplier }));
  pool.sort((a, b) => (wantWin ? b.multiplier - a.multiplier : a.multiplier - b.multiplier));
  return pool[0]?.segmentIndex ?? 0;
}
