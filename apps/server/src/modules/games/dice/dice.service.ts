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
import { applyControls, finalizeControls } from '../_common/controls.js';
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

      // 若控制翻轉了 won 結果，重新生成一個符合 won 的 roll，避免畫面顯示與結算矛盾
      // （例如 target=50 under、PF roll=30 理論上贏，但被控制改為輸 — 若仍顯示 30
      // 玩家會立刻發現不對勁。rawRoll 保留 PF 真值供審計）
      const rawRoll = outcome.roll;
      let displayRoll = rawRoll;
      if (controlled.controlled && finalWon !== outcome.won) {
        const t = input.target;
        if (input.direction === 'under') {
          // under: 贏 → roll < t；輸 → roll >= t
          displayRoll = finalWon
            ? Math.min(t - 0.01, Math.random() * t)
            : t + Math.random() * (100 - t);
        } else {
          // over: 贏 → roll > t；輸 → roll <= t
          displayRoll = finalWon
            ? t + 0.01 + Math.random() * (100 - t - 0.01)
            : Math.random() * t;
        }
        displayRoll = Math.max(0, Math.min(99.99, Number(displayRoll.toFixed(2))));
      }

      const originalResult = {
        roll: rawRoll,
        target: input.target,
        direction: input.direction,
        winChance: outcome.winChance,
        won: outcome.won,
      };
      const finalResult = {
        roll: displayRoll,
        rawRoll,
        target: input.target,
        direction: input.direction,
        winChance: outcome.winChance,
        rawWon: outcome.won,
        finalWon,
        controlled: controlled.controlled,
        flipReason: controlled.flipReason ?? null,
      };

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
          resultData: finalResult,
        },
      });

      await debitAndRecord(tx, userId, amount, bet.id);
      const newBalance = finalWon
        ? await creditAndRecord(tx, userId, finalPayout, bet.id, 'BET_WIN')
        : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;
      await finalizeControls(
        tx,
        userId,
        GameId.DICE,
        { won: outcome.won, amount, multiplier: predictedMultiplier, payout: predictedPayout },
        { won: finalPayout.greaterThan(amount), amount, multiplier: finalMultiplier, payout: finalPayout },
        controlled,
        bet.id,
        originalResult,
        finalResult,
      );

      return {
        betId: bet.id,
        roll: displayRoll,
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
