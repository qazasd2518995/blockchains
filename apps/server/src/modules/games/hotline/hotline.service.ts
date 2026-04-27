import { PrismaClient, Prisma } from '@prisma/client';
import { getHotlineReelCount, hotlineSpin, hotlineEvaluate } from '@bg/provably-fair';
import { GameId, type HotlineBetResult } from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runSerializable,
  serializableTxOpts,
} from '../_common/BaseGameService.js';
import { applyControls, finalizeControls } from '../_common/controls.js';
import type { HotlineBetInput } from './hotline.schema.js';

export class HotlineService {
  constructor(private readonly prisma: PrismaClient) {}

  async bet(userId: string, input: HotlineBetInput): Promise<HotlineBetResult> {
    const amount = new Prisma.Decimal(input.amount);
    const gameId = input.gameId ?? GameId.HOTLINE;
    const reelCount = getHotlineReelCount(gameId);

    return runSerializable(this.prisma, async (tx) => {
      await lockUserAndCheckFunds(tx, userId, amount);
      const seed = await new SeedHelper(tx).getActiveBundle(
        userId,
        gameId,
        input.clientSeed,
      );
      const grid = hotlineSpin(seed.serverSeed, seed.clientSeed, seed.nonce, reelCount);
      const { lines, totalMultiplier } = hotlineEvaluate(grid);
      const multiplierD = new Prisma.Decimal(totalMultiplier.toFixed(4));
      const payout = amount.mul(multiplierD).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const controlled = await applyControls(tx, userId, gameId, {
        won: payout.greaterThan(amount),
        amount,
        multiplier: multiplierD,
        payout,
      });

      let finalGrid = grid;
      let finalLines = lines;
      let finalMultiplier = multiplierD;
      let finalPayout = payout;
      if (controlled.controlled) {
        finalGrid = controlled.won
          ? winningHotlineGrid(reelCount)
          : losingHotlineGrid(reelCount);
        const evaluated = hotlineEvaluate(finalGrid);
        finalLines = evaluated.lines;
        finalMultiplier = new Prisma.Decimal(evaluated.totalMultiplier.toFixed(4));
        finalPayout = amount.mul(finalMultiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      }
      const profit = finalPayout.minus(amount);

      const originalResult = { grid, lines };
      const finalResult = {
        grid: finalGrid,
        lines: finalLines,
        controlled: controlled.controlled,
        flipReason: controlled.flipReason ?? null,
        raw: controlled.controlled ? originalResult : null,
      };

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId,
          amount,
          multiplier: finalMultiplier,
          payout: finalPayout,
          profit,
          nonce: seed.nonce,
          clientSeedUsed: seed.clientSeed,
          serverSeedId: seed.serverSeedId,
          resultData: finalResult as unknown as Prisma.InputJsonValue,
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
        gameId,
        { won: payout.greaterThan(amount), amount, multiplier: multiplierD, payout },
        { won: finalPayout.greaterThan(amount), amount, multiplier: finalMultiplier, payout: finalPayout },
        controlled,
        bet.id,
        originalResult as unknown as Prisma.InputJsonValue,
        finalResult as unknown as Prisma.InputJsonValue,
      );

      return {
        betId: bet.id,
        grid: finalGrid,
        lines: finalLines,
        multiplier: Number(finalMultiplier.toFixed(4)),
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

function winningHotlineGrid(reelCount: number): number[][] {
  return [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 4],
    [0, 4, 5],
    [0, 5, 1],
  ].slice(0, reelCount);
}

function losingHotlineGrid(reelCount: number): number[][] {
  return [
    [3, 5, 0],
    [2, 5, 3],
    [2, 3, 4],
    [0, 4, 0],
    [5, 0, 3],
  ].slice(0, reelCount);
}
