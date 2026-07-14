import { PrismaClient, Prisma } from '@prisma/client';
import {
  HOTLINE_MEGA_BUY_FEATURE_COST_MULTIPLIER,
  HOTLINE_MEGA_SYMBOLS,
  HOTLINE_MEGA_MAX_TOTAL_MULTIPLIER,
  HOTLINE_MINI_SYMBOLS,
  HOTLINE_PAYLINES_3X3,
  HOTLINE_PAYLINES_5X3,
  HOTLINE_ROWS,
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
  type HotlineSpecialSymbol,
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
  type ControlOutcome,
} from '../_common/controls.js';
import {
  buildEntertainmentShapeMeta,
  getActiveEntertainmentEnvelope,
  shapeControlOutcomeForEntertainment,
  type EntertainmentShapeMeta,
} from '../_common/entertainmentShaper.js';
import { pickRandomBest, pickRandomItem, pickWeightedRandom } from '../_common/resultSelection.js';
import type { HotlineBetInput } from './hotline.schema.js';

const HOTLINE_JACKPOT_CONTRIBUTION_RATES = {
  grand: new Prisma.Decimal('0.006'),
  major: new Prisma.Decimal('0.0035'),
  minor: new Prisma.Decimal('0.0018'),
  mini: new Prisma.Decimal('0.0012'),
} as const;
type HotlineJackpotKey = keyof typeof HOTLINE_JACKPOT_CONTRIBUTION_RATES;
type HotlineControlBounds = Pick<
  ControlOutcome,
  'minMultiplier' | 'maxMultiplier' | 'maxPayout' | 'flipReason'
>;

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
    const stakeAmount = buyFeature ? megaBuyFeatureStakeAmount(baseAmount) : baseAmount;

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
              burstPotentialMultiplier: MEGA_FREE_GAME_CONTROL_MAX_ACCOUNTING_MULTIPLIER,
            }
          : undefined,
      );

      let finalGrid = generatedRound.grid;
      let finalLines = generatedRound.lines;
      let finalCascades = generatedRound.cascades;
      let finalFeatures = generatedRound.features;
      let finalMultiplier = accountingMultiplierD;
      let finalPayout = payout;
      let effectiveControl = controlled;
      let entertainmentMeta: EntertainmentShapeMeta | undefined;
      if (controlled.controlled) {
        const entertainmentShape = shapeControlOutcomeForEntertainment(
          controlled,
          stakeAmount,
          'slot',
          seed.nonce,
        );
        const visualControl = entertainmentShape?.outcome ?? controlled;
        const controlledRound = visualControl.won
          ? strictWinningHotlineRound(gameId, stakeAmount, visualControl, seed.nonce)
          : lossHotlineRound(gameId, stakeAmount, seed.nonce, visualControl);
        if (controlledRound) {
          finalGrid = controlledRound.grid;
          finalLines = controlledRound.lines;
          finalCascades = controlledRound.cascades;
          finalMultiplier = new Prisma.Decimal(controlledRound.totalMultiplier.toFixed(4));
          finalPayout = stakeAmount
            .mul(finalMultiplier)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
          if (entertainmentShape) {
            entertainmentMeta = buildEntertainmentShapeMeta(
              entertainmentShape.envelope,
              controlled.multiplier,
              finalMultiplier,
              finalPayout,
            );
          }
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
                    seed.nonce,
                  )
                : (controlledRound.features ??
                  buildControlledMegaFeature(
                    Number(finalMultiplier.toFixed(4)),
                    false,
                    seed.nonce,
                    controlledRound,
                  ))
              : undefined;
        } else {
          effectiveControl = {
            ...controlled,
            controlled: false,
            controlId: undefined,
            flipReason: undefined,
          };
        }
      }

      if (
        finalFeatures &&
        shouldApplyMegaFreeGameSettlementCap(rowCount, finalFeatures, buyFeature, effectiveControl)
      ) {
        const allowFreeGameAboveOne = canMegaFreeGameExceedOne(effectiveControl);
        const preserveControlledTarget =
          shouldPreserveControlledMegaFreeGameTarget(effectiveControl);
        const capped = capMegaFreeGameSettlement(
          finalFeatures,
          buyFeature,
          baseAmount,
          stakeAmount,
          seed.nonce,
          effectiveControl.maxPayout,
          allowFreeGameAboveOne,
          preserveControlledTarget,
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
        controlled: effectiveControl.controlled,
        flipReason: effectiveControl.flipReason ?? null,
        ...(entertainmentMeta ? { entertainment: entertainmentMeta } : {}),
        raw: effectiveControl.controlled ? originalResult : null,
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
        effectiveControl,
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
const HOTLINE_SOFT_WIN_SYMBOLS = [1, 2, 3, 4, 5, 6, 7] as const;
const HOTLINE_SYMBOL_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const MEGA_BUY_FEATURE_MAX_STAKE = new Prisma.Decimal(30000);
const MEGA_FREE_GAME_NORMAL_MAX_ACCOUNTING_MULTIPLIER = new Prisma.Decimal(1);
const MEGA_FREE_GAME_CONTROL_MAX_ACCOUNTING_MULTIPLIER = new Prisma.Decimal(2);
const MEGA_FREE_GAME_LOW_TARGET_MIN = 0.35;
const MEGA_FREE_GAME_LOW_TARGET_MAX = 0.98;
const MEGA_FREE_GAME_HIGH_TARGET_MIN = 1.1;
const MEGA_FREE_GAME_HIGH_TARGET_MAX = 2;

function megaBuyFeatureStakeAmount(baseAmount: Prisma.Decimal): Prisma.Decimal {
  return Prisma.Decimal.min(
    baseAmount.mul(HOTLINE_MEGA_BUY_FEATURE_COST_MULTIPLIER),
    MEGA_BUY_FEATURE_MAX_STAKE,
  ).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
}

function capMegaFreeGameSettlement(
  features: HotlineMegaFeatureResult,
  buyFeature: boolean,
  baseAmount: Prisma.Decimal,
  stakeAmount: Prisma.Decimal,
  nonce: number,
  controlMaxPayout?: Prisma.Decimal,
  allowAboveOne = false,
  preserveControlledTarget = false,
): {
  features: HotlineMegaFeatureResult;
  payout: Prisma.Decimal;
  multiplier: Prisma.Decimal;
} {
  const maxAccountingMultiplier =
    preserveControlledTarget && controlMaxPayout && stakeAmount.greaterThan(0)
      ? controlMaxPayout.div(stakeAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
      : allowAboveOne
        ? MEGA_FREE_GAME_CONTROL_MAX_ACCOUNTING_MULTIPLIER
        : MEGA_FREE_GAME_NORMAL_MAX_ACCOUNTING_MULTIPLIER;
  const targetPayout = preserveControlledTarget
    ? baseAmount.mul(features.totalMultiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN)
    : stakeAmount
        .mul(chooseMegaFreeGameAccountingMultiplier(nonce, maxAccountingMultiplier))
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const maxPayout = stakeAmount
    .mul(maxAccountingMultiplier)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const hardMaxPayout = controlMaxPayout
    ? Prisma.Decimal.min(maxPayout, controlMaxPayout)
    : maxPayout;
  const cappedPayout = Prisma.Decimal.min(targetPayout, hardMaxPayout);

  const cappedMultiplier = stakeAmount.greaterThan(0)
    ? cappedPayout.div(stakeAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
    : new Prisma.Decimal(0);
  let featureDisplayMultiplier = baseAmount.greaterThan(0)
    ? cappedPayout.div(baseAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN).toNumber()
    : cappedMultiplier.toNumber();
  let cappedFeatures = buildControlledMegaFeature(featureDisplayMultiplier, buyFeature, nonce);
  let featurePayout = baseAmount
    .mul(cappedFeatures.totalMultiplier)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  for (
    let attempts = 0;
    featurePayout.greaterThan(hardMaxPayout) && featureDisplayMultiplier > 0 && attempts < 100;
    attempts += 1
  ) {
    featureDisplayMultiplier = roundFeatureMultiplier(featureDisplayMultiplier - 0.0001);
    cappedFeatures = buildControlledMegaFeature(featureDisplayMultiplier, buyFeature, nonce);
    featurePayout = baseAmount
      .mul(cappedFeatures.totalMultiplier)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  }
  const featureMultiplier = stakeAmount.greaterThan(0)
    ? featurePayout.div(stakeAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
    : new Prisma.Decimal(0);

  return {
    features: cappedFeatures,
    payout: featurePayout,
    multiplier: featureMultiplier,
  };
}

function shouldApplyMegaFreeGameSettlementCap(
  rowCount: number,
  features: HotlineMegaFeatureResult | undefined,
  buyFeature: boolean,
  control: Pick<ControlOutcome, 'controlled'>,
): boolean {
  return Boolean(
    rowCount > 3 && features && features.freeSpinsAwarded > 0 && (buyFeature || control.controlled),
  );
}

function chooseMegaFreeGameAccountingMultiplier(
  nonce: number,
  maxAccountingMultiplier = MEGA_FREE_GAME_NORMAL_MAX_ACCOUNTING_MULTIPLIER,
): number {
  const bucket = Math.abs(Math.trunc(nonce)) % 3;
  const rand = deterministicFraction(nonce, 17);
  const target =
    bucket === 2 && maxAccountingMultiplier.greaterThan(1)
      ? MEGA_FREE_GAME_HIGH_TARGET_MIN +
        rand * (MEGA_FREE_GAME_HIGH_TARGET_MAX - MEGA_FREE_GAME_HIGH_TARGET_MIN)
      : MEGA_FREE_GAME_LOW_TARGET_MIN +
        rand * (MEGA_FREE_GAME_LOW_TARGET_MAX - MEGA_FREE_GAME_LOW_TARGET_MIN);
  const max = maxAccountingMultiplier.toNumber();
  return roundFeatureMultiplier(Math.min(target, max));
}

function canMegaFreeGameExceedOne(
  control: Pick<ControlOutcome, 'controlled' | 'won' | 'flipReason'>,
): boolean {
  if (!control.controlled || !control.won) return false;
  return (
    control.flipReason === 'win_control' ||
    control.flipReason === 'loss_control_release' ||
    control.flipReason === 'deposit_control' ||
    control.flipReason === 'deposit_lifecycle_path_guard' ||
    control.flipReason === 'online_reward_next_win' ||
    control.flipReason === 'manual_detection' ||
    control.flipReason === 'manual_detection_release' ||
    control.flipReason === 'auto_balance_revive' ||
    control.flipReason === 'auto_balance_path_guard' ||
    control.flipReason === 'burst_win' ||
    control.flipReason === 'burst_small_win' ||
    control.flipReason === 'burst_risk_cap'
  );
}

function shouldPreserveControlledMegaFreeGameTarget(
  control: Pick<ControlOutcome, 'controlled' | 'won' | 'flipReason'>,
): boolean {
  if (!control.controlled || !control.won) return false;
  return (
    control.flipReason === 'auto_balance_revive' ||
    control.flipReason === 'auto_balance_path_guard' ||
    control.flipReason === 'burst_win' ||
    control.flipReason === 'burst_small_win' ||
    control.flipReason === 'burst_risk_cap'
  );
}

function deterministicFraction(seed: number, salt: number): number {
  const x = Math.sin((seed + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
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
  controlled: HotlineControlBounds,
  variant = 0,
): HotlineRound {
  return (
    strictWinningHotlineRound(gameId, amount, controlled, variant) ??
    softLossHotlineRound(gameId, variant)
  );
}

function strictWinningHotlineRound(
  gameId: string,
  amount: Prisma.Decimal,
  controlled: HotlineControlBounds,
  variant = 0,
): HotlineRound | null {
  const reelCount = getHotlineReelCount(gameId);
  const rowCount = getHotlineRowCount(gameId);
  if (rowCount > 3) {
    return winningMegaHotlineRound(gameId, amount, controlled, variant);
  }

  const pool = classicWinCandidateRounds(gameId, variant);
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
  if (controlled.flipReason === 'burst_win') {
    return pickHighestMultiplier(bounded) ?? pickHighestMultiplier(underCap) ?? null;
  }
  return (
    pickRandomBest(bounded, (candidate) => {
      const distance = Math.abs(candidate.totalMultiplier - targetMultiplier);
      return distance * 1000 + candidate.totalMultiplier / 1_000_000;
    }) ??
    pickWeightedRandom(underCap, (candidate) =>
      controlTargetWeight(candidate.totalMultiplier, targetMultiplier),
    ) ??
    null
  );
}

function winningMegaHotlineRound(
  gameId: string,
  amount: Prisma.Decimal,
  controlled: HotlineControlBounds,
  variant = 0,
): HotlineRound | null {
  const candidates = megaWinCandidateRounds(gameId, variant);

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
  if (controlled.flipReason === 'burst_win') {
    const picked = pickHighestMultiplier(bounded) ?? pickHighestMultiplier(underCap);
    if (picked) return shapeMegaBurstRound(gameId, picked, amount, controlled, variant);
    return null;
  }
  return (
    pickRandomBest(bounded, (candidate) => {
      const distance = Math.abs(candidate.totalMultiplier - targetMultiplier);
      return distance * 1000 + candidate.totalMultiplier / 1_000_000;
    }) ??
    pickWeightedRandom(underCap, (candidate) =>
      controlTargetWeight(candidate.totalMultiplier, targetMultiplier),
    ) ??
    null
  );
}

function classicWinCandidateRounds(gameId: string, variant = 0): HotlineRound[] {
  const reelCount = getHotlineReelCount(gameId);
  const runLengths = reelCount >= 5 ? ([3, 4, 5] as const) : ([3] as const);
  const rounds: HotlineRound[] = [];

  for (const runLength of runLengths) {
    HOTLINE_SOFT_WIN_SYMBOLS.forEach((symbol, index) => {
      rounds.push(
        roundFromClassicGrid(fixedLineHotlineGrid(reelCount, [symbol], variant + index, runLength)),
      );
    });
  }

  const comboSets: readonly (readonly number[])[] = [
    [4, 5],
    [5, 6],
    [6, 7],
    [4, 5, 6],
    [5, 6, 7],
  ];
  comboSets.forEach((symbols, index) => {
    const runLength = reelCount >= 5 ? 5 : 3;
    rounds.push(
      roundFromClassicGrid(
        fixedLineHotlineGrid(reelCount, symbols, variant + 100 + index * 17, runLength),
      ),
    );
  });

  HOTLINE_SOFT_WIN_SYMBOLS.forEach((symbol, index) => {
    rounds.push(roundFromClassicGrid(fullScreenClassicGrid(gameId, symbol, variant + 301 + index)));
  });

  return dedupeHotlineRounds(rounds);
}

function megaWinCandidateRounds(gameId: string, variant = 0): HotlineRound[] {
  const rounds: HotlineRound[] = [];
  const symbolSets: readonly (readonly number[])[] = [
    ...HOTLINE_SOFT_WIN_SYMBOLS.map((symbol) => [symbol] as const),
    [4, 5],
    [5, 6],
    [6, 7],
    [4, 5, 6],
    [5, 6, 7],
  ];

  for (const clusterCount of [8, 10, 12] as const) {
    symbolSets.forEach((symbols, index) => {
      rounds.push(
        roundFromMegaGrid(
          gameId,
          megaClusterHotlineGrid(symbols, variant + clusterCount * 100 + index * 13, clusterCount),
          variant + clusterCount * 100 + index * 13,
        ),
      );
    });
  }

  HOTLINE_SOFT_WIN_SYMBOLS.forEach((symbol, index) => {
    rounds.push(roundFromMegaGrid(gameId, fullScreenMegaGrid(symbol), variant + 701 + index));
  });

  return dedupeHotlineRounds(rounds);
}

function pickHighestMultiplier(rounds: HotlineRound[]): HotlineRound | undefined {
  return pickRandomBest(rounds, (candidate) => -candidate.totalMultiplier);
}

function shapeMegaBurstRound(
  gameId: string,
  round: HotlineRound,
  amount: Prisma.Decimal,
  controlled: HotlineControlBounds,
  variant = 0,
): HotlineRound {
  const targetMultiplier = Math.max(
    round.totalMultiplier,
    Math.min(
      targetControlMultiplier(controlled),
      maxAllowedMegaBurstMultiplier(amount, controlled),
    ),
  );
  const shapedMultiplier = roundFeatureMultiplier(targetMultiplier);
  const features = buildTriggeredControlledMegaFeature(shapedMultiplier, variant);
  return {
    grid: blankHotlineGrid(gameId, variant + 404),
    lines: [],
    cascades: [],
    features,
    totalMultiplier: features.totalMultiplier,
  };
}

function maxAllowedMegaBurstMultiplier(
  amount: Prisma.Decimal,
  controlled: HotlineControlBounds,
): number {
  const values = [new Prisma.Decimal(HOTLINE_MEGA_MAX_TOTAL_MULTIPLIER)];
  if (controlled.maxMultiplier) values.push(controlled.maxMultiplier);
  if (controlled.maxPayout && amount.greaterThan(0)) values.push(controlled.maxPayout.div(amount));
  return minPrismaDecimal(values).toNumber();
}

function minPrismaDecimal(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((min, value) => (value.lessThan(min) ? value : min));
}

function dedupeHotlineRounds(rounds: HotlineRound[]): HotlineRound[] {
  const seen = new Set<string>();
  return rounds.filter((round) => {
    const key = `${round.totalMultiplier.toFixed(4)}:${JSON.stringify(round.grid)}:${JSON.stringify(round.cascades ?? [])}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function lossHotlineRound(
  gameId: string,
  stakeAmount: Prisma.Decimal,
  variant = 0,
  controlled?: Pick<ControlOutcome, 'flipReason' | 'multiplier' | 'maxMultiplier' | 'maxPayout'>,
): HotlineRound {
  const entertainment = controlled
    ? entertainmentLossHotlineRound(gameId, stakeAmount, controlled, variant)
    : null;
  if (entertainment) return entertainment;

  const softRound = softLossHotlineRound(gameId, variant);
  const softPayout = stakeAmount.mul(softRound.totalMultiplier).toDecimalPlaces(2);
  if (softPayout.lessThan(stakeAmount)) return softRound;
  return hardLossHotlineRound(gameId, variant);
}

function entertainmentLossHotlineRound(
  gameId: string,
  stakeAmount: Prisma.Decimal,
  controlled: Pick<ControlOutcome, 'flipReason' | 'multiplier' | 'maxMultiplier' | 'maxPayout'>,
  variant = 0,
): HotlineRound | null {
  const envelope = getActiveEntertainmentEnvelope(
    {
      controlled: true,
      won: false,
      flipReason: controlled.flipReason,
      maxMultiplier: controlled.maxMultiplier,
      maxPayout: controlled.maxPayout,
    },
    stakeAmount,
    'slot',
  );
  if (!envelope || envelope.desired !== 'LOSS') return null;

  const pool = [
    ...classicSoftLossCandidateRounds(gameId, variant),
    ...Array.from({ length: 16 }, (_, index) => softLossHotlineRound(gameId, variant + index * 19)),
    ...(getHotlineRowCount(gameId) > 3
      ? megaWinCandidateRounds(gameId, variant)
      : classicWinCandidateRounds(gameId, variant)),
  ];
  const targetMultiplier = controlled.multiplier.toNumber();
  const candidates = pool.filter((round) => {
    if (round.totalMultiplier <= 0) return false;
    const multiplier = new Prisma.Decimal(round.totalMultiplier.toFixed(4));
    if (multiplier.greaterThanOrEqualTo(1)) return false;
    if (multiplier.greaterThan(envelope.hardMultiplierMax)) return false;
    return stakeAmount.mul(multiplier).lessThanOrEqualTo(envelope.maxPayout);
  });
  return (
    pickRandomBest(candidates, (round) => Math.abs(round.totalMultiplier - targetMultiplier)) ??
    null
  );
}

function classicSoftLossCandidateRounds(gameId: string, variant = 0): HotlineRound[] {
  if (getHotlineRowCount(gameId) > 3) return [];
  const reelCount = getHotlineReelCount(gameId);
  return HOTLINE_SOFT_LOSS_SYMBOLS.map((symbol, index) =>
    roundFromClassicGrid(singleSoftLineClassicGrid(reelCount, symbol, variant + index * 23)),
  );
}

function singleSoftLineClassicGrid(reelCount: number, symbol: number, variant = 0): number[][] {
  const paylines = reelCount === 3 ? HOTLINE_PAYLINES_3X3 : HOTLINE_PAYLINES_5X3;
  const fillers: number[] = HOTLINE_SYMBOL_INDEXES.filter((value) => value !== symbol);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const line = paylines[Math.abs(variant + attempt) % Math.min(3, paylines.length)]!;
    const grid: number[][] = Array.from({ length: reelCount }, (_, reel) =>
      Array.from(
        { length: HOTLINE_ROWS },
        (_, row) => fillers[(variant + attempt * 11 + reel * 5 + row * 3) % fillers.length]!,
      ),
    );
    for (let reel = 0; reel < Math.min(3, reelCount); reel += 1) {
      const row = line.path[reel]!;
      grid[reel]![row] = symbol;
    }
    const evaluated = hotlineEvaluate(grid);
    if (evaluated.totalMultiplier > 0 && evaluated.totalMultiplier < 1) return grid;
  }

  const grid: number[][] = Array.from({ length: reelCount }, (_, reel) =>
    Array.from({ length: HOTLINE_ROWS }, (_, row) => fillers[(reel * 3 + row) % fillers.length]!),
  );
  for (let reel = 0; reel < Math.min(3, reelCount); reel += 1) {
    grid[reel]![0] = symbol;
  }
  return grid;
}

function hardLossHotlineRound(gameId: string, variant = 0): HotlineRound {
  const grid = blankHotlineGrid(gameId, variant);
  return getHotlineRowCount(gameId) > 3
    ? roundFromMegaGrid(gameId, grid, variant)
    : roundFromClassicGrid(grid);
}

function targetControlMultiplier(controlled: HotlineControlBounds): number {
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

function roundFromMegaGrid(
  gameId: string,
  initialGrid: number[][],
  variant = 0,
  includeFeatures = true,
): HotlineRound {
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
    ...(includeFeatures
      ? { features: buildControlledMegaBaseFeature(evaluated.totalMultiplier, variant) }
      : {}),
    totalMultiplier: evaluated.totalMultiplier,
  };
}

function blankHotlineGrid(gameId: string, variant = 0): number[][] {
  const reelCount = getHotlineReelCount(gameId);
  const rowCount = getHotlineRowCount(gameId);
  if (rowCount > 3) {
    return noWinMegaGrid(variant, reelCount, rowCount);
  }

  return [
    [3, 5, 0],
    [2, 5, 3],
    [2, 3, 4],
    [0, 4, 0],
    [5, 0, 3],
  ].slice(0, reelCount);
}

function noWinMegaGrid(variant: number, reelCount = 6, rowCount = 5): number[][] {
  const grid = Array.from({ length: reelCount }, () => Array.from({ length: rowCount }, () => 0));
  const positions = rankedMegaPositions(
    Array.from({ length: reelCount * rowCount }, (_, index) => ({
      reel: Math.floor(index / rowCount),
      row: index % rowCount,
    })),
    variant + 1201,
  );
  const symbols = shuffledMegaSymbols(variant + 1709);

  positions.forEach((position, index) => {
    grid[position.reel]![position.row] = symbols[index % symbols.length]!;
  });
  return grid;
}

function shuffledMegaSymbols(variant: number): number[] {
  return [...HOTLINE_SYMBOL_INDEXES].sort(
    (a, b) =>
      deterministicFraction(variant + a * 31, 1301) - deterministicFraction(variant + b * 31, 1301),
  );
}

function fixedLineHotlineGrid(
  reelCount: number,
  symbols: readonly number[],
  variant = 0,
  runLengthOverride?: number,
): number[][] {
  const targetSymbols = symbols.slice(0, 3);
  const normalizedVariant = Math.abs(variant);
  const symbolsForGrid = reelCount === 3 ? HOTLINE_MINI_SYMBOLS : HOTLINE_SYMBOLS;
  const runLength = Math.max(3, Math.min(runLengthOverride ?? 3, reelCount));
  const expectedMultiplier = targetSymbols.reduce((sum, symbol) => {
    const meta = symbolsForGrid[symbol];
    if (!meta) return sum;
    return sum + (runLength >= 5 ? meta.payout5 : runLength === 4 ? meta.payout4 : meta.payout3);
  }, 0);

  for (let attempt = 0; attempt < 160; attempt += 1) {
    const grid = makeClassicNoWinGrid(reelCount, targetSymbols, normalizedVariant + attempt);
    applyFixedLineTargets(grid, targetSymbols, normalizedVariant + attempt, runLength);
    const evaluated = hotlineEvaluate(grid);
    const cleanHit =
      Math.abs(evaluated.totalMultiplier - expectedMultiplier) < 0.0001 &&
      evaluated.lines.length === targetSymbols.length &&
      evaluated.lines.every(
        (line) => targetSymbols.includes(line.symbol) && line.count === runLength,
      );
    if (cleanHit) {
      return grid;
    }
  }

  const grid = makeClassicNoWinGrid(reelCount, targetSymbols, normalizedVariant);
  applyFixedLineTargets(grid, targetSymbols, normalizedVariant, runLength);
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

function applyFixedLineTargets(
  grid: number[][],
  symbols: readonly number[],
  variant = 0,
  runLengthOverride?: number,
): void {
  const reelCount = grid.length;
  const paylines = reelCount === 3 ? HOTLINE_PAYLINES_3X3 : HOTLINE_PAYLINES_5X3;
  const straightPaylines = paylines.slice(0, 3);
  const directionOffset = Math.floor(variant / Math.max(1, paylines.length));
  const direction: 'ltr' | 'rtl' = directionOffset % 2 === 1 && reelCount > 3 ? 'rtl' : 'ltr';
  const runLength = Math.max(3, Math.min(runLengthOverride ?? 3, reelCount));
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

function fullScreenClassicGrid(gameId: string, symbol: number, variant = 0): number[][] {
  const reelCount = getHotlineReelCount(gameId);
  const rowCount = getHotlineRowCount(gameId);
  if (rowCount > 3) return fullScreenMegaGrid(symbol);
  return Array.from({ length: reelCount }, () => Array.from({ length: rowCount }, () => symbol));
}

function fullScreenMegaGrid(symbol: number): number[][] {
  return Array.from({ length: 6 }, () => Array.from({ length: 5 }, () => symbol));
}

function megaClusterHotlineGrid(
  symbols: readonly number[],
  variant = 0,
  countPerSymbol = 8,
): number[][] {
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
    for (let i = 0; i < countPerSymbol; i += 1) {
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
  variant = 0,
  baseRound?: HotlineRound,
): HotlineMegaFeatureResult {
  const target = roundFeatureMultiplier(totalMultiplier);
  const scatterSymbols = buildControlledScatterSymbols(variant);

  if (buyFeature) {
    const freeSpinData = buildControlledMegaFreeSpins(target, variant + 1700);
    return {
      scatterSymbols,
      scatterCount: scatterSymbols.length,
      freeSpinsAwarded: freeSpinData.freeSpinsAwarded,
      freeSpinsPlayed: freeSpinData.freeSpinRounds.length,
      baseWinMultiplier: 0,
      baseMultiplierSymbols: [],
      baseMultiplierTotal: 0,
      baseAppliedMultiplier: 1,
      baseTotalMultiplier: 0,
      freeSpinRounds: freeSpinData.freeSpinRounds,
      freeSpinMultiplierBank: freeSpinData.freeSpinMultiplierBank,
      freeSpinWinMultiplier: freeSpinData.freeSpinWinMultiplier,
      totalMultiplier: freeSpinData.freeSpinWinMultiplier,
    };
  }

  const baseWinMultiplier = roundFeatureMultiplier(
    Math.max(0, baseRound?.totalMultiplier ?? Math.min(target, 1.2)),
  );
  const baseShare = 0.18 + deterministicFraction(variant, 41) * 0.24;
  const preferredBaseTotal = roundFeatureMultiplier(Math.min(target, target * baseShare));
  const baseTotalMultiplier = roundFeatureMultiplier(
    Math.min(target, Math.max(baseWinMultiplier, preferredBaseTotal)),
  );
  const baseAppliedMultiplier =
    baseWinMultiplier > 0
      ? roundFeatureMultiplier(Math.max(1, baseTotalMultiplier / baseWinMultiplier))
      : 1;
  const baseMultiplierTotal = baseAppliedMultiplier > 1 ? baseAppliedMultiplier : 0;
  const freeSpinWinTarget = roundFeatureMultiplier(Math.max(0, target - baseTotalMultiplier));
  const freeSpinData =
    freeSpinWinTarget > 0.0001
      ? buildControlledMegaFreeSpins(freeSpinWinTarget, variant + 3100)
      : {
          freeSpinsAwarded: 0,
          freeSpinRounds: [],
          freeSpinMultiplierBank: 0,
          freeSpinWinMultiplier: 0,
        };

  return {
    scatterSymbols: freeSpinData.freeSpinsAwarded > 0 ? scatterSymbols : [],
    scatterCount: freeSpinData.freeSpinsAwarded > 0 ? scatterSymbols.length : 0,
    freeSpinsAwarded: freeSpinData.freeSpinsAwarded,
    freeSpinsPlayed: freeSpinData.freeSpinRounds.length,
    baseWinMultiplier,
    baseMultiplierSymbols:
      baseMultiplierTotal > 0 ? buildControlledMultiplierSymbols(baseMultiplierTotal, variant) : [],
    baseMultiplierTotal,
    baseAppliedMultiplier,
    baseTotalMultiplier,
    freeSpinRounds: freeSpinData.freeSpinRounds,
    freeSpinMultiplierBank: freeSpinData.freeSpinMultiplierBank,
    freeSpinWinMultiplier: freeSpinData.freeSpinWinMultiplier,
    totalMultiplier: roundFeatureMultiplier(
      baseTotalMultiplier + freeSpinData.freeSpinWinMultiplier,
    ),
  };
}

function buildControlledMegaBaseFeature(
  totalMultiplier: number,
  variant = 0,
  baseRound?: HotlineRound,
): HotlineMegaFeatureResult {
  const target = roundFeatureMultiplier(totalMultiplier);
  const baseWinMultiplier = roundFeatureMultiplier(
    Math.max(0, baseRound?.totalMultiplier ?? target),
  );
  const baseAppliedMultiplier =
    baseWinMultiplier > 0 ? roundFeatureMultiplier(Math.max(1, target / baseWinMultiplier)) : 1;
  const baseMultiplierTotal = baseAppliedMultiplier > 1 ? baseAppliedMultiplier : 0;

  return {
    scatterSymbols: [],
    scatterCount: 0,
    freeSpinsAwarded: 0,
    freeSpinsPlayed: 0,
    baseWinMultiplier,
    baseMultiplierSymbols:
      baseMultiplierTotal > 0 ? buildControlledMultiplierSymbols(baseMultiplierTotal, variant) : [],
    baseMultiplierTotal,
    baseAppliedMultiplier,
    baseTotalMultiplier: target,
    freeSpinRounds: [],
    freeSpinMultiplierBank: 0,
    freeSpinWinMultiplier: 0,
    totalMultiplier: target,
  };
}

function buildTriggeredControlledMegaFeature(
  totalMultiplier: number,
  variant = 0,
): HotlineMegaFeatureResult {
  const target = roundFeatureMultiplier(totalMultiplier);
  const freeSpinData = buildControlledMegaFreeSpins(target, variant + 3100);
  const scatterSymbols = buildControlledScatterSymbols(variant);
  return {
    scatterSymbols,
    scatterCount: scatterSymbols.length,
    freeSpinsAwarded: freeSpinData.freeSpinsAwarded,
    freeSpinsPlayed: freeSpinData.freeSpinRounds.length,
    baseWinMultiplier: 0,
    baseMultiplierSymbols: [],
    baseMultiplierTotal: 0,
    baseAppliedMultiplier: 1,
    baseTotalMultiplier: 0,
    freeSpinRounds: freeSpinData.freeSpinRounds,
    freeSpinMultiplierBank: freeSpinData.freeSpinMultiplierBank,
    freeSpinWinMultiplier: freeSpinData.freeSpinWinMultiplier,
    totalMultiplier: freeSpinData.freeSpinWinMultiplier,
  };
}

function buildControlledMegaFreeSpins(
  totalMultiplier: number,
  variant = 0,
): {
  freeSpinsAwarded: number;
  freeSpinRounds: HotlineMegaFeatureResult['freeSpinRounds'];
  freeSpinMultiplierBank: number;
  freeSpinWinMultiplier: number;
} {
  const freeSpinsAwarded = 15;
  const target = roundFeatureMultiplier(totalMultiplier);
  if (target <= 0) {
    return {
      freeSpinsAwarded,
      freeSpinRounds: Array.from({ length: freeSpinsAwarded }, (_, index) =>
        blankControlledFreeSpinRound(
          index,
          blankHotlineGrid(GameId.THUNDER_SLOT, variant + 900 + index * 53),
        ),
      ),
      freeSpinMultiplierBank: 0,
      freeSpinWinMultiplier: 0,
    };
  }

  const minBaseWin = HOTLINE_MEGA_SYMBOLS[0]?.payout3 ?? 0.345;
  const maxWinningRounds = Math.max(1, Math.floor(target / minBaseWin));
  const preferredWinningRounds =
    target < 1 ? 1 : target < 5 ? 2 : Math.min(9, Math.max(4, 5 + (Math.abs(variant) % 5)));
  const winningRoundCount = Math.max(1, Math.min(preferredWinningRounds, maxWinningRounds));
  const winningIndexes = pickControlledFreeSpinWinIndexes(
    freeSpinsAwarded,
    winningRoundCount,
    variant,
  );
  const portions = distributeIncreasingControlledMultiplier(target, winningRoundCount, variant);
  const freeSpinRounds: HotlineMegaFeatureResult['freeSpinRounds'] = [];
  let portionIndex = 0;
  let multiplierBank = 0;
  let freeSpinWinMultiplier = 0;
  let lastWinningRoundIndex = -1;
  let lastWinningPreviousBank = 0;

  for (let index = 0; index < freeSpinsAwarded; index += 1) {
    if (!winningIndexes.has(index)) {
      freeSpinRounds.push(
        blankControlledFreeSpinRound(
          index,
          blankHotlineGrid(GameId.THUNDER_SLOT, variant + 900 + index * 53),
        ),
      );
      continue;
    }

    const isLastWinningRound = portionIndex === winningRoundCount - 1;
    const desiredTotal = isLastWinningRound
      ? roundFeatureMultiplier(Math.max(0, target - freeSpinWinMultiplier))
      : (portions[portionIndex] ?? 0);
    const symbolSeed = variant + index * 37 + portionIndex * 101;
    const sourceRound = controlledMegaBaseRoundForTarget(desiredTotal, multiplierBank, symbolSeed);
    const baseMultiplier = roundFeatureMultiplier(sourceRound.totalMultiplier);
    const nextBank = roundFeatureMultiplier(Math.max(1, desiredTotal / baseMultiplier));
    const multiplierTotal = roundFeatureMultiplier(Math.max(0, nextBank - multiplierBank));
    const multiplierSymbols =
      multiplierTotal > 0
        ? buildControlledMultiplierSymbols(multiplierTotal, variant + index * 19)
        : [];
    const scatterSymbols =
      index === 0 && deterministicFraction(variant, 211) > 0.62
        ? buildControlledScatterSymbols(variant + index * 13).slice(0, 1)
        : [];
    const totalForRound = roundFeatureMultiplier(baseMultiplier * nextBank);

    freeSpinRounds.push({
      index,
      initialGrid: sourceRound.cascades?.[0]?.grid ?? sourceRound.grid,
      finalGrid: sourceRound.grid,
      cascades: sourceRound.cascades ?? [],
      lines: sourceRound.lines,
      baseMultiplier,
      scatterSymbols,
      multiplierSymbols,
      multiplierTotal,
      appliedMultiplier: nextBank,
      totalMultiplier: totalForRound,
      extraFreeSpinsAwarded: 0,
    });

    lastWinningRoundIndex = index;
    lastWinningPreviousBank = multiplierBank;
    multiplierBank = nextBank;
    freeSpinWinMultiplier = roundFeatureMultiplier(freeSpinWinMultiplier + totalForRound);
    portionIndex += 1;
  }

  const delta = roundFeatureMultiplier(target - freeSpinWinMultiplier);
  if (Math.abs(delta) > 0.0001 && lastWinningRoundIndex >= 0) {
    const lastWinIndex = lastWinningRoundIndex;
    const lastRound = freeSpinRounds[lastWinIndex]!;
    const adjustedTotal = roundFeatureMultiplier(Math.max(0, lastRound.totalMultiplier + delta));
    const adjustedAppliedMultiplier =
      lastRound.baseMultiplier > 0
        ? roundFeatureMultiplier(Math.max(1, adjustedTotal / lastRound.baseMultiplier))
        : 1;
    const adjustedMultiplierTotal = roundFeatureMultiplier(
      Math.max(0, adjustedAppliedMultiplier - lastWinningPreviousBank),
    );
    const actualAdjustedTotal = controlledMegaFreeSpinRoundTotal(
      lastRound.baseMultiplier,
      lastRound.scatterSymbols.length,
      adjustedAppliedMultiplier,
    );
    freeSpinRounds[lastWinIndex] = {
      ...lastRound,
      multiplierSymbols:
        adjustedMultiplierTotal > 0
          ? buildControlledMultiplierSymbols(adjustedMultiplierTotal, variant + lastWinIndex * 19)
          : [],
      multiplierTotal: adjustedMultiplierTotal,
      appliedMultiplier: adjustedAppliedMultiplier,
      totalMultiplier: actualAdjustedTotal,
    };
    freeSpinWinMultiplier = roundFeatureMultiplier(
      freeSpinWinMultiplier - lastRound.totalMultiplier + actualAdjustedTotal,
    );
    multiplierBank = adjustedAppliedMultiplier;
  }

  return {
    freeSpinsAwarded,
    freeSpinRounds,
    freeSpinMultiplierBank: multiplierBank,
    freeSpinWinMultiplier,
  };
}

function controlledMegaFreeSpinRoundTotal(
  baseMultiplier: number,
  scatterCount: number,
  appliedMultiplier: number,
): number {
  const scatterMultiplier = getControlledMegaScatterPayout(scatterCount);
  const symbolWinMultiplier = Math.max(0, baseMultiplier - scatterMultiplier);
  return roundFeatureMultiplier(
    scatterMultiplier + symbolWinMultiplier * Math.max(1, appliedMultiplier),
  );
}

function getControlledMegaScatterPayout(count: number): number {
  if (count >= 6) return 100;
  if (count === 5) return 5;
  if (count === 4) return 3;
  return 0;
}

function controlledMegaBaseRoundForTarget(
  desiredTotal: number,
  previousMultiplierBank: number,
  variant: number,
): HotlineRound {
  const minAppliedMultiplier = Math.max(1, previousMultiplierBank + 0.0001);
  const maxBaseMultiplier = Math.max(0, desiredTotal / minAppliedMultiplier);
  const candidates = controlledMegaBaseRoundCandidates(variant)
    .filter((candidate) => candidate.totalMultiplier <= maxBaseMultiplier + 0.0001)
    .sort(
      (a, b) =>
        b.totalMultiplier - a.totalMultiplier ||
        deterministicFraction(variant, Math.round(a.totalMultiplier * 10_000)) -
          deterministicFraction(variant, Math.round(b.totalMultiplier * 10_000)),
    );
  return candidates[0] ?? controlledMegaBaseRoundCandidates(variant)[0]!;
}

function controlledMegaBaseRoundCandidates(variant: number): HotlineRound[] {
  const rounds: HotlineRound[] = [];
  for (let symbol = 0; symbol < HOTLINE_MEGA_SYMBOLS.length; symbol += 1) {
    for (const clusterCount of [12, 10, 8] as const) {
      const round = roundFromMegaGrid(
        GameId.THUNDER_SLOT,
        megaClusterHotlineGrid([symbol], variant + symbol * 41 + clusterCount * 13, clusterCount),
        variant + symbol * 41 + clusterCount * 13,
        false,
      );
      if (round.totalMultiplier > 0 && round.lines.length > 0) {
        rounds.push(round);
      }
    }
  }
  return rounds.sort((a, b) => a.totalMultiplier - b.totalMultiplier);
}

function blankControlledFreeSpinRound(
  index: number,
  blankGrid: number[][],
): HotlineMegaFeatureResult['freeSpinRounds'][number] {
  return {
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
  };
}

function pickControlledFreeSpinWinIndexes(
  totalSpins: number,
  winningRoundCount: number,
  variant: number,
): Set<number> {
  const indexes = Array.from({ length: totalSpins }, (_, index) => index);
  indexes.sort(
    (a, b) =>
      deterministicFraction(variant + a * 17, 503) - deterministicFraction(variant + b * 17, 503),
  );
  return new Set(indexes.slice(0, winningRoundCount).sort((a, b) => a - b));
}

function distributeIncreasingControlledMultiplier(
  totalMultiplier: number,
  count: number,
  variant: number,
): number[] {
  if (count <= 0) return [];
  const weights = Array.from(
    { length: count },
    (_, index) => (index + 1) * (0.8 + deterministicFraction(variant, 740 + index * 29) * 0.4),
  ).sort((a, b) => a - b);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let used = 0;
  return weights.map((weight, index) => {
    if (index === count - 1) return roundFeatureMultiplier(Math.max(0, totalMultiplier - used));
    const portion = roundFeatureMultiplier((totalMultiplier * weight) / totalWeight);
    used = roundFeatureMultiplier(used + portion);
    return portion;
  });
}

function controlledMegaSymbolSet(variant: number): readonly number[] {
  const highSymbols = [4, 5, 6, 7] as const;
  const first = highSymbols[Math.abs(variant) % highSymbols.length]!;
  const mode = Math.abs(Math.floor(variant / 7)) % 4;
  if (mode === 0) return [first];
  const second = highSymbols[(Math.abs(variant) + 1) % highSymbols.length]!;
  if (mode === 1) return [first, second];
  const third = highSymbols[(Math.abs(variant) + 2) % highSymbols.length]!;
  return [first, second, third];
}

function buildControlledMultiplierSymbols(
  totalValue: number,
  variant: number,
): HotlineSpecialSymbol[] {
  const total = roundFeatureMultiplier(totalValue);
  if (total <= 0) return [];
  const count = total >= 12 ? 3 : total >= 4 ? 2 : 1;
  const positions = rankedMegaPositions(
    Array.from({ length: 30 }, (_, index) => ({
      reel: Math.floor(index / 5),
      row: index % 5,
    })),
    variant + 811,
  );
  const pieces = splitMultiplierValue(total, count, variant);
  return pieces.map((value, index) => ({
    ...positions[index]!,
    type: 'multiplier' as const,
    value,
  }));
}

function splitMultiplierValue(total: number, count: number, variant: number): number[] {
  if (count <= 1) return [roundFeatureMultiplier(total)];
  const weights = Array.from(
    { length: count },
    (_, index) => 0.7 + deterministicFraction(variant, 900 + index * 23) * 1.4,
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let used = 0;
  return weights.map((weight, index) => {
    if (index === count - 1) return roundFeatureMultiplier(Math.max(0, total - used));
    const value = roundFeatureMultiplier((total * weight) / totalWeight);
    used = roundFeatureMultiplier(used + value);
    return value;
  });
}

function buildControlledScatterSymbols(variant: number): HotlineSpecialSymbol[] {
  const positions = rankedMegaPositions(
    Array.from({ length: 30 }, (_, index) => ({
      reel: Math.floor(index / 5),
      row: index % 5,
    })),
    variant + 613,
  );
  return positions.slice(0, 4).map((position) => ({
    ...position,
    type: 'scatter' as const,
  }));
}

export const __hotlineServiceTestHooks = {
  capMegaFreeGameSettlement,
  shouldApplyMegaFreeGameSettlementCap,
  buildControlledMegaFeature,
  chooseMegaFreeGameAccountingMultiplier,
  megaBuyFeatureStakeAmount,
  fixedLineHotlineGrid,
  roundFromMegaGrid,
  lossHotlineRound,
  softLossHotlineRound,
  winningHotlineRound,
  strictWinningHotlineRound,
  megaClusterHotlineGrid,
};
