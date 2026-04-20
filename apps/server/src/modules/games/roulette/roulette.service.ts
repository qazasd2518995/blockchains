import { PrismaClient, Prisma } from '@prisma/client';
import { rouletteSpin, rouletteEvaluate, type RouletteBet } from '@bg/provably-fair';
import { GameId, type RouletteBetResult } from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runSerializable,
  serializableTxOpts,
} from '../_common/BaseGameService.js';
import type { RouletteBetInput } from './roulette.schema.js';

export class RouletteService {
  constructor(private readonly prisma: PrismaClient, private readonly gameId: string = GameId.MINI_ROULETTE) {}

  async bet(userId: string, input: RouletteBetInput): Promise<RouletteBetResult> {
    const totalAmount = input.bets.reduce((s, b) => s + b.amount, 0);
    const amountD = new Prisma.Decimal(totalAmount);

    return runSerializable(this.prisma, async (tx) => {
      await lockUserAndCheckFunds(tx, userId, amountD);
      const seed = await new SeedHelper(tx).getActiveBundle(
        userId,
        'roulette',
        input.clientSeed,
      );
      const { slot } = rouletteSpin(seed.serverSeed, seed.clientSeed, seed.nonce);
      const { totalPayout, wins } = rouletteEvaluate(slot, input.bets as RouletteBet[]);
      const payoutD = new Prisma.Decimal(totalPayout.toFixed(2));
      const profitD = payoutD.minus(amountD);
      const multiplierD =
        totalAmount > 0
          ? new Prisma.Decimal((totalPayout / totalAmount).toFixed(4))
          : new Prisma.Decimal(0);

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: this.gameId,
          amount: amountD,
          multiplier: multiplierD,
          payout: payoutD,
          profit: profitD,
          nonce: seed.nonce,
          clientSeedUsed: seed.clientSeed,
          serverSeedId: seed.serverSeedId,
          resultData: { slot, bets: input.bets, wins } as unknown as Prisma.InputJsonValue,
        },
      });
      await debitAndRecord(tx, userId, amountD, bet.id);
      const newBalance =
        payoutD.greaterThan(0)
          ? await creditAndRecord(tx, userId, payoutD, bet.id, 'BET_WIN')
          : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;

      return {
        betId: bet.id,
        slot,
        totalAmount: amountD.toFixed(2),
        totalPayout: payoutD.toFixed(2),
        profit: profitD.toFixed(2),
        winningBets: wins.map((w) => ({
          type: w.bet.type as RouletteBetResult['winningBets'][number]['type'],
          value: w.bet.value,
          payout: w.payout.toFixed(2),
        })),
        newBalance: newBalance.toFixed(2),
        nonce: seed.nonce,
        serverSeedHash: seed.serverSeedHash,
        clientSeed: seed.clientSeed,
      };
    });
  }
}
