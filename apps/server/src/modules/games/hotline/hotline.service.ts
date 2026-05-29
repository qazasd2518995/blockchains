import { PrismaClient, Prisma } from '@prisma/client';
import {
  HOTLINE_MEGA_SYMBOLS,
  HOTLINE_MINI_SYMBOLS,
  HOTLINE_PAYLINES_3X3,
  HOTLINE_PAYLINES_5X3,
  HOTLINE_SYMBOLS,
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
  type HotlineCascadeStep,
  type HotlineJackpotSnapshot,
  type HotlineMegaFeatureResult,
  type HotlineWinLine,
  type HotlineWinPosition,
} from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runLockedTransaction,
} from '../_common/BaseGameService.js';
import {
  applyControls,
  finalizeControls,
  multiplierMatchesControlBounds,
} from '../_common/controls.js';
import { pickRandomBest, pickRandomItem, pickWeightedRandom } from '../_common/resultSelection.js';
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

    return runLockedTransaction(this.prisma, async (tx) => {
      await lockUserAndCheckFunds(tx, userId, stakeAmount, gameId, {
        limitAmounts: [baseAmount],
      });
      const seed = await new SeedHelper(tx).getActiveBundle(userId, gameId, input.clientSeed);
      const generatedRound = buildHotlineRound(
        seed.serverSeed,
        seed.clientSeed,
        seed.nonce,
        reelCount,
        rowCount,
        buyFeature,
      );
      const multiplierD = new Prisma.Decimal(generatedRound.totalMultiplier.toFixed(4));
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
      const controlled = await applyControls(
        tx,
        userId,
        gameId,
        controlPrediction,
        buyFeature
          ? {
              burstEligible: true,
              burstGuardOnly: true,
              burstPotentialMultiplier: accountingMultiplierD,
            }
          : undefined,
      );

      let finalGrid = generatedRound.grid;
      let finalLines = generatedRound.lines;
      let finalCascades = generatedRound.cascades;
      let finalFeatures = generatedRound.features;
      let finalMultiplier = accountingMultiplierD;
      let finalPayout = payout;
      if (controlled.controlled) {
        const controlledRound = controlled.won
          ? winningHotlineRound(gameId, stakeAmount, controlled, seed.nonce)
          : softLossHotlineRound(gameId, seed.nonce);
        finalGrid = controlledRound.grid;
        finalLines = controlledRound.lines;
        finalCascades = controlledRound.cascades;
        finalMultiplier = new Prisma.Decimal(controlledRound.totalMultiplier.toFixed(4));
        finalPayout = stakeAmount
          .mul(finalMultiplier)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
        finalFeatures =
          rowCount > 3
            ? buyFeature
              ? buildControlledMegaFeature(
                  baseAmount.greaterThan(0)
                    ? Number(
                        finalPayout
                          .div(baseAmount)
                          .toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
                          .toFixed(4),
                      )
                    : Number(finalMultiplier.toFixed(4)),
                  true,
                )
              : (controlledRound.features ??
                buildControlledMegaFeature(Number(finalMultiplier.toFixed(4))))
            : undefined;
      }

      if (buyFeature && rowCount > 3 && finalFeatures && finalFeatures.freeSpinsAwarded > 0) {
        const capped = capMegaFreeGameSettlement(
          finalFeatures,
          buyFeature,
          baseAmount,
          stakeAmount,
          seed.nonce,
        );
        finalFeatures = capped.features;
        finalPayout = capped.payout;
        finalMultiplier = capped.multiplier;
      }
      const profit = finalPayout.minus(stakeAmount);

      const originalResult = {
        grid: generatedRound.grid,
        lines: generatedRound.lines,
        cascades: generatedRound.cascades,
        ...(generatedRound.features ? { features: generatedRound.features } : {}),
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

const HOTLINE_SOFT_LOSS_SYMBOLS = [0, 1] as const;
const HOTLINE_SOFT_WIN_SYMBOLS = [2, 3, 4, 5, 6, 7] as const;
const HOTLINE_SYMBOL_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const MEGA_FREE_GAME_MAX_ACCOUNTING_MULTIPLIER = new Prisma.Decimal('2.5');
const MEGA_FREE_GAME_LOW_TARGET_MIN = 0.35;
const MEGA_FREE_GAME_LOW_TARGET_MAX = 0.98;
const MEGA_FREE_GAME_HIGH_TARGET_MIN = 1.1;
const MEGA_FREE_GAME_HIGH_TARGET_MAX = 2.5;

function capMegaFreeGameSettlement(
  features: HotlineMegaFeatureResult,
  buyFeature: boolean,
  baseAmount: Prisma.Decimal,
  stakeAmount: Prisma.Decimal,
  nonce: number,
): {
  features: HotlineMegaFeatureResult;
  payout: Prisma.Decimal;
  multiplier: Prisma.Decimal;
} {
  const targetAccountingMultiplier = chooseMegaFreeGameAccountingMultiplier(nonce);
  const targetPayout = stakeAmount
    .mul(targetAccountingMultiplier)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const maxPayout = stakeAmount
    .mul(MEGA_FREE_GAME_MAX_ACCOUNTING_MULTIPLIER)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const cappedPayout = Prisma.Decimal.min(targetPayout, maxPayout);

  const cappedMultiplier = stakeAmount.greaterThan(0)
    ? cappedPayout.div(stakeAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
    : new Prisma.Decimal(0);
  const featureDisplayMultiplier = baseAmount.greaterThan(0)
    ? cappedPayout.div(baseAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN).toNumber()
    : cappedMultiplier.toNumber();

  return {
    features: scaleMegaFeatureResult(features, featureDisplayMultiplier, buyFeature),
    payout: cappedPayout,
    multiplier: cappedMultiplier,
  };
}

function chooseMegaFreeGameAccountingMultiplier(nonce: number): number {
  const bucket = Math.abs(Math.trunc(nonce)) % 3;
  const rand = deterministicFraction(nonce, 17);
  const target =
    bucket === 2
      ? MEGA_FREE_GAME_HIGH_TARGET_MIN +
        rand * (MEGA_FREE_GAME_HIGH_TARGET_MAX - MEGA_FREE_GAME_HIGH_TARGET_MIN)
      : MEGA_FREE_GAME_LOW_TARGET_MIN +
        rand * (MEGA_FREE_GAME_LOW_TARGET_MAX - MEGA_FREE_GAME_LOW_TARGET_MIN);
  const max = MEGA_FREE_GAME_MAX_ACCOUNTING_MULTIPLIER.toNumber();
  return roundFeatureMultiplier(Math.min(target, max));
}

function deterministicFraction(seed: number, salt: number): number {
  const x = Math.sin((seed + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function scaleMegaFeatureResult(
  features: HotlineMegaFeatureResult,
  targetTotalMultiplier: number,
  buyFeature: boolean,
): HotlineMegaFeatureResult {
  const target = roundFeatureMultiplier(targetTotalMultiplier);
  const current = Math.max(0, features.totalMultiplier);
  if (current === target) {
    return features;
  }
  if (current <= 0) return buildControlledMegaFeature(target, buyFeature);

  const ratio = target / current;
  const baseTotalMultiplier = buyFeature
    ? 0
    : roundFeatureMultiplier(features.baseTotalMultiplier * ratio);
  const baseWinMultiplier = buyFeature
    ? 0
    : roundFeatureMultiplier(features.baseWinMultiplier * ratio);
  const freeSpinRounds = features.freeSpinRounds.map((round) =>
    scaleMegaFreeSpinRound(round, ratio),
  );
  const freeSpinWinMultiplier = buyFeature
    ? target
    : roundFeatureMultiplier(Math.max(0, target - baseTotalMultiplier));

  return {
    ...features,
    baseWinMultiplier,
    baseTotalMultiplier,
    freeSpinRounds,
    freeSpinWinMultiplier,
    totalMultiplier: target,
  };
}

function scaleMegaFreeSpinRound(
  round: HotlineMegaFeatureResult['freeSpinRounds'][number],
  ratio: number,
): HotlineMegaFeatureResult['freeSpinRounds'][number] {
  const cascades = round.cascades.map((step) => ({
    ...step,
    multiplier: roundFeatureMultiplier(step.multiplier * ratio),
    lines: step.lines.map((line) => ({
      ...line,
      payout: roundFeatureMultiplier(line.payout * ratio),
    })),
  }));
  return {
    ...round,
    cascades,
    lines: round.lines.map((line) => ({
      ...line,
      payout: roundFeatureMultiplier(line.payout * ratio),
    })),
    baseMultiplier: roundFeatureMultiplier(round.baseMultiplier * ratio),
    totalMultiplier: roundFeatureMultiplier(round.totalMultiplier * ratio),
  };
}

function roundFeatureMultiplier(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, value).toFixed(4));
}

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

function winningHotlineRound(
  gameId: string,
  amount: Prisma.Decimal,
  controlled: Parameters<typeof multiplierMatchesControlBounds>[2],
  variant = 0,
): HotlineRound {
  const reelCount = getHotlineReelCount(gameId);
  const rowCount = getHotlineRowCount(gameId);
  if (rowCount > 3) {
    return winningMegaHotlineRound(gameId, amount, controlled, variant);
  }

  const pool = [
    ...HOTLINE_SOFT_WIN_SYMBOLS.map((symbol, index) =>
      roundFromClassicGrid(fixedLineHotlineGrid(reelCount, [symbol], variant + index)),
    ),
    roundFromClassicGrid(fixedLineHotlineGrid(reelCount, [4, 5], variant + 11)),
    roundFromClassicGrid(fixedLineHotlineGrid(reelCount, [5, 6], variant + 23)),
    roundFromClassicGrid(fixedLineHotlineGrid(reelCount, [4, 5, 6], variant + 37)),
  ];
  const targetMultiplier = targetControlMultiplier(controlled);
  const bounded = pool.filter(
    (candidate) =>
      candidate.totalMultiplier > 1 &&
      multiplierMatchesControlBounds(candidate.totalMultiplier, amount, controlled),
  );
  const underCap = pool.filter(
    (candidate) =>
      candidate.totalMultiplier > 1 &&
      multiplierMatchesControlBounds(candidate.totalMultiplier, amount, {
        maxMultiplier: controlled.maxMultiplier,
        maxPayout: controlled.maxPayout,
      }),
  );
  return (
    pickRandomBest(bounded, (candidate) => {
      const distance = Math.abs(candidate.totalMultiplier - targetMultiplier);
      return distance * 1000 + candidate.totalMultiplier / 1_000_000;
    }) ??
    pickWeightedRandom(underCap, (candidate) =>
      controlTargetWeight(candidate.totalMultiplier, targetMultiplier),
    ) ??
    softLossHotlineRound(gameId, variant) ??
    pool[0]!
  );
}

function winningMegaHotlineRound(
  gameId: string,
  amount: Prisma.Decimal,
  controlled: Parameters<typeof multiplierMatchesControlBounds>[2],
  variant = 0,
): HotlineRound {
  const candidates = [
    ...HOTLINE_SOFT_WIN_SYMBOLS.map((symbol, index) =>
      roundFromMegaGrid(gameId, megaClusterHotlineGrid([symbol], variant + index), variant + index),
    ),
    roundFromMegaGrid(gameId, megaClusterHotlineGrid([4, 5], variant + 11), variant + 11),
    roundFromMegaGrid(gameId, megaClusterHotlineGrid([5, 6], variant + 23), variant + 23),
    roundFromMegaGrid(gameId, megaClusterHotlineGrid([4, 5, 6], variant + 37), variant + 37),
  ];

  const targetMultiplier = targetControlMultiplier(controlled);
  const bounded = candidates.filter(
    (candidate) =>
      candidate.totalMultiplier > 1 &&
      multiplierMatchesControlBounds(candidate.totalMultiplier, amount, controlled),
  );
  const underCap = candidates.filter(
    (candidate) =>
      candidate.totalMultiplier > 1 &&
      multiplierMatchesControlBounds(candidate.totalMultiplier, amount, {
        maxMultiplier: controlled.maxMultiplier,
        maxPayout: controlled.maxPayout,
      }),
  );
  return (
    pickRandomBest(bounded, (candidate) => {
      const distance = Math.abs(candidate.totalMultiplier - targetMultiplier);
      return distance * 1000 + candidate.totalMultiplier / 1_000_000;
    }) ??
    pickWeightedRandom(underCap, (candidate) =>
      controlTargetWeight(candidate.totalMultiplier, targetMultiplier),
    ) ??
    softLossHotlineRound(gameId, variant) ??
    candidates[0]!
  );
}

function controlTargetWeight(multiplier: number, targetMultiplier: number): number {
  const distance = Math.abs(multiplier - targetMultiplier);
  return 1 / (1 + distance * 3);
}

function softLossHotlineRound(gameId: string, variant = 0): HotlineRound {
  const reelCount = getHotlineReelCount(gameId);
  const rowCount = getHotlineRowCount(gameId);
  if (rowCount > 3) {
    const symbol =
      pickRandomItem(HOTLINE_SOFT_LOSS_SYMBOLS) ??
      HOTLINE_SOFT_LOSS_SYMBOLS[Math.abs(variant) % HOTLINE_SOFT_LOSS_SYMBOLS.length]!;
    return roundFromMegaGrid(gameId, megaClusterHotlineGrid([symbol], variant), variant);
  }

  const symbol =
    pickRandomItem(HOTLINE_SOFT_LOSS_SYMBOLS) ??
    HOTLINE_SOFT_LOSS_SYMBOLS[Math.abs(variant) % HOTLINE_SOFT_LOSS_SYMBOLS.length]!;
  return roundFromClassicGrid(fixedLineHotlineGrid(reelCount, [symbol], variant));
}

function targetControlMultiplier(
  controlled: Parameters<typeof multiplierMatchesControlBounds>[2],
): number {
  const min = controlled.minMultiplier?.toNumber();
  const max = controlled.maxMultiplier?.toNumber();
  if (min !== undefined && max !== undefined) return (min + max) / 2;
  return min ?? max ?? 2;
}

function roundFromClassicGrid(grid: number[][]): HotlineRound {
  const evaluated = hotlineEvaluate(grid);
  return {
    grid,
    lines: evaluated.lines,
    cascades: [],
    totalMultiplier: evaluated.totalMultiplier,
  };
}

function roundFromMegaGrid(gameId: string, initialGrid: number[][], variant = 0): HotlineRound {
  const evaluated = hotlineEvaluate(initialGrid);
  const removed = collectHotlineRoundWinPositions(initialGrid, evaluated.lines);
  const finalGrid = blankHotlineGrid(gameId, variant + 97);
  const cascades: HotlineCascadeStep[] =
    evaluated.lines.length > 0 && removed.length > 0
      ? [
          {
            index: 0,
            grid: initialGrid,
            lines: evaluated.lines,
            multiplier: evaluated.totalMultiplier,
            removed,
          },
        ]
      : [];

  return {
    grid: finalGrid,
    lines: evaluated.lines,
    cascades,
    features: buildControlledMegaFeature(evaluated.totalMultiplier),
    totalMultiplier: evaluated.totalMultiplier,
  };
}

function blankHotlineGrid(gameId: string, variant = 0): number[][] {
  const reelCount = getHotlineReelCount(gameId);
  const rowCount = getHotlineRowCount(gameId);
  if (rowCount > 3) {
    return Array.from({ length: reelCount }, (_, reel) =>
      Array.from(
        { length: rowCount },
        (_, row) => (variant + reel * rowCount + row) % HOTLINE_SYMBOL_INDEXES.length,
      ),
    );
  }

  return [
    [3, 5, 0],
    [2, 5, 3],
    [2, 3, 4],
    [0, 4, 0],
    [5, 0, 3],
  ].slice(0, reelCount);
}

function fixedLineHotlineGrid(
  reelCount: number,
  symbols: readonly number[],
  variant = 0,
): number[][] {
  const targetSymbols = symbols.slice(0, 3);
  const normalizedVariant = Math.abs(variant);
  const symbolsForGrid = reelCount === 3 ? HOTLINE_MINI_SYMBOLS : HOTLINE_SYMBOLS;
  const expectedMultiplier = targetSymbols.reduce(
    (sum, symbol) => sum + (symbolsForGrid[symbol]?.payout3 ?? 0),
    0,
  );

  for (let attempt = 0; attempt < 160; attempt += 1) {
    const grid = makeClassicNoWinGrid(reelCount, targetSymbols, normalizedVariant + attempt);
    applyFixedLineTargets(grid, targetSymbols, normalizedVariant + attempt);
    const evaluated = hotlineEvaluate(grid);
    const cleanHit =
      Math.abs(evaluated.totalMultiplier - expectedMultiplier) < 0.0001 &&
      evaluated.lines.length === targetSymbols.length &&
      evaluated.lines.every((line) => targetSymbols.includes(line.symbol));
    if (cleanHit) {
      return grid;
    }
  }

  const grid = makeClassicNoWinGrid(reelCount, targetSymbols, normalizedVariant);
  applyFixedLineTargets(grid, targetSymbols, normalizedVariant);
  return grid;
}

function makeClassicNoWinGrid(
  reelCount: number,
  blockedSymbols: readonly number[],
  variant = 0,
): number[][] {
  const blocked = new Set(blockedSymbols);
  const fillers = HOTLINE_SYMBOL_INDEXES.filter((symbol) => !blocked.has(symbol));
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const grid = Array.from({ length: reelCount }, (_, reel) =>
      Array.from(
        { length: 3 },
        (_, row) =>
          fillers[(variant + attempt * 5 + reel * 7 + row * 3 + reel * row * 2) % fillers.length]!,
      ),
    );
    if (hotlineEvaluate(grid).lines.length === 0) return grid;
  }

  return blankHotlineGrid(reelCount === 3 ? GameId.CANDY_SLOT : GameId.HOTLINE).map((col) =>
    col.map((symbol) => (blocked.has(symbol) ? fillers[symbol % fillers.length]! : symbol)),
  );
}

function applyFixedLineTargets(grid: number[][], symbols: readonly number[], variant = 0): void {
  const reelCount = grid.length;
  const paylines = reelCount === 3 ? HOTLINE_PAYLINES_3X3 : HOTLINE_PAYLINES_5X3;
  const straightPaylines = paylines.slice(0, 3);
  const directionOffset = Math.floor(variant / Math.max(1, paylines.length));
  const direction: 'ltr' | 'rtl' = directionOffset % 2 === 1 && reelCount > 3 ? 'rtl' : 'ltr';
  const runLength = Math.min(3, reelCount);
  const startReel = direction === 'rtl' ? reelCount - runLength : 0;

  symbols.forEach((symbol, index) => {
    const pool = symbols.length === 1 ? paylines : straightPaylines;
    const line = pool[(variant + index) % pool.length]!;
    for (let offset = 0; offset < runLength; offset += 1) {
      const reel = startReel + offset;
      const row = line.path[reel]!;
      grid[reel]![row] = symbol;
    }
  });
}

function megaClusterHotlineGrid(symbols: readonly number[], variant = 0): number[][] {
  const targetSymbols = symbols.slice(0, 3);
  const blocked = new Set(targetSymbols);
  const fillers = HOTLINE_MEGA_SYMBOLS.map((_symbol, symbol) => symbol).filter(
    (symbol) => !blocked.has(symbol),
  );
  const reelCount = 6;
  const rowCount = 5;
  const grid = Array.from({ length: reelCount }, (_, reel) =>
    Array.from(
      { length: rowCount },
      (_, row) => fillers[(variant + reel * rowCount + row) % fillers.length]!,
    ),
  );
  const allPositions = Array.from({ length: reelCount * rowCount }, (_, index) => ({
    reel: Math.floor(index / rowCount),
    row: index % rowCount,
  }));
  const used = new Set<string>();

  targetSymbols.forEach((symbol, symbolIndex) => {
    const positions = rankedMegaPositions(allPositions, variant + symbolIndex * 101);
    for (let i = 0; i < 8; i += 1) {
      const position = positions.find((candidate) => !used.has(positionKey(candidate)));
      if (!position) continue;
      used.add(positionKey(position));
      grid[position.reel]![position.row] = symbol;
    }
  });
  return grid;
}

function rankedMegaPositions(positions: HotlineWinPosition[], salt: number): HotlineWinPosition[] {
  return [...positions].sort((a, b) => megaPositionScore(a, salt) - megaPositionScore(b, salt));
}

function megaPositionScore(position: HotlineWinPosition, salt: number): number {
  let value = (salt + 0x9e3779b9) >>> 0;
  value ^= Math.imul(position.reel + 1, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d) >>> 0;
  value ^= Math.imul(position.row + 1, 0xc2b2ae35);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b) >>> 0;
  return value >>> 0;
}

function positionKey(position: HotlineWinPosition): string {
  return `${position.reel}:${position.row}`;
}

function collectHotlineRoundWinPositions(
  grid: number[][],
  lines: HotlineWinLine[],
): HotlineWinPosition[] {
  const keyed = new Map<string, HotlineWinPosition>();
  for (const line of lines) {
    if (line.positions && line.positions.length > 0) {
      for (const position of line.positions) keyed.set(positionKey(position), position);
      continue;
    }

    const path = line.path ?? Array.from({ length: grid.length }, () => line.row);
    const startReel = Math.max(0, Math.min(grid.length - 1, line.startReel ?? 0));
    const endReel = Math.min(grid.length - 1, startReel + line.count - 1);
    for (let reel = startReel; reel <= endReel; reel += 1) {
      const row = path[reel] ?? line.row;
      if (grid[reel]?.[row] === line.symbol) {
        keyed.set(`${reel}:${row}`, { reel, row });
      }
    }
  }
  return [...keyed.values()].sort((a, b) => a.reel - b.reel || a.row - b.row);
}

function buildControlledMegaFeature(
  totalMultiplier: number,
  buyFeature = false,
): HotlineMegaFeatureResult {
  if (buyFeature) {
    const blankGrid = blankHotlineGrid(GameId.THUNDER_SLOT);
    const freeSpinRounds = Array.from({ length: 15 }, (_, index) => ({
      index,
      initialGrid: blankGrid,
      finalGrid: blankGrid,
      cascades: [],
      lines: [],
      baseMultiplier: 0,
      scatterSymbols: [],
      multiplierSymbols: [],
      multiplierTotal: 0,
      appliedMultiplier: 1,
      totalMultiplier: 0,
      extraFreeSpinsAwarded: 0,
    }));
    return {
      scatterSymbols: [
        { reel: 0, row: 0, type: 'scatter' },
        { reel: 1, row: 1, type: 'scatter' },
        { reel: 2, row: 2, type: 'scatter' },
        { reel: 3, row: 3, type: 'scatter' },
      ],
      scatterCount: 4,
      freeSpinsAwarded: 15,
      freeSpinsPlayed: freeSpinRounds.length,
      baseWinMultiplier: 0,
      baseMultiplierSymbols: [],
      baseMultiplierTotal: 0,
      baseAppliedMultiplier: 1,
      baseTotalMultiplier: 0,
      freeSpinRounds,
      freeSpinMultiplierBank: 0,
      freeSpinWinMultiplier: totalMultiplier,
      totalMultiplier,
    };
  }

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

export const __hotlineServiceTestHooks = {
  capMegaFreeGameSettlement,
  chooseMegaFreeGameAccountingMultiplier,
  fixedLineHotlineGrid,
  softLossHotlineRound,
  winningHotlineRound,
  megaClusterHotlineGrid,
};
