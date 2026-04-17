import { PrismaClient, Prisma } from '@prisma/client';
import { diceDetermine } from '@bg/provably-fair';
import { GameId, type DiceBetResult } from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  serializableTxOpts,
} from '../_common/BaseGameService.js';
import type { DiceBetInput } from './dice.schema.js';

export class DiceService {
  constructor(private readonly prisma: PrismaClient) {}

  async bet(userId: string, input: DiceBetInput): Promise<DiceBetResult> {
    const amount = new Prisma.Decimal(input.amount);

    return this.prisma.$transaction(async (tx) => {
      await lockUserAndCheckFunds(tx, userId, amount);
      const seed = await new SeedHelper(tx).getActiveBundle(
        userId,
        'dice',
        input.clientSeed,
      );

      const outcome = diceDetermine(
        seed.serverSeed,
        seed.clientSeed,
        seed.nonce,
        input.target,
        input.direction,
      );

      const multiplier = new Prisma.Decimal(outcome.multiplier.toFixed(4));
      const payout = outcome.won
        ? amount.mul(multiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN)
        : new Prisma.Decimal(0);
      const profit = payout.minus(amount);

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: GameId.DICE,
          amount,
          multiplier,
          payout,
          profit,
          nonce: seed.nonce,
          clientSeedUsed: seed.clientSeed,
          serverSeedId: seed.serverSeedId,
          resultData: {
            roll: outcome.roll,
            target: input.target,
            direction: input.direction,
            winChance: outcome.winChance,
            won: outcome.won,
          },
        },
      });

      await debitAndRecord(tx, userId, amount, bet.id);
      const newBalance = outcome.won
        ? await creditAndRecord(tx, userId, payout, bet.id, 'BET_WIN')
        : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;

      return {
        betId: bet.id,
        roll: outcome.roll,
        won: outcome.won,
        target: input.target,
        direction: input.direction,
        multiplier: outcome.multiplier,
        winChance: outcome.winChance,
        amount: amount.toFixed(2),
        payout: payout.toFixed(2),
        profit: profit.toFixed(2),
        newBalance: newBalance.toFixed(2),
        nonce: seed.nonce,
        serverSeedHash: seed.serverSeedHash,
        clientSeed: seed.clientSeed,
      };
    }, serializableTxOpts());
  }
}
