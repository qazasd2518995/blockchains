import { PrismaClient, Prisma } from '@prisma/client';
import { hotlineSpin, hotlineEvaluate } from '@bg/provably-fair';
import { GameId, type HotlineBetResult } from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runSerializable,
  serializableTxOpts,
} from '../_common/BaseGameService.js';
import type { HotlineBetInput } from './hotline.schema.js';

export class HotlineService {
  constructor(private readonly prisma: PrismaClient) {}

  async bet(userId: string, input: HotlineBetInput): Promise<HotlineBetResult> {
    const amount = new Prisma.Decimal(input.amount);

    return runSerializable(this.prisma, async (tx) => {
      await lockUserAndCheckFunds(tx, userId, amount);
      const seed = await new SeedHelper(tx).getActiveBundle(
        userId,
        'hotline',
        input.clientSeed,
      );
      const grid = hotlineSpin(seed.serverSeed, seed.clientSeed, seed.nonce);
      const { lines, totalMultiplier } = hotlineEvaluate(grid);
      const multiplierD = new Prisma.Decimal(totalMultiplier.toFixed(4));
      const payout = amount.mul(multiplierD).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const profit = payout.minus(amount);

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: GameId.HOTLINE,
          amount,
          multiplier: multiplierD,
          payout,
          profit,
          nonce: seed.nonce,
          clientSeedUsed: seed.clientSeed,
          serverSeedId: seed.serverSeedId,
          resultData: { grid, lines } as unknown as Prisma.InputJsonValue,
        },
      });
      await debitAndRecord(tx, userId, amount, bet.id);
      const newBalance =
        payout.greaterThan(0)
          ? await creditAndRecord(tx, userId, payout, bet.id, 'BET_WIN')
          : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;

      return {
        betId: bet.id,
        grid,
        lines,
        multiplier: totalMultiplier,
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
