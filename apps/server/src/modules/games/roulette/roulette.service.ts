import { PrismaClient, Prisma } from '@prisma/client';
import { rouletteSpin, rouletteEvaluate, ROULETTE_SLOTS, type RouletteBet } from '@bg/provably-fair';
import { GameId, type RouletteBetResult } from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runSerializable,
  serializableTxOpts,
} from '../_common/BaseGameService.js';
import { applyControls, finalizeControls } from '../_common/controls.js';
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
      const multiplierD =
        totalAmount > 0
          ? new Prisma.Decimal((totalPayout / totalAmount).toFixed(4))
          : new Prisma.Decimal(0);
      const controlled = await applyControls(tx, userId, this.gameId, {
        won: payoutD.greaterThan(amountD),
        amount: amountD,
        multiplier: multiplierD,
        payout: payoutD,
      });

      let finalSlot = slot;
      let finalEval = { totalPayout, wins };
      if (controlled.controlled) {
        finalSlot = chooseRouletteSlot(input.bets as RouletteBet[], totalAmount, controlled.won);
        finalEval = rouletteEvaluate(finalSlot, input.bets as RouletteBet[]);
      }
      const finalPayoutD = new Prisma.Decimal(finalEval.totalPayout.toFixed(2));
      const finalProfitD = finalPayoutD.minus(amountD);
      const finalMultiplierD =
        totalAmount > 0
          ? new Prisma.Decimal((finalEval.totalPayout / totalAmount).toFixed(4))
          : new Prisma.Decimal(0);

      const originalResult = { slot, bets: input.bets, wins };
      const finalResult = {
        slot: finalSlot,
        bets: input.bets,
        wins: finalEval.wins,
        controlled: controlled.controlled,
        flipReason: controlled.flipReason ?? null,
        raw: controlled.controlled ? originalResult : null,
      };

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: this.gameId,
          amount: amountD,
          multiplier: finalMultiplierD,
          payout: finalPayoutD,
          profit: finalProfitD,
          nonce: seed.nonce,
          clientSeedUsed: seed.clientSeed,
          serverSeedId: seed.serverSeedId,
          resultData: finalResult as unknown as Prisma.InputJsonValue,
        },
      });
      await debitAndRecord(tx, userId, amountD, bet.id);
      const newBalance =
        finalPayoutD.greaterThan(0)
          ? await creditAndRecord(tx, userId, finalPayoutD, bet.id, 'BET_WIN')
          : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;
      await finalizeControls(
        tx,
        userId,
        this.gameId,
        { won: payoutD.greaterThan(amountD), amount: amountD, multiplier: multiplierD, payout: payoutD },
        { won: finalPayoutD.greaterThan(amountD), amount: amountD, multiplier: finalMultiplierD, payout: finalPayoutD },
        controlled,
        bet.id,
        originalResult as unknown as Prisma.InputJsonValue,
        finalResult as unknown as Prisma.InputJsonValue,
      );

      return {
        betId: bet.id,
        slot: finalSlot,
        totalAmount: amountD.toFixed(2),
        totalPayout: finalPayoutD.toFixed(2),
        profit: finalProfitD.toFixed(2),
        winningBets: finalEval.wins.map((w) => ({
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

function chooseRouletteSlot(bets: RouletteBet[], totalAmount: number, wantWin: boolean): number {
  const candidates = Array.from({ length: ROULETTE_SLOTS }, (_, slot) => {
    const evaluated = rouletteEvaluate(slot, bets);
    return { slot, profit: evaluated.totalPayout - totalAmount, payout: evaluated.totalPayout };
  }).filter((x) => (wantWin ? x.profit > 0 : x.profit < 0));
  const pool = candidates.length > 0
    ? candidates
    : Array.from({ length: ROULETTE_SLOTS }, (_, slot) => {
      const evaluated = rouletteEvaluate(slot, bets);
      return { slot, profit: evaluated.totalPayout - totalAmount, payout: evaluated.totalPayout };
    });
  pool.sort((a, b) => (wantWin ? b.profit - a.profit : a.profit - b.profit));
  return pool[0]?.slot ?? 0;
}
