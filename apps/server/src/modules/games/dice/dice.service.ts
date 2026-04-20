import { PrismaClient, Prisma } from '@prisma/client';
import { diceDetermine } from '@bg/provably-fair';
import { GameId, type DiceBetResult } from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runSerializable,
} from '../_common/BaseGameService.js';
import { applyControls } from '../_common/controls.js';
import type { DiceBetInput } from './dice.schema.js';

export class DiceService {
  constructor(private readonly prisma: PrismaClient) {}

  async bet(userId: string, input: DiceBetInput): Promise<DiceBetResult> {
    const amount = new Prisma.Decimal(input.amount);

    return runSerializable(this.prisma, async (tx) => {
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

      const predictedMultiplier = new Prisma.Decimal(outcome.multiplier.toFixed(4));
      const predictedPayout = outcome.won
        ? amount.mul(predictedMultiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN)
        : new Prisma.Decimal(0);

      // 代理後台控制 hook — 可能翻轉結果
      const controlled = await applyControls(tx, userId, GameId.DICE, {
        won: outcome.won,
        amount,
        multiplier: predictedMultiplier,
        payout: predictedPayout,
      });
      const finalMultiplier = controlled.multiplier;
      const finalPayout = controlled.payout;
      const finalWon = controlled.won;
      const profit = finalPayout.minus(amount);

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: GameId.DICE,
          amount,
          multiplier: finalMultiplier,
          payout: finalPayout,
          profit,
          nonce: seed.nonce,
          clientSeedUsed: seed.clientSeed,
          serverSeedId: seed.serverSeedId,
          resultData: {
            roll: outcome.roll,
            target: input.target,
            direction: input.direction,
            winChance: outcome.winChance,
            rawWon: outcome.won,
            finalWon,
            controlled: controlled.controlled,
            flipReason: controlled.flipReason ?? null,
          },
        },
      });

      await debitAndRecord(tx, userId, amount, bet.id);
      const newBalance = finalWon
        ? await creditAndRecord(tx, userId, finalPayout, bet.id, 'BET_WIN')
        : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;

      return {
        betId: bet.id,
        roll: outcome.roll,
        won: finalWon,
        target: input.target,
        direction: input.direction,
        multiplier: Number(finalMultiplier.toFixed(4)),
        winChance: outcome.winChance,
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
