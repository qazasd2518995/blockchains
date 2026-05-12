import { PrismaClient, Prisma } from '@prisma/client';
import {
  getHotlineReelCount,
  getHotlineRowCount,
  hotlineSpin,
  hotlineBuyFreeSpins,
  hotlineSpinCascades,
  hotlineEvaluate,
} from '@bg/provably-fair';
import {
  GameId,
  HOTLINE_JACKPOT_PASSIVE_GROWTH_PER_SECOND,
  HOTLINE_JACKPOT_RESET_INTERVAL_SECONDS,
  HOTLINE_JACKPOT_RESET_OFFSET_SECONDS,
  HOTLINE_JACKPOT_RESET_VALUE,
  HOTLINE_JACKPOT_SIMULATION_EPOCH,
  type HotlineBetResult,
  type HotlineJackpotSnapshot,
  type HotlineMegaFeatureResult,
} from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runSerializable,
} from '../_common/BaseGameService.js';
import {
  applyControls,
  finalizeControls,
  multiplierMatchesControlBounds,
} from '../_common/controls.js';
import type { HotlineBetInput } from './hotline.schema.js';

const HOTLINE_JACKPOT_CONTRIBUTION_RATES = {
  grand: new Prisma.Decimal('0.006'),
  major: new Prisma.Decimal('0.0035'),
  minor: new Prisma.Decimal('0.0018'),
  mini: new Prisma.Decimal('0.0012'),
} as const;
type HotlineJackpotKey = keyof typeof HOTLINE_JACKPOT_CONTRIBUTION_RATES;

const HOTLINE_JACKPOT_PASSIVE_GROWTH = {
  grand: new Prisma.Decimal(HOTLINE_JACKPOT_PASSIVE_GROWTH_PER_SECOND.grand),
  major: new Prisma.Decimal(HOTLINE_JACKPOT_PASSIVE_GROWTH_PER_SECOND.major),
  minor: new Prisma.Decimal(HOTLINE_JACKPOT_PASSIVE_GROWTH_PER_SECOND.minor),
  mini: new Prisma.Decimal(HOTLINE_JACKPOT_PASSIVE_GROWTH_PER_SECOND.mini),
} as const;
const HOTLINE_JACKPOT_RESET = new Prisma.Decimal(HOTLINE_JACKPOT_RESET_VALUE);
const HOTLINE_JACKPOT_EPOCH_MS = Date.parse(HOTLINE_JACKPOT_SIMULATION_EPOCH);
const HOTLINE_JACKPOT_RESET_INTERVAL_MS: Record<HotlineJackpotKey, number> = {
  grand: Number.parseInt(HOTLINE_JACKPOT_RESET_INTERVAL_SECONDS.grand, 10) * 1000,
  major: Number.parseInt(HOTLINE_JACKPOT_RESET_INTERVAL_SECONDS.major, 10) * 1000,
  minor: Number.parseInt(HOTLINE_JACKPOT_RESET_INTERVAL_SECONDS.minor, 10) * 1000,
  mini: Number.parseInt(HOTLINE_JACKPOT_RESET_INTERVAL_SECONDS.mini, 10) * 1000,
};
const HOTLINE_JACKPOT_RESET_OFFSET_MS: Record<HotlineJackpotKey, number> = {
  grand: Number.parseInt(HOTLINE_JACKPOT_RESET_OFFSET_SECONDS.grand, 10) * 1000,
  major: Number.parseInt(HOTLINE_JACKPOT_RESET_OFFSET_SECONDS.major, 10) * 1000,
  minor: Number.parseInt(HOTLINE_JACKPOT_RESET_OFFSET_SECONDS.minor, 10) * 1000,
  mini: Number.parseInt(HOTLINE_JACKPOT_RESET_OFFSET_SECONDS.mini, 10) * 1000,
};

type HotlineJackpotRecord = {
  gameId: string;
  grand: Prisma.Decimal;
  major: Prisma.Decimal;
  minor: Prisma.Decimal;
  mini: Prisma.Decimal;
  updatedAt: Date;
};

type HotlineJackpotValues = Pick<HotlineJackpotRecord, 'grand' | 'major' | 'minor' | 'mini'>;

export class HotlineService {
  constructor(private readonly prisma: PrismaClient) {}

  async jackpot(gameId: string): Promise<HotlineJackpotSnapshot> {
    if (getHotlineRowCount(gameId) <= 3) {
      throw new Error('JACKPOT_ONLY_AVAILABLE_FOR_MEGA_SLOT');
    }

    const pool = await this.getOrCreateJackpotPool(this.prisma, gameId);
    return toJackpotSnapshot(pool, new Date());
  }

  async bet(userId: string, input: HotlineBetInput): Promise<HotlineBetResult> {
    const baseAmount = new Prisma.Decimal(input.amount);
    const gameId = input.gameId ?? GameId.HOTLINE;
    const reelCount = getHotlineReelCount(gameId);
    const rowCount = getHotlineRowCount(gameId);
    const buyFeature = Boolean(input.buyFeature);
    if (buyFeature && rowCount <= 3) {
      throw new Error('BUY_FEATURE_ONLY_AVAILABLE_FOR_MEGA_SLOT');
    }
    const stakeAmount = buyFeature ? baseAmount.mul(100) : baseAmount;

    return runSerializable(this.prisma, async (tx) => {
      await lockUserAndCheckFunds(tx, userId, stakeAmount);
      const seed = await new SeedHelper(tx).getActiveBundle(userId, gameId, input.clientSeed);
      const naturalRound = buildHotlineRound(
        seed.serverSeed,
        seed.clientSeed,
        seed.nonce,
        reelCount,
        rowCount,
        buyFeature,
      );
      const multiplierD = new Prisma.Decimal(naturalRound.totalMultiplier.toFixed(4));
      const payout = baseAmount.mul(multiplierD).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const accountingMultiplierD = stakeAmount.greaterThan(0)
        ? payout.div(stakeAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
        : new Prisma.Decimal(0);
      const controlPrediction = {
        won: payout.greaterThan(stakeAmount),
        amount: stakeAmount,
        multiplier: accountingMultiplierD,
        payout,
      };
      const controlled = buyFeature
        ? { ...controlPrediction, controlled: false as const }
        : await applyControls(tx, userId, gameId, controlPrediction);

      let finalGrid = naturalRound.grid;
      let finalLines = naturalRound.lines;
      let finalCascades = naturalRound.cascades;
      let finalFeatures = naturalRound.features;
      let finalMultiplier = accountingMultiplierD;
      let finalPayout = payout;
      if (controlled.controlled) {
        finalGrid = controlled.won
          ? winningHotlineGrid(gameId, stakeAmount, controlled)
          : losingHotlineGrid(gameId);
        const evaluated = hotlineEvaluate(finalGrid);
        finalLines = evaluated.lines;
        finalCascades = [];
        finalMultiplier = new Prisma.Decimal(evaluated.totalMultiplier.toFixed(4));
        finalPayout = stakeAmount
          .mul(finalMultiplier)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
        finalFeatures =
          rowCount > 3 ? buildControlledMegaFeature(Number(finalMultiplier.toFixed(4))) : undefined;
      }
      const profit = finalPayout.minus(stakeAmount);

      const originalResult = {
        grid: naturalRound.grid,
        lines: naturalRound.lines,
        cascades: naturalRound.cascades,
        ...(naturalRound.features ? { features: naturalRound.features } : {}),
        buyFeature,
        baseAmount: baseAmount.toFixed(2),
        stakeAmount: stakeAmount.toFixed(2),
      };
      const finalResult = {
        grid: finalGrid,
        lines: finalLines,
        cascades: finalCascades,
        ...(finalFeatures ? { features: finalFeatures } : {}),
        buyFeature,
        baseAmount: baseAmount.toFixed(2),
        stakeAmount: stakeAmount.toFixed(2),
        controlled: controlled.controlled,
        flipReason: controlled.flipReason ?? null,
        raw: controlled.controlled ? originalResult : null,
      };

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId,
          amount: stakeAmount,
          multiplier: finalMultiplier,
          payout: finalPayout,
          profit,
          nonce: seed.nonce,
          clientSeedUsed: seed.clientSeed,
          serverSeedId: seed.serverSeedId,
          resultData: finalResult as unknown as Prisma.InputJsonValue,
        },
      });
      await debitAndRecord(tx, userId, stakeAmount, bet.id);
      const newBalance = finalPayout.greaterThan(0)
        ? await creditAndRecord(tx, userId, finalPayout, bet.id, 'BET_WIN')
        : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;
      await finalizeControls(
        tx,
        userId,
        gameId,
        controlPrediction,
        {
          won: finalPayout.greaterThan(stakeAmount),
          amount: stakeAmount,
          multiplier: finalMultiplier,
          payout: finalPayout,
        },
        controlled,
        bet.id,
        originalResult as unknown as Prisma.InputJsonValue,
        finalResult as unknown as Prisma.InputJsonValue,
      );
      const jackpot =
        rowCount > 3 ? await this.addJackpotContribution(tx, gameId, stakeAmount) : undefined;

      return {
        betId: bet.id,
        grid: finalGrid,
        lines: finalLines,
        cascades: finalCascades,
        ...(finalFeatures ? { features: finalFeatures } : {}),
        ...(buyFeature
          ? {
              buyFeature: true,
              baseAmount: baseAmount.toFixed(2),
              stakeAmount: stakeAmount.toFixed(2),
            }
          : {}),
        multiplier: Number(finalMultiplier.toFixed(4)),
        amount: stakeAmount.toFixed(2),
        payout: finalPayout.toFixed(2),
        profit: profit.toFixed(2),
        newBalance: newBalance.toFixed(2),
        ...(jackpot ? { jackpot } : {}),
        nonce: seed.nonce,
        serverSeedHash: seed.serverSeedHash,
        clientSeed: seed.clientSeed,
      };
    });
  }

  private async addJackpotContribution(
    tx: Prisma.TransactionClient,
    gameId: string,
    stakeAmount: Prisma.Decimal,
  ): Promise<HotlineJackpotSnapshot> {
    const contribution = {
      grand: stakeAmount
        .mul(HOTLINE_JACKPOT_CONTRIBUTION_RATES.grand)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN),
      major: stakeAmount
        .mul(HOTLINE_JACKPOT_CONTRIBUTION_RATES.major)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN),
      minor: stakeAmount
        .mul(HOTLINE_JACKPOT_CONTRIBUTION_RATES.minor)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN),
      mini: stakeAmount
        .mul(HOTLINE_JACKPOT_CONTRIBUTION_RATES.mini)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN),
    };

    const now = new Date();
    const basePool = await this.getOrCreateJackpotPool(tx, gameId);
    const grown = growJackpotValues(basePool, now);
    const pool = await tx.hotlineJackpotPool.update({
      where: { gameId },
      data: {
        grand: grown.grand.plus(contribution.grand).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN),
        major: grown.major.plus(contribution.major).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN),
        minor: grown.minor.plus(contribution.minor).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN),
        mini: grown.mini.plus(contribution.mini).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN),
      },
    });

    return toJackpotSnapshot(pool, now);
  }

  private async getOrCreateJackpotPool(
    client: PrismaClient | Prisma.TransactionClient,
    gameId: string,
  ): Promise<HotlineJackpotRecord> {
    const existing = await client.hotlineJackpotPool.findUnique({ where: { gameId } });
    if (existing) return existing;

    const seedValues = createInitialJackpotValues();
    try {
      return await client.hotlineJackpotPool.create({
        data: {
          gameId,
          grand: seedValues.grand,
          major: seedValues.major,
          minor: seedValues.minor,
          mini: seedValues.mini,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return client.hotlineJackpotPool.findUniqueOrThrow({ where: { gameId } });
      }
      throw err;
    }
  }
}

function createInitialJackpotValues(): Omit<HotlineJackpotRecord, 'gameId' | 'updatedAt'> {
  return {
    grand: HOTLINE_JACKPOT_RESET,
    major: HOTLINE_JACKPOT_RESET,
    minor: HOTLINE_JACKPOT_RESET,
    mini: HOTLINE_JACKPOT_RESET,
  };
}

function growJackpotValues(pool: HotlineJackpotRecord, asOf: Date): HotlineJackpotValues {
  return {
    grand: growJackpotValue(pool.grand, pool.updatedAt, asOf, 'grand'),
    major: growJackpotValue(pool.major, pool.updatedAt, asOf, 'major'),
    minor: growJackpotValue(pool.minor, pool.updatedAt, asOf, 'minor'),
    mini: growJackpotValue(pool.mini, pool.updatedAt, asOf, 'mini'),
  };
}

function growJackpotValue(
  storedValue: Prisma.Decimal,
  updatedAt: Date,
  asOf: Date,
  key: HotlineJackpotKey,
): Prisma.Decimal {
  const cycleStartMs = getJackpotCycleStartMs(asOf.getTime(), key);
  const storedAtMs = updatedAt.getTime();
  const baseAtMs = storedAtMs < cycleStartMs ? cycleStartMs : storedAtMs;
  const baseValue = storedAtMs < cycleStartMs ? HOTLINE_JACKPOT_RESET : storedValue;
  const elapsedSeconds = Math.max(0, Math.floor((asOf.getTime() - baseAtMs) / 1000));

  if (elapsedSeconds <= 0) {
    return baseValue.toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  }

  return baseValue
    .plus(HOTLINE_JACKPOT_PASSIVE_GROWTH[key].mul(elapsedSeconds))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
}

function getJackpotCycleStartMs(timestampMs: number, key: HotlineJackpotKey): number {
  const intervalMs = HOTLINE_JACKPOT_RESET_INTERVAL_MS[key];
  const offsetMs = HOTLINE_JACKPOT_RESET_OFFSET_MS[key];
  const epochMs = Number.isFinite(HOTLINE_JACKPOT_EPOCH_MS)
    ? HOTLINE_JACKPOT_EPOCH_MS
    : Date.UTC(2026, 0, 1);
  const shifted = timestampMs - epochMs - offsetMs;
  if (shifted <= 0) return epochMs + offsetMs;
  return epochMs + offsetMs + Math.floor(shifted / intervalMs) * intervalMs;
}

function toJackpotSnapshot(pool: HotlineJackpotRecord, asOf: Date): HotlineJackpotSnapshot {
  const values = growJackpotValues(pool, asOf);
  return {
    gameId: pool.gameId,
    grand: values.grand.toFixed(2),
    major: values.major.toFixed(2),
    minor: values.minor.toFixed(2),
    mini: values.mini.toFixed(2),
    updatedAt: pool.updatedAt.toISOString(),
    asOf: asOf.toISOString(),
  };
}

type HotlineRound = Pick<HotlineBetResult, 'grid' | 'lines' | 'cascades'> & {
  totalMultiplier: number;
  features?: HotlineMegaFeatureResult;
};

function buildHotlineRound(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  reelCount: number,
  rowCount: number,
  buyFeature = false,
): HotlineRound {
  if (rowCount > 3) {
    const cascaded = buyFeature
      ? hotlineBuyFreeSpins(serverSeed, clientSeed, nonce, reelCount, rowCount)
      : hotlineSpinCascades(serverSeed, clientSeed, nonce, reelCount, rowCount);
    return {
      grid: cascaded.finalGrid,
      lines: cascaded.lines,
      cascades: cascaded.cascades,
      ...(cascaded.features ? { features: cascaded.features } : {}),
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
  return (
    pool.find((grid) => {
      const evaluated = hotlineEvaluate(grid);
      return (
        evaluated.totalMultiplier > 1 &&
        multiplierMatchesControlBounds(evaluated.totalMultiplier, amount, controlled)
      );
    }) ?? fullLine
  );
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

  return (
    candidates.find((grid) => {
      const evaluated = hotlineEvaluate(grid);
      return (
        evaluated.totalMultiplier > 1 &&
        multiplierMatchesControlBounds(evaluated.totalMultiplier, amount, controlled)
      );
    }) ?? candidates[2]!
  );
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
      [0, 1, 2, 3, 4],
      [5, 0, 1, 2, 3],
      [4, 5, 0, 1, 2],
      [3, 4, 5, 0, 1],
      [2, 3, 4, 5, 0],
      [1, 2, 3, 4, 5],
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

function buildControlledMegaFeature(totalMultiplier: number): HotlineMegaFeatureResult {
  return {
    scatterSymbols: [],
    scatterCount: 0,
    freeSpinsAwarded: 0,
    freeSpinsPlayed: 0,
    baseWinMultiplier: totalMultiplier,
    baseMultiplierSymbols: [],
    baseMultiplierTotal: 0,
    baseAppliedMultiplier: 1,
    baseTotalMultiplier: totalMultiplier,
    freeSpinRounds: [],
    freeSpinMultiplierBank: 0,
    freeSpinWinMultiplier: 0,
    totalMultiplier,
  };
}
