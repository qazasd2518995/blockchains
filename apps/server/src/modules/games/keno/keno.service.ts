import { PrismaClient, Prisma } from '@prisma/client';
import { kenoDraw, kenoEvaluate, kenoMultiplier, KENO_POOL_SIZE, KENO_DRAW_COUNT } from '@bg/provably-fair';
import { GameId, type KenoBetResult } from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runSerializable,
  serializableTxOpts,
} from '../_common/BaseGameService.js';
import { applyControls, finalizeControls, multiplierMatchesControlBounds } from '../_common/controls.js';
import type { KenoBetInput } from './keno.schema.js';

export class KenoService {
  constructor(private readonly prisma: PrismaClient) {}

  async bet(userId: string, input: KenoBetInput): Promise<KenoBetResult> {
    const amount = new Prisma.Decimal(input.amount);
    const unique = Array.from(new Set(input.selected));

    return runSerializable(this.prisma, async (tx) => {
      await lockUserAndCheckFunds(tx, userId, amount);
      const seed = await new SeedHelper(tx).getActiveBundle(
        userId,
        'keno',
        input.clientSeed,
      );

      const drawn = kenoDraw(seed.serverSeed, seed.clientSeed, seed.nonce);
      const { hits } = kenoEvaluate(drawn, unique);
      const multiplier = kenoMultiplier(input.risk, unique.length, hits.length);
      const multiplierD = new Prisma.Decimal(multiplier.toFixed(4));
      const payout = amount.mul(multiplierD).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const controlled = await applyControls(tx, userId, GameId.KENO, {
        won: payout.greaterThan(amount),
        amount,
        multiplier: multiplierD,
        payout,
      });

      let finalDrawn = drawn;
      let finalHits = hits;
      let finalMultiplier = multiplierD;
      let finalPayout = payout;
      if (controlled.controlled) {
        const hitCount = chooseKenoHitCount(input.risk, unique.length, controlled.won, amount, controlled);
        finalDrawn = drawWithHitCount(unique, hitCount);
        finalHits = kenoEvaluate(finalDrawn, unique).hits;
        finalMultiplier = new Prisma.Decimal(kenoMultiplier(input.risk, unique.length, finalHits.length).toFixed(4));
        finalPayout = amount.mul(finalMultiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      }
      const profit = finalPayout.minus(amount);

      const originalResult = { drawn, selected: unique, hits, risk: input.risk };
      const finalResult = {
        drawn: finalDrawn,
        selected: unique,
        hits: finalHits,
        risk: input.risk,
        controlled: controlled.controlled,
        flipReason: controlled.flipReason ?? null,
        raw: controlled.controlled ? originalResult : null,
      };

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: GameId.KENO,
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
        GameId.KENO,
        { won: payout.greaterThan(amount), amount, multiplier: multiplierD, payout },
        { won: finalPayout.greaterThan(amount), amount, multiplier: finalMultiplier, payout: finalPayout },
        controlled,
        bet.id,
        originalResult,
        finalResult,
      );

      return {
        betId: bet.id,
        drawn: finalDrawn,
        selected: unique,
        hits: finalHits,
        hitCount: finalHits.length,
        risk: input.risk,
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

function chooseKenoHitCount(
  risk: KenoBetInput['risk'],
  pickCount: number,
  wantWin: boolean,
  amount: Prisma.Decimal,
  controlled: Parameters<typeof multiplierMatchesControlBounds>[2],
): number {
  const candidates = Array.from({ length: pickCount + 1 }, (_, hits) => ({
    hits,
    multiplier: kenoMultiplier(risk, pickCount, hits),
  })).filter((x) =>
    wantWin
      ? x.multiplier > 1 && multiplierMatchesControlBounds(x.multiplier, amount, controlled)
      : x.multiplier <= 1,
  );
  const pool = candidates.length > 0 ? candidates : [{ hits: wantWin ? pickCount : 0, multiplier: 0 }];
  pool.sort((a, b) => (wantWin ? b.multiplier - a.multiplier : a.multiplier - b.multiplier));
  return pool[0]?.hits ?? 0;
}

function drawWithHitCount(selected: number[], hitCount: number): number[] {
  const hits = selected.slice(0, hitCount);
  const selectedSet = new Set(selected);
  const misses = Array.from({ length: KENO_POOL_SIZE }, (_, index) => index + 1)
    .filter((n) => !selectedSet.has(n))
    .slice(0, KENO_DRAW_COUNT - hits.length);
  return [...hits, ...misses].sort((a, b) => a - b);
}
