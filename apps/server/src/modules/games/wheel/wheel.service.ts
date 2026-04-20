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
      const profit = payout.minus(amount);

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: GameId.WHEEL,
          amount,
          multiplier: multiplierD,
          payout,
          profit,
          nonce: seed.nonce,
          clientSeedUsed: seed.clientSeed,
          serverSeedId: seed.serverSeedId,
          resultData: {
            segmentIndex,
            segments,
            risk: input.risk,
            multipliers: table,
          },
        },
      });
      await debitAndRecord(tx, userId, amount, bet.id);
      const newBalance =
        payout.greaterThan(0)
          ? await creditAndRecord(tx, userId, payout, bet.id, 'BET_WIN')
          : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;

      return {
        betId: bet.id,
        segmentIndex,
        multiplier,
        risk: input.risk,
        segments,
        segmentMultipliers: table,
        amount: amount.toFixed(2),
        payout: payout.toFixed(2),
        profit: profit.toFixed(2),
        newBalance: newBalance.toFixed(2),
        nonce: seed.nonce,
        serverSeedHash: seed.serverSeedHash,
        clientSeed: seed.clientSeed,
      };
    });
  }
}
