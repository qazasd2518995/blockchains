import { PrismaClient, Prisma } from '@prisma/client';
import {
  getHotlineReelCount,
  getHotlineRowCount,
  hotlineSpin,
  hotlineSpinCascades,
  hotlineEvaluate,
} from '@bg/provably-fair';
import { GameId, type HotlineBetResult } from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runSerializable,
  serializableTxOpts,
} from '../_common/BaseGameService.js';
import { applyControls, finalizeControls, multiplierMatchesControlBounds } from '../_common/controls.js';
import type { HotlineBetInput } from './hotline.schema.js';

export class HotlineService {
  constructor(private readonly prisma: PrismaClient) {}

  async bet(userId: string, input: HotlineBetInput): Promise<HotlineBetResult> {
    const amount = new Prisma.Decimal(input.amount);
    const gameId = input.gameId ?? GameId.HOTLINE;
    const reelCount = getHotlineReelCount(gameId);
    const rowCount = getHotlineRowCount(gameId);

    return runSerializable(this.prisma, async (tx) => {
      await lockUserAndCheckFunds(tx, userId, amount);
      const seed = await new SeedHelper(tx).getActiveBundle(
        userId,
        gameId,
        input.clientSeed,
      );
      const naturalRound = buildHotlineRound(
        seed.serverSeed,
        seed.clientSeed,
        seed.nonce,
        reelCount,
        rowCount,
      );
      const multiplierD = new Prisma.Decimal(naturalRound.totalMultiplier.toFixed(4));
      const payout = amount.mul(multiplierD).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const controlled = await applyControls(tx, userId, gameId, {
        won: payout.greaterThan(amount),
        amount,
        multiplier: multiplierD,
        payout,
      });

      let finalGrid = naturalRound.grid;
      let finalLines = naturalRound.lines;
      let finalCascades = naturalRound.cascades;
      let finalMultiplier = multiplierD;
      let finalPayout = payout;
      if (controlled.controlled) {
        finalGrid = controlled.won
          ? winningHotlineGrid(gameId, amount, controlled)
          : losingHotlineGrid(gameId);
        const evaluated = hotlineEvaluate(finalGrid);
        finalLines = evaluated.lines;
        finalCascades = [];
        finalMultiplier = new Prisma.Decimal(evaluated.totalMultiplier.toFixed(4));
        finalPayout = amount.mul(finalMultiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      }
      const profit = finalPayout.minus(amount);

      const originalResult = {
        grid: naturalRound.grid,
        lines: naturalRound.lines,
        cascades: naturalRound.cascades,
      };
      const finalResult = {
        grid: finalGrid,
        lines: finalLines,
        cascades: finalCascades,
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
        cascades: finalCascades,
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

type HotlineRound = Pick<HotlineBetResult, 'grid' | 'lines' | 'cascades'> & {
  totalMultiplier: number;
};

function buildHotlineRound(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  reelCount: number,
  rowCount: number,
): HotlineRound {
  if (rowCount > 3) {
    const cascaded = hotlineSpinCascades(serverSeed, clientSeed, nonce, reelCount, rowCount);
    return {
      grid: cascaded.finalGrid,
      lines: cascaded.lines,
      cascades: cascaded.cascades,
      totalMultiplier: cascaded.totalMultiplier,
    };
  }

  const grid = hotlineSpin(serverSeed, clientSeed, nonce, reelCount, rowCount);
  const evaluated = hotlineEvaluate(grid);
  return {
    grid,
    lines: evaluated.lines,
    cascades: [],
    totalMultiplier: evaluated.totalMultiplier,
  };
}

function winningHotlineGrid(
  gameId: string,
  amount: Prisma.Decimal,
  controlled: Parameters<typeof multiplierMatchesControlBounds>[2],
): number[][] {
  const reelCount = getHotlineReelCount(gameId);
  const rowCount = getHotlineRowCount(gameId);
  if (rowCount > 3) {
    return winningMegaHotlineGrid(amount, controlled);
  }

  const smallLine = smallWinningHotlineGrid(reelCount);
  const fullLine = [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 4],
    [0, 4, 5],
    [0, 5, 1],
  ].slice(0, reelCount);
  const pool = [smallLine, fullLine];
  return pool.find((grid) => {
    const evaluated = hotlineEvaluate(grid);
    return evaluated.totalMultiplier > 1 &&
      multiplierMatchesControlBounds(evaluated.totalMultiplier, amount, controlled);
  }) ?? fullLine;
}

function winningMegaHotlineGrid(
  amount: Prisma.Decimal,
  controlled: Parameters<typeof multiplierMatchesControlBounds>[2],
): number[][] {
  const candidates: number[][][] = [
    [
      [4, 4, 0, 1, 2],
      [4, 3, 4, 0, 1],
      [4, 2, 3, 4, 0],
      [0, 1, 2, 3, 5],
      [2, 3, 0, 1, 5],
      [1, 2, 3, 4, 0],
    ],
    [
      [5, 5, 0, 1, 2],
      [5, 1, 5, 2, 3],
      [5, 2, 3, 5, 4],
      [5, 3, 4, 0, 1],
      [0, 1, 2, 3, 4],
      [1, 2, 3, 4, 0],
    ],
    [
      [3, 3, 0, 1, 2],
      [3, 1, 3, 2, 4],
      [3, 2, 4, 3, 5],
      [3, 4, 5, 0, 1],
      [3, 5, 0, 1, 2],
      [0, 1, 2, 4, 5],
    ],
    [
      [5, 5, 0, 1, 2],
      [5, 1, 5, 2, 3],
      [5, 2, 3, 5, 4],
      [5, 3, 4, 0, 1],
      [5, 4, 0, 1, 2],
      [5, 0, 1, 2, 3],
    ],
  ];

  return candidates.find((grid) => {
    const evaluated = hotlineEvaluate(grid);
    return evaluated.totalMultiplier > 1 &&
      multiplierMatchesControlBounds(evaluated.totalMultiplier, amount, controlled);
  }) ?? candidates[2]!;
}

function smallWinningHotlineGrid(reelCount: number): number[][] {
  if (reelCount === 3) {
    return [
      [0, 1, 2],
      [0, 2, 3],
      [0, 3, 4],
    ];
  }
  return [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 4],
    [1, 4, 5],
    [2, 5, 1],
  ];
}

function losingHotlineGrid(gameId: string): number[][] {
  const reelCount = getHotlineReelCount(gameId);
  const rowCount = getHotlineRowCount(gameId);
  if (rowCount > 3) {
    return [
      [0, 0, 1, 1, 0],
      [2, 2, 3, 3, 2],
      [4, 4, 5, 5, 4],
      [0, 0, 1, 1, 0],
      [2, 2, 3, 3, 2],
      [4, 4, 5, 5, 4],
    ];
  }

  return [
    [3, 5, 0],
    [2, 5, 3],
    [2, 3, 4],
    [0, 4, 0],
    [5, 0, 3],
  ].slice(0, reelCount);
}
