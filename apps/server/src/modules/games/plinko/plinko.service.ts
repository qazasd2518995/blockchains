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
      const profit = payout.minus(amount);

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: GameId.PLINKO,
          amount,
          multiplier: multiplierD,
          payout,
          profit,
          nonce: seed.nonce,
          clientSeedUsed: seed.clientSeed,
          serverSeedId: seed.serverSeedId,
          resultData: { path, bucket, rows: input.rows, risk: input.risk, multipliers },
        },
      });
      await debitAndRecord(tx, userId, amount, bet.id);
      const newBalance =
        payout.greaterThan(0)
          ? await creditAndRecord(tx, userId, payout, bet.id, 'BET_WIN')
          : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;

      return {
        betId: bet.id,
        path,
        bucket,
        rows: input.rows,
        risk: input.risk,
        multiplier,
        multipliers,
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
