import { PrismaClient, Prisma } from '@prisma/client';
import {
  HOTLINE_MEGA_BUY_FEATURE_COST_MULTIPLIER,
  HOTLINE_MEGA_SYMBOLS,
  HOTLINE_MEGA_MAX_TOTAL_MULTIPLIER,
  HOTLINE_ROWS,
  FORTUNE_GEMS_MULTIPLIERS,
  getHotlineReelCount,
  getHotlineReelRowCounts,
  getHotlineRowCount,
  getHotlineSymbolsForGame,
  getHotlineEvaluationMode,
  getHotlineMaximumTotalMultiplier,
  getHotlinePaylinePayoutScale,
  getHotlinePaylinesForGame,
  hotlineSpin,
  hotlineBuyFreeSpins,
  hotlineSpinCascades,
  hotlineSelectBountyFreeMode,
  hotlineSelectLucky777FreeMode,
  hotlineSelectCaishenFreeGame,
  hotlineSpinSourceFeatureRound,
  hotlineEvaluate,
  applyDragonHatchCollectionAction,
  getFortuneOxFullScreenMultiplier,
  getStar97SevenMultiplier,
  hmacIntStream,
  isHotlineCascadeGame,
  isHotlineFeatureGame,
  isHotlineMegaGame,
  isHotlineSourceFeatureGame,
  type HotlineSourceFeatureMode,
  getH5OriginalGameSpec,
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
  type HotlineFreeSpinRound,
  type HotlineJackpotSnapshot,
  type HotlineMegaFeatureResult,
  type HotlineSpecialSymbol,
  type HotlineSourceStack,
  type HotlineSourceFeatureResult,
  type HotlineWinLine,
  type HotlineWinPosition,
} from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runLockedTransaction,
  type ActiveSeedBundle,
} from '../_common/BaseGameService.js';
import {
  applyControls,
  finalizeControls,
  forceControlOutcomeToLoss,
  multiplierMatchesControlBounds,
  type ControlOutcome,
} from '../_common/controls.js';
import {
  buildEntertainmentShapeMeta,
  getActiveEntertainmentEnvelope,
  shapeControlOutcomeForEntertainment,
  type EntertainmentShapeMeta,
} from '../_common/entertainmentShaper.js';
import { pickRandomBest, pickRandomItem } from '../_common/resultSelection.js';
import type { HotlineBetInput } from './hotline.schema.js';
import { ApiError } from '../../../utils/errors.js';

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
const H5_FRUIT_LITTLE_MARY_MAX_BET = new Prisma.Decimal(5000);
const H5_DEFERRED_PAYOUT_GAME_IDS = new Set(['h5-caishen-wins', 'h5-gates-of-olympus']);
const H5_DEFERRED_PAYOUT_VERSION = 'h5-feature-deferred-payout-v1';
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

interface HotlineBetOptions {
  buyFeatureCostMultiplier?: number;
  buyFeatureMaxStake?: Prisma.Decimal.Value | null;
  stakeMultiplier?: Prisma.Decimal.Value;
  sourceFeatureMode?: HotlineSourceFeatureMode;
  deferBountyFreeModeSelection?: boolean;
  deferSourceFreeModeSelection?: boolean;
  deferCaishenFreeDecision?: boolean;
  sourceFreeModeType?: number;
}

interface H5WalletSettlement {
  version: typeof H5_DEFERRED_PAYOUT_VERSION;
  status: 'DEFERRED' | 'PAID';
  completedAt?: string;
}

interface DeferredHotlineResultData {
  grid: number[][];
  lines: HotlineWinLine[];
  cascades: HotlineCascadeStep[];
  features?: HotlineMegaFeatureResult;
  sourceFeature?: HotlineSourceFeatureResult;
  finalGoldPositions?: HotlineWinPosition[];
  finalSourceStacks?: HotlineSourceStack[];
  buyFeature: boolean;
  enhancedBet: boolean;
  baseAmount: string;
  stakeAmount: string;
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function deferredH5WalletSettlement(): H5WalletSettlement {
  return { version: H5_DEFERRED_PAYOUT_VERSION, status: 'DEFERRED' };
}

function readH5WalletSettlement(value: unknown): H5WalletSettlement | null {
  const record = jsonRecord(value);
  if (
    record?.version !== H5_DEFERRED_PAYOUT_VERSION ||
    (record.status !== 'DEFERRED' && record.status !== 'PAID')
  ) {
    return null;
  }
  return record as unknown as H5WalletSettlement;
}

function shouldDeferH5FeaturePayout(
  gameId: string,
  features: HotlineMegaFeatureResult | undefined,
): boolean {
  return (
    H5_DEFERRED_PAYOUT_GAME_IDS.has(gameId) &&
    Boolean(features && features.freeSpinRounds.length > 0)
  );
}

function readDeferredHotlineResultData(value: unknown): DeferredHotlineResultData | null {
  const record = jsonRecord(value);
  if (
    !record ||
    readH5WalletSettlement(record.walletSettlement)?.status !== 'DEFERRED' ||
    !Array.isArray(record.grid) ||
    !Array.isArray(record.lines) ||
    !Array.isArray(record.cascades) ||
    typeof record.baseAmount !== 'string' ||
    typeof record.stakeAmount !== 'string' ||
    typeof record.buyFeature !== 'boolean' ||
    typeof record.enhancedBet !== 'boolean'
  ) {
    return null;
  }
  return record as unknown as DeferredHotlineResultData;
}

export class HotlineService {
  constructor(private readonly prisma: PrismaClient) {}

  async getPendingDeferredFeature(
    userId: string,
    gameId: string,
  ): Promise<HotlineBetResult | null> {
    if (!H5_DEFERRED_PAYOUT_GAME_IDS.has(gameId)) return null;
    const bet = await this.prisma.bet.findFirst({
      where: {
        userId,
        gameId,
        status: 'SETTLED',
        resultData: { path: ['walletSettlement', 'status'], equals: 'DEFERRED' },
      },
      orderBy: { createdAt: 'desc' },
      include: { serverSeed: { select: { seedHash: true } } },
    });
    if (!bet) return null;
    const stored = readDeferredHotlineResultData(bet.resultData);
    if (!stored) throw new ApiError('INTERNAL', '免費遊戲延後結算資料損壞');
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { balance: true },
    });
    return {
      betId: bet.id,
      grid: stored.grid,
      lines: stored.lines,
      cascades: stored.cascades,
      ...(stored.features ? { features: stored.features } : {}),
      ...(stored.sourceFeature ? { sourceFeature: stored.sourceFeature } : {}),
      ...(stored.finalGoldPositions ? { finalGoldPositions: stored.finalGoldPositions } : {}),
      ...(stored.finalSourceStacks ? { finalSourceStacks: stored.finalSourceStacks } : {}),
      ...(stored.buyFeature ? { buyFeature: true } : {}),
      ...(stored.enhancedBet ? { enhancedBet: true } : {}),
      baseAmount: stored.baseAmount,
      stakeAmount: stored.stakeAmount,
      multiplier: Number(bet.multiplier.toFixed(4)),
      amount: bet.amount.toFixed(2),
      payout: bet.payout.toFixed(2),
      profit: bet.profit.toFixed(2),
      newBalance: user.balance.toFixed(2),
      payoutDeferred: true,
      nonce: bet.nonce,
      serverSeedHash: bet.serverSeed.seedHash,
      clientSeed: bet.clientSeedUsed,
    };
  }

  async completeDeferredFeature(userId: string, gameId: string, betId: string): Promise<string> {
    if (!H5_DEFERRED_PAYOUT_GAME_IDS.has(gameId)) {
      throw new ApiError('INVALID_ACTION', '此遊戲沒有可延後結算的免費遊戲');
    }
    return runLockedTransaction(this.prisma, async (tx) => {
      const user = await lockUserAndCheckFunds(tx, userId, new Prisma.Decimal(0), gameId, {
        skipBetValidation: true,
      });
      const bet = await tx.bet.findFirst({
        where: { id: betId, userId, gameId, status: 'SETTLED' },
        select: { id: true, payout: true, resultData: true },
      });
      if (!bet) throw new ApiError('INVALID_ACTION', '找不到免費遊戲結算資料');
      const resultData = jsonRecord(bet.resultData);
      const walletSettlement = readH5WalletSettlement(resultData?.walletSettlement);
      if (!resultData || walletSettlement?.status !== 'DEFERRED') {
        return user.balance.toFixed(2);
      }
      const newBalance = await creditAndRecord(tx, userId, bet.payout, bet.id, 'BET_WIN', {
        gameId,
        mode: 'feature-close',
      });
      await tx.bet.update({
        where: { id: bet.id },
        data: {
          resultData: {
            ...resultData,
            walletSettlement: {
              ...walletSettlement,
              status: 'PAID',
              completedAt: new Date().toISOString(),
            },
          } as Prisma.InputJsonValue,
        },
      });
      return newBalance.toFixed(2);
    });
  }

  async jackpot(gameId: string): Promise<HotlineJackpotSnapshot> {
    if (
      !isHotlineMegaGame(gameId) &&
      gameId !== 'h5-nine-line-pull-king' &&
      gameId !== 'h5-fruit-little-mary'
    ) {
      throw new Error('JACKPOT_ONLY_AVAILABLE_FOR_MEGA_SLOT');
    }

    const pool = await this.getOrCreateJackpotPool(this.prisma, gameId);
    return toJackpotSnapshot(pool, new Date());
  }

  async selectSourceFreeMode(
    userId: string,
    gameId: string,
    betId: string,
    sourceFreeModeType: number,
  ): Promise<HotlineBetResult> {
    if (gameId !== 'h5-queen-of-bounty' && gameId !== 'h5-lucky-777') {
      throw new ApiError('INVALID_ACTION', '此遊戲沒有免費遊戲模式選擇');
    }
    return runLockedTransaction(this.prisma, async (tx) => {
      const bet = await tx.bet.findFirst({
        where: { id: betId, userId, gameId, status: 'PENDING' },
        include: { serverSeed: { select: { seed: true, seedHash: true } } },
      });
      if (!bet) throw new ApiError('INVALID_ACTION', '免費遊戲選擇已完成或不存在');
      const stored = parsePendingBountyFreeModeSelection(bet.resultData);
      const baseAmount = new Prisma.Decimal(stored.baseAmount);
      const stakeAmount = bet.amount;
      const selectedType = normalizeSourceFreeModeType(gameId, sourceFreeModeType);
      const naturalFeatures = withSourceTriggerSymbols(
        generateSelectedSourceFreeMode(
          bet.serverSeed.seed,
          bet.clientSeedUsed,
          bet.nonce,
          gameId,
          selectedType,
        ),
        stored.scatterSymbols,
      );
      const naturalPayout = baseAmount
        .mul(naturalFeatures.totalMultiplier)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const naturalMultiplier = stakeAmount.greaterThan(0)
        ? naturalPayout.div(stakeAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
        : new Prisma.Decimal(0);
      const prediction = {
        won: naturalPayout.greaterThan(stakeAmount),
        amount: stakeAmount,
        multiplier: naturalMultiplier,
        payout: naturalPayout,
      };
      const controlled = await applyControls(tx, userId, gameId, prediction);
      const selection = selectBountyFreeFeaturesForControl(
        naturalFeatures,
        controlled,
        bet.serverSeed.seed,
        bet.clientSeedUsed,
        bet.nonce,
        gameId,
        selectedType,
        baseAmount,
        stakeAmount,
        stored.scatterSymbols,
      );
      const finalFeatures = selection.features;
      const finalPayout = baseAmount
        .mul(finalFeatures.totalMultiplier)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const finalMultiplier = stakeAmount.greaterThan(0)
        ? finalPayout.div(stakeAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
        : new Prisma.Decimal(0);
      const profit = finalPayout.minus(stakeAmount);
      const originalResult = bountySelectionResultData(stored, naturalFeatures, false, null);
      const finalResult = bountySelectionResultData(
        stored,
        finalFeatures,
        selection.control.controlled,
        selection.control.flipReason ?? null,
        selection.control.controlled ? originalResult : null,
      );

      await tx.bet.update({
        where: { id: bet.id },
        data: {
          multiplier: finalMultiplier,
          payout: finalPayout,
          profit,
          status: 'SETTLED',
          settledAt: new Date(),
          resultData: finalResult as unknown as Prisma.InputJsonValue,
        },
      });
      const newBalance = finalPayout.greaterThan(0)
        ? await creditAndRecord(tx, userId, finalPayout, bet.id, 'BET_WIN')
        : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;
      await finalizeControls(
        tx,
        userId,
        gameId,
        prediction,
        {
          won: finalPayout.greaterThan(stakeAmount),
          amount: stakeAmount,
          multiplier: finalMultiplier,
          payout: finalPayout,
        },
        selection.control,
        bet.id,
        originalResult as unknown as Prisma.InputJsonValue,
        finalResult as unknown as Prisma.InputJsonValue,
      );

      return {
        betId: bet.id,
        grid: stored.triggerGrid,
        lines: [],
        cascades: [],
        features: finalFeatures,
        baseAmount: baseAmount.toFixed(2),
        stakeAmount: stakeAmount.toFixed(2),
        multiplier: Number(finalMultiplier.toFixed(4)),
        amount: stakeAmount.toFixed(2),
        payout: finalPayout.toFixed(2),
        profit: profit.toFixed(2),
        newBalance: newBalance.toFixed(2),
        nonce: bet.nonce,
        serverSeedHash: bet.serverSeed.seedHash,
        clientSeed: bet.clientSeedUsed,
        freeModeContinuation: true,
      };
    });
  }

  async selectBountyFreeMode(
    userId: string,
    betId: string,
    sourceFreeModeType: number,
  ): Promise<HotlineBetResult> {
    return this.selectSourceFreeMode(userId, 'h5-queen-of-bounty', betId, sourceFreeModeType);
  }

  async getPendingSourceFreeMode(userId: string, gameId: string): Promise<HotlineBetResult | null> {
    if (gameId !== 'h5-queen-of-bounty' && gameId !== 'h5-lucky-777') return null;
    const bet = await this.prisma.bet.findFirst({
      where: { userId, gameId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: { serverSeed: { select: { seedHash: true } } },
    });
    if (!bet) return null;
    const stored = parsePendingBountyFreeModeSelection(bet.resultData);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { balance: true },
    });
    return {
      betId: bet.id,
      grid: stored.triggerGrid,
      lines: [],
      cascades: [],
      features: buildPendingSourceTriggerFeatures(gameId, stored.scatterSymbols),
      baseAmount: stored.baseAmount,
      stakeAmount: stored.stakeAmount,
      multiplier: 0,
      amount: stored.stakeAmount,
      payout: '0.00',
      profit: bet.amount.negated().toFixed(2),
      newBalance: user.balance.toFixed(2),
      nonce: bet.nonce,
      serverSeedHash: bet.serverSeed.seedHash,
      clientSeed: bet.clientSeedUsed,
      requiresFreeModeSelection: true,
    };
  }

  async getPendingBountyFreeMode(userId: string): Promise<HotlineBetResult | null> {
    return this.getPendingSourceFreeMode(userId, 'h5-queen-of-bounty');
  }

  async getPendingCaishenFreeDecision(userId: string): Promise<HotlineBetResult | null> {
    const gameId = 'h5-caishen-wins';
    const bet = await this.prisma.bet.findFirst({
      where: { userId, gameId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: { serverSeed: { select: { seedHash: true } } },
    });
    if (!bet) return null;
    const stored = parsePendingCaishenFreeDecision(bet.resultData);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { balance: true },
    });
    const previewPayout = new Prisma.Decimal(stored.baseAmount)
      .mul(stored.baseTotalMultiplier)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    return {
      betId: bet.id,
      grid: stored.triggerGrid,
      lines: stored.triggerLines,
      cascades: stored.triggerCascades,
      features: buildPendingCaishenTriggerFeatures(stored),
      buyFeature: stored.buyFeature,
      baseAmount: stored.baseAmount,
      stakeAmount: stored.stakeAmount,
      multiplier: 0,
      amount: stored.stakeAmount,
      payout: previewPayout.toFixed(2),
      profit: bet.amount.negated().toFixed(2),
      newBalance: user.balance.toFixed(2),
      nonce: bet.nonce,
      serverSeedHash: bet.serverSeed.seedHash,
      clientSeed: bet.clientSeedUsed,
      requiresCaishenFreeDecision: true,
    };
  }

  async gambleCaishenFree(
    userId: string,
    betId: string,
    type: number,
  ): Promise<{
    guessResult: 0 | 1;
    freeCount: number;
    freeMul: number;
    newBalance: string;
    settlement?: HotlineBetResult;
  }> {
    const gameId = 'h5-caishen-wins';
    const guessType = Math.trunc(type);
    if (guessType !== 0 && guessType !== 1) {
      throw new ApiError('INVALID_ACTION', '免費遊戲猜獎類型不正確');
    }
    return runLockedTransaction(this.prisma, async (tx) => {
      const bet = await tx.bet.findFirst({
        where: { id: betId, userId, gameId, status: 'PENDING' },
        include: { serverSeed: { select: { seed: true, seedHash: true } } },
      });
      if (!bet) throw new ApiError('INVALID_ACTION', '免費遊戲猜獎已完成或不存在');
      const stored = parsePendingCaishenFreeDecision(bet.resultData);
      if (guessType === 0 && stored.freeCount >= 20) {
        throw new ApiError('INVALID_ACTION', '免費遊戲次數已達上限');
      }
      if (guessType === 1 && stored.freeMul >= 20) {
        throw new ApiError('INVALID_ACTION', '免費遊戲倍率已達上限');
      }
      const stream = hmacIntStream(
        bet.serverSeed.seed,
        `${bet.clientSeedUsed}:caishen-gamble:${stored.guessIndex}:${guessType}`,
        bet.nonce,
      );
      const success = (stream.next().value as number) / 0x1_0000_0000 < 0.5;
      if (!success) {
        const settlement = await this.settlePendingCaishenFree(
          tx,
          userId,
          bet,
          stored,
          0,
          stored.freeMul,
        );
        return {
          guessResult: 0 as const,
          freeCount: 0,
          freeMul: stored.freeMul,
          newBalance: settlement.newBalance,
          settlement,
        };
      }
      const updated: PendingCaishenFreeDecision = {
        ...stored,
        freeCount: guessType === 0 ? Math.min(20, stored.freeCount + 2) : stored.freeCount,
        freeMul: guessType === 1 ? Math.min(20, stored.freeMul + 2) : stored.freeMul,
        guessIndex: stored.guessIndex + 1,
      };
      await tx.bet.update({
        where: { id: bet.id },
        data: { resultData: updated as unknown as Prisma.InputJsonValue },
      });
      const balance = (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;
      return {
        guessResult: 1 as const,
        freeCount: updated.freeCount,
        freeMul: updated.freeMul,
        newBalance: balance.toFixed(2),
      };
    });
  }

  async collectCaishenFree(userId: string, betId: string): Promise<HotlineBetResult> {
    const gameId = 'h5-caishen-wins';
    return runLockedTransaction(this.prisma, async (tx) => {
      const bet = await tx.bet.findFirst({
        where: { id: betId, userId, gameId, status: 'PENDING' },
        include: { serverSeed: { select: { seed: true, seedHash: true } } },
      });
      if (!bet) throw new ApiError('INVALID_ACTION', '免費遊戲已領取或不存在');
      const stored = parsePendingCaishenFreeDecision(bet.resultData);
      return this.settlePendingCaishenFree(
        tx,
        userId,
        bet,
        stored,
        stored.freeCount,
        stored.freeMul,
      );
    });
  }

  private async settlePendingCaishenFree(
    tx: Prisma.TransactionClient,
    userId: string,
    bet: PendingCaishenBet,
    stored: PendingCaishenFreeDecision,
    freeCount: number,
    freeMul: number,
  ): Promise<HotlineBetResult> {
    const gameId = 'h5-caishen-wins';
    const baseAmount = new Prisma.Decimal(stored.baseAmount);
    const stakeAmount = bet.amount;
    const naturalFree =
      freeCount > 0
        ? hotlineSelectCaishenFreeGame(
            bet.serverSeed.seed,
            bet.clientSeedUsed,
            bet.nonce,
            freeCount,
            freeMul,
          )
        : emptyCaishenFreeFeatures(stored, 0, freeMul, bet.nonce);
    const naturalFeatures = withPendingCaishenBase(stored, naturalFree);
    const naturalPayout = baseAmount
      .mul(naturalFeatures.totalMultiplier)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    const naturalMultiplier = stakeAmount.greaterThan(0)
      ? naturalPayout.div(stakeAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
      : new Prisma.Decimal(0);
    const prediction = {
      won: naturalPayout.greaterThan(stakeAmount),
      amount: stakeAmount,
      multiplier: naturalMultiplier,
      payout: naturalPayout,
    };
    const controlled = await applyControls(tx, userId, gameId, prediction);
    const selection = selectCaishenFreeFeaturesForControl(
      naturalFeatures,
      controlled,
      bet.serverSeed.seed,
      bet.clientSeedUsed,
      bet.nonce,
      freeCount,
      freeMul,
      baseAmount,
      stakeAmount,
      stored,
    );
    const finalFeatures = selection.features;
    const finalPayout = baseAmount
      .mul(finalFeatures.totalMultiplier)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    const finalMultiplier = stakeAmount.greaterThan(0)
      ? finalPayout.div(stakeAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
      : new Prisma.Decimal(0);
    const profit = finalPayout.minus(stakeAmount);
    const originalResult = caishenDecisionResultData(stored, naturalFeatures, false, null);
    const finalResult = caishenDecisionResultData(
      stored,
      finalFeatures,
      selection.control.controlled,
      selection.control.flipReason ?? null,
      selection.control.controlled ? originalResult : null,
    );
    const payoutDeferred = shouldDeferH5FeaturePayout(gameId, finalFeatures);
    if (payoutDeferred) finalResult.walletSettlement = deferredH5WalletSettlement();
    await tx.bet.update({
      where: { id: bet.id },
      data: {
        multiplier: finalMultiplier,
        payout: finalPayout,
        profit,
        status: 'SETTLED',
        settledAt: new Date(),
        resultData: finalResult as unknown as Prisma.InputJsonValue,
      },
    });
    const currentBalance = (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;
    const newBalance =
      !payoutDeferred && finalPayout.greaterThan(0)
        ? await creditAndRecord(tx, userId, finalPayout, bet.id, 'BET_WIN')
        : currentBalance;
    await finalizeControls(
      tx,
      userId,
      gameId,
      prediction,
      {
        won: finalPayout.greaterThan(stakeAmount),
        amount: stakeAmount,
        multiplier: finalMultiplier,
        payout: finalPayout,
      },
      selection.control,
      bet.id,
      originalResult as unknown as Prisma.InputJsonValue,
      finalResult as unknown as Prisma.InputJsonValue,
    );
    return {
      betId: bet.id,
      grid: stored.triggerGrid,
      lines: stored.triggerLines,
      cascades: stored.triggerCascades,
      features: finalFeatures,
      buyFeature: stored.buyFeature,
      baseAmount: stored.baseAmount,
      stakeAmount: stored.stakeAmount,
      multiplier: Number(finalMultiplier.toFixed(4)),
      amount: stored.stakeAmount,
      payout: finalPayout.toFixed(2),
      profit: profit.toFixed(2),
      newBalance: newBalance.toFixed(2),
      ...(payoutDeferred ? { payoutDeferred: true } : {}),
      nonce: bet.nonce,
      serverSeedHash: bet.serverSeed.seedHash,
      clientSeed: bet.clientSeedUsed,
      caishenFreeContinuation: true,
    };
  }

  async bet(
    userId: string,
    input: HotlineBetInput,
    gameIdOverride?: string,
    options: HotlineBetOptions = {},
  ): Promise<HotlineBetResult> {
    const baseAmount = new Prisma.Decimal(input.amount);
    const gameId = gameIdOverride ?? input.gameId ?? GameId.HOTLINE;
    const reelCount = getHotlineReelCount(gameId);
    const rowCount = getHotlineRowCount(gameId);
    const buyFeature = Boolean(input.buyFeature);
    const sourceFeatureMode = options.sourceFeatureMode;
    const enhancedBet = sourceFeatureMode === 'fortune-gems-extra-bet';
    if (buyFeature && !isHotlineFeatureGame(gameId)) {
      throw new Error('BUY_FEATURE_ONLY_AVAILABLE_FOR_MEGA_SLOT');
    }
    const stakeAmount = buyFeature
      ? megaBuyFeatureStakeAmount(
          baseAmount,
          options.buyFeatureCostMultiplier,
          options.buyFeatureMaxStake,
        )
      : sourceStakeAmount(baseAmount, options.stakeMultiplier);

    return runLockedTransaction(this.prisma, async (tx) => {
      await lockUserAndCheckFunds(tx, userId, stakeAmount, gameId, {
        limitAmounts: [baseAmount],
      });
      if (H5_DEFERRED_PAYOUT_GAME_IDS.has(gameId)) {
        const pendingFeature = await tx.bet.findFirst({
          where: {
            userId,
            gameId,
            status: 'SETTLED',
            resultData: { path: ['walletSettlement', 'status'], equals: 'DEFERRED' },
          },
          select: { id: true },
        });
        if (pendingFeature) {
          throw new ApiError('INVALID_ACTION', `請先完成目前的免費遊戲：${pendingFeature.id}`);
        }
      }
      if (
        ((gameId === 'h5-queen-of-bounty' || gameId === 'h5-lucky-777') &&
          (options.deferSourceFreeModeSelection || options.deferBountyFreeModeSelection)) ||
        (gameId === 'h5-caishen-wins' && options.deferCaishenFreeDecision)
      ) {
        const pending = await tx.bet.findFirst({
          where: { userId, gameId, status: 'PENDING' },
          select: { id: true },
        });
        if (pending) {
          throw new ApiError('INVALID_ACTION', '請先完成目前的免費遊戲選擇');
        }
      }
      const seed = await new SeedHelper(tx).getActiveBundle(userId, gameId, input.clientSeed);
      const star97StartingProgress =
        gameId === 'h5-star-97'
          ? await loadStar97Progress(tx, userId, stakeAmount)
          : { ...EMPTY_STAR_97_PROGRESS };
      let generatedRound = buildHotlineRound(
        seed.serverSeed,
        seed.clientSeed,
        seed.nonce,
        gameId,
        reelCount,
        rowCount,
        buyFeature,
        sourceFeatureMode,
        options.sourceFreeModeType,
      );
      if (gameId === 'h5-star-97') {
        generatedRound = decorateStar97Round(
          generatedRound,
          star97StartingProgress,
          seed.serverSeed,
          seed.clientSeed,
          seed.nonce,
        );
      }
      if (gameId === 'h5-nine-line-pull-king' || gameId === 'h5-fruit-little-mary') {
        const pool = await this.getOrCreateJackpotPool(tx, gameId);
        const grand = growJackpotValues(pool, new Date()).grand;
        generatedRound =
          gameId === 'h5-nine-line-pull-king'
            ? resolveNineLineJackpotAwards(generatedRound, grand, baseAmount)
            : resolveFruitLittleMaryJackpotAward(generatedRound, grand, baseAmount);
      }
      if (
        (gameId === 'h5-queen-of-bounty' || gameId === 'h5-lucky-777') &&
        (options.deferSourceFreeModeSelection || options.deferBountyFreeModeSelection) &&
        (generatedRound.features?.scatterCount ?? 0) >= 3
      ) {
        return createPendingSourceFreeModeSelection(
          tx,
          userId,
          gameId,
          baseAmount,
          stakeAmount,
          seed,
          generatedRound.features!,
        );
      }
      if (
        gameId === 'h5-caishen-wins' &&
        options.deferCaishenFreeDecision &&
        (buyFeature || (generatedRound.features?.scatterCount ?? 0) >= 4)
      ) {
        return createPendingCaishenFreeDecision(
          tx,
          userId,
          baseAmount,
          stakeAmount,
          seed,
          generatedRound,
          buyFeature,
        );
      }
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
      let finalSourceFeature = generatedRound.sourceFeature;
      let finalGoldPositions = generatedRound.finalGoldPositions;
      let finalSourceStacks = generatedRound.finalSourceStacks;
      let finalStar97Progress = generatedRound.star97Progress;
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
        const fortuneGemsMultiplier = gameId === 'h5-fortune-gems' ? (enhancedBet ? 2 : 1) : 1;
        const presentationControl =
          gameId === 'h5-fortune-gems'
            ? scaleControlForSourcePresentation(
                visualControl,
                stakeAmount.div(baseAmount).toNumber(),
                fortuneGemsMultiplier,
              )
            : visualControl;
        const selection = selectControlledHotlineRound(
          gameId,
          gameId === 'h5-fortune-gems' ? baseAmount : stakeAmount,
          presentationControl,
          controlled,
          seed.nonce,
          gameId === 'h5-star-97'
            ? (round, candidateVariant) =>
                decorateStar97Round(
                  round,
                  star97StartingProgress,
                  seed.serverSeed,
                  seed.clientSeed,
                  seed.nonce,
                  candidateVariant,
                )
            : undefined,
        );
        let controlledRound =
          gameId === 'h5-fortune-gems'
            ? decorateFortuneGemsRound(selection.round, fortuneGemsMultiplier, enhancedBet)
            : selection.round;
        if (
          gameId === 'h5-fortune-gems' &&
          !visualControl.won &&
          controlledRound.totalMultiplier >= stakeAmount.div(baseAmount).toNumber()
        ) {
          controlledRound = decorateFortuneGemsRound(
            hardLossHotlineRound(gameId, seed.nonce + 1703),
            fortuneGemsMultiplier,
            enhancedBet,
          );
        }
        effectiveControl = selection.effectiveControl;
        finalGrid = controlledRound.grid;
        finalLines = controlledRound.lines;
        finalCascades = controlledRound.cascades;
        finalSourceFeature = controlledRound.sourceFeature;
        finalGoldPositions = controlledRound.finalGoldPositions;
        finalSourceStacks = controlledRound.finalSourceStacks;
        finalStar97Progress = controlledRound.star97Progress;
        if (gameId === 'h5-fortune-gems') {
          finalPayout = baseAmount
            .mul(controlledRound.totalMultiplier)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
          finalMultiplier = finalPayout
            .div(stakeAmount)
            .toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN);
        } else {
          finalMultiplier = new Prisma.Decimal(controlledRound.totalMultiplier.toFixed(4));
          finalPayout = stakeAmount
            .mul(finalMultiplier)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
        }
        if (entertainmentShape && !selection.fellBackToLoss) {
          entertainmentMeta = buildEntertainmentShapeMeta(
            entertainmentShape.envelope,
            controlled.multiplier,
            finalMultiplier,
            finalPayout,
          );
        }
        finalFeatures =
          gameId !== 'h5-dragon-hatch' &&
          (buyFeature || isHotlineCascadeGame(gameId) || Boolean(controlledRound.features))
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
                  undefined,
                  gameId,
                )
              : (controlledRound.features ??
                buildControlledMegaFeature(
                  Number(finalMultiplier.toFixed(4)),
                  false,
                  seed.nonce,
                  controlledRound,
                  gameId,
                ))
            : undefined;
        if (buyFeature) {
          // A feature purchase pays through the displayed free-spin sequence.
          // Keep the trigger board free of ordinary line wins so the scene
          // never highlights a base-game payout that settlement did not award.
          finalGrid = blankHotlineGrid(gameId, seed.nonce + 503);
          finalLines = [];
          finalCascades = [];
          finalGoldPositions = undefined;
          finalSourceStacks = undefined;
        }
      }

      if (
        finalFeatures &&
        gameId !== 'h5-fruit-little-mary' &&
        shouldApplyMegaFreeGameSettlementCap(
          buyFeature || isHotlineCascadeGame(gameId) || isHotlineFeatureGame(gameId),
          finalFeatures,
          buyFeature,
          effectiveControl,
        )
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
          gameId,
        );
        finalFeatures = capped.features;
        finalPayout = capped.payout;
        finalMultiplier = capped.multiplier;
      }
      const profit = finalPayout.minus(stakeAmount);
      const payoutDeferred = shouldDeferH5FeaturePayout(gameId, finalFeatures);

      const originalResult = {
        grid: generatedRound.grid,
        lines: generatedRound.lines,
        cascades: generatedRound.cascades,
        ...(generatedRound.features ? { features: generatedRound.features } : {}),
        ...(generatedRound.sourceFeature ? { sourceFeature: generatedRound.sourceFeature } : {}),
        ...(generatedRound.finalGoldPositions
          ? { finalGoldPositions: generatedRound.finalGoldPositions }
          : {}),
        ...(generatedRound.finalSourceStacks
          ? { finalSourceStacks: generatedRound.finalSourceStacks }
          : {}),
        ...(generatedRound.star97Progress ? { star97Progress: generatedRound.star97Progress } : {}),
        buyFeature,
        enhancedBet,
        baseAmount: baseAmount.toFixed(2),
        stakeAmount: stakeAmount.toFixed(2),
      };
      const finalResult = {
        grid: finalGrid,
        lines: finalLines,
        cascades: finalCascades,
        ...(finalFeatures ? { features: finalFeatures } : {}),
        ...(finalSourceFeature ? { sourceFeature: finalSourceFeature } : {}),
        ...(finalGoldPositions ? { finalGoldPositions } : {}),
        ...(finalSourceStacks ? { finalSourceStacks } : {}),
        ...(finalStar97Progress ? { star97Progress: finalStar97Progress } : {}),
        buyFeature,
        enhancedBet,
        baseAmount: baseAmount.toFixed(2),
        stakeAmount: stakeAmount.toFixed(2),
        controlled: effectiveControl.controlled,
        flipReason: effectiveControl.flipReason ?? null,
        ...(entertainmentMeta ? { entertainment: entertainmentMeta } : {}),
        raw: effectiveControl.controlled ? originalResult : null,
        ...(payoutDeferred ? { walletSettlement: deferredH5WalletSettlement() } : {}),
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
      const debitedBalance = await debitAndRecord(tx, userId, stakeAmount, bet.id);
      const newBalance =
        !payoutDeferred && finalPayout.greaterThan(0)
          ? await creditAndRecord(tx, userId, finalPayout, bet.id, 'BET_WIN')
          : debitedBalance;
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
        isHotlineMegaGame(gameId) ||
        gameId === 'h5-nine-line-pull-king' ||
        gameId === 'h5-fruit-little-mary'
          ? await this.addJackpotContribution(
              tx,
              gameId,
              stakeAmount,
              gameId === 'h5-nine-line-pull-king'
                ? jackpotAwardAmount(finalLines, finalFeatures, baseAmount)
                : undefined,
            )
          : undefined;

      return {
        betId: bet.id,
        grid: finalGrid,
        lines: finalLines,
        cascades: finalCascades,
        ...(finalFeatures ? { features: finalFeatures } : {}),
        ...(finalSourceFeature ? { sourceFeature: finalSourceFeature } : {}),
        ...(finalGoldPositions ? { finalGoldPositions } : {}),
        ...(finalSourceStacks ? { finalSourceStacks } : {}),
        ...(buyFeature ? { buyFeature: true } : {}),
        ...(enhancedBet ? { enhancedBet: true } : {}),
        baseAmount: baseAmount.toFixed(2),
        stakeAmount: stakeAmount.toFixed(2),
        multiplier: Number(finalMultiplier.toFixed(4)),
        amount: stakeAmount.toFixed(2),
        payout: finalPayout.toFixed(2),
        profit: profit.toFixed(2),
        newBalance: newBalance.toFixed(2),
        ...(payoutDeferred ? { payoutDeferred: true } : {}),
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
    grandAward = new Prisma.Decimal(0),
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
        grand: Prisma.Decimal.max(HOTLINE_JACKPOT_RESET, grown.grand.minus(grandAward))
          .plus(contribution.grand)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN),
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
  sourceFeature?: HotlineSourceFeatureResult;
  finalGoldPositions?: HotlineWinPosition[];
  finalSourceStacks?: HotlineSourceStack[];
  star97Progress?: Star97Progress;
};

type Star97Progress = {
  cherryLineWins: number;
  bellLineWins: number;
};

const EMPTY_STAR_97_PROGRESS: Readonly<Star97Progress> = {
  cherryLineWins: 0,
  bellLineWins: 0,
};

function resolveNineLineJackpotAwards(
  round: HotlineRound,
  jackpotPool: Prisma.Decimal,
  baseAmount: Prisma.Decimal,
): HotlineRound {
  if (baseAmount.lessThanOrEqualTo(0)) return round;
  const resolveLines = (lines: HotlineWinLine[]): HotlineWinLine[] =>
    lines.map((line) => {
      const share = Math.max(0, Math.min(0.5, Number(line.jackpotShare || 0)));
      if (share <= 0) return { ...line };
      return {
        ...line,
        payout: roundFeatureMultiplier(
          jackpotPool.mul(share).div(baseAmount).toDecimalPlaces(4).toNumber(),
        ),
      };
    });
  const lineTotal = (lines: HotlineWinLine[]): number =>
    roundFeatureMultiplier(lines.reduce((sum, line) => sum + Number(line.payout || 0), 0));
  const lines = resolveLines(round.lines);
  const cascades = (round.cascades ?? []).map((cascade) => {
    const cascadeLines = resolveLines(cascade.lines);
    return { ...cascade, lines: cascadeLines, multiplier: lineTotal(cascadeLines) };
  });

  if (!round.features) {
    return { ...round, lines, cascades, totalMultiplier: lineTotal(lines) };
  }

  const freeSpinRounds = round.features.freeSpinRounds.map((freeRound) => {
    const freeLines = resolveLines(freeRound.lines);
    const freeCascades = freeRound.cascades.map((cascade) => {
      const cascadeLines = resolveLines(cascade.lines);
      return { ...cascade, lines: cascadeLines, multiplier: lineTotal(cascadeLines) };
    });
    const totalMultiplier = lineTotal(freeLines);
    return {
      ...freeRound,
      lines: freeLines,
      cascades: freeCascades,
      baseMultiplier: totalMultiplier,
      totalMultiplier,
    };
  });
  const baseTotalMultiplier = lineTotal(lines);
  const freeSpinWinMultiplier = roundFeatureMultiplier(
    freeSpinRounds.reduce((sum, freeRound) => sum + freeRound.totalMultiplier, 0),
  );
  const totalMultiplier = roundFeatureMultiplier(baseTotalMultiplier + freeSpinWinMultiplier);
  return {
    ...round,
    lines,
    cascades,
    totalMultiplier,
    features: {
      ...round.features,
      baseWinMultiplier: baseTotalMultiplier,
      baseTotalMultiplier,
      freeSpinRounds,
      freeSpinWinMultiplier,
      totalMultiplier,
    },
  };
}

function resolveFruitLittleMaryJackpotAward(
  round: HotlineRound,
  jackpotPool: Prisma.Decimal,
  baseAmount: Prisma.Decimal,
): HotlineRound {
  if (!baseAmount.equals(H5_FRUIT_LITTLE_MARY_MAX_BET) || !round.features) return round;
  const scatter =
    Number(getH5OriginalGameSpec('h5-fruit-little-mary')?.specialSymbols.scatter ?? 10) - 1;
  const visibleGrid = round.cascades?.[0]?.grid ?? round.grid;
  const positions = visibleGrid.flatMap((column, reel) =>
    column.flatMap((symbol, row) => (symbol === scatter ? [{ reel, row }] : [])),
  );
  if (positions.length < 3 || baseAmount.lessThanOrEqualTo(0)) return round;

  const payoutMultiplier = roundFeatureMultiplier(
    jackpotPool.div(baseAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN).toNumber(),
  );
  const baseTotalMultiplier = roundFeatureMultiplier(
    round.features.baseTotalMultiplier + payoutMultiplier,
  );
  const totalMultiplier = roundFeatureMultiplier(round.features.totalMultiplier + payoutMultiplier);
  return {
    ...round,
    totalMultiplier,
    features: {
      ...round.features,
      baseTotalMultiplier,
      totalMultiplier,
      sourceJackpot: {
        type: 'fruit-little-mary-jackpot',
        positions,
        payoutMultiplier,
      },
    },
  };
}

function jackpotAwardAmount(
  baseLines: HotlineWinLine[],
  features: HotlineMegaFeatureResult | undefined,
  baseAmount: Prisma.Decimal,
): Prisma.Decimal {
  const featureLines = features?.freeSpinRounds.flatMap((round) => round.lines) ?? [];
  const lineAward = [...baseLines, ...featureLines]
    .filter((line) => Number(line.jackpotShare || 0) > 0)
    .reduce(
      (sum, line) => sum.plus(baseAmount.mul(Number(line.payout || 0))),
      new Prisma.Decimal(0),
    );
  const sourceAward =
    features?.sourceJackpot?.type === 'fruit-little-mary-jackpot'
      ? baseAmount.mul(features.sourceJackpot.payoutMultiplier)
      : new Prisma.Decimal(0);
  return lineAward.plus(sourceAward).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
}

interface PendingBountyFreeModeSelection {
  kind: 'h5-bounty-free-selection';
  stage: 'AWAITING_SELECTION';
  triggerGrid: number[][];
  scatterSymbols: HotlineSpecialSymbol[];
  baseAmount: string;
  stakeAmount: string;
}

interface PendingCaishenFreeDecision {
  kind: 'h5-caishen-free-decision';
  stage: 'AWAITING_DECISION';
  triggerGrid: number[][];
  triggerLines: HotlineWinLine[];
  triggerCascades: HotlineCascadeStep[];
  scatterSymbols: HotlineSpecialSymbol[];
  baseTotalMultiplier: number;
  baseAmount: string;
  stakeAmount: string;
  buyFeature: boolean;
  freeCount: number;
  freeMul: number;
  guessIndex: number;
}

interface PendingCaishenBet {
  id: string;
  amount: Prisma.Decimal;
  nonce: number;
  clientSeedUsed: string;
  serverSeed: { seed: string; seedHash: string };
}

async function createPendingCaishenFreeDecision(
  tx: Prisma.TransactionClient,
  userId: string,
  baseAmount: Prisma.Decimal,
  stakeAmount: Prisma.Decimal,
  seed: ActiveSeedBundle,
  generatedRound: HotlineRound,
  buyFeature: boolean,
): Promise<HotlineBetResult> {
  const gameId = 'h5-caishen-wins';
  const generatedFeatures = generatedRound.features!;
  const stored: PendingCaishenFreeDecision = {
    kind: 'h5-caishen-free-decision',
    stage: 'AWAITING_DECISION',
    triggerGrid: generatedRound.grid.map((column) => [...column]),
    triggerLines: generatedRound.lines.map((line) => ({ ...line })),
    triggerCascades: (generatedRound.cascades ?? []).map((cascade) => ({ ...cascade })),
    scatterSymbols: generatedFeatures.scatterSymbols.map((symbol) => ({ ...symbol })),
    baseTotalMultiplier: generatedFeatures.baseTotalMultiplier,
    baseAmount: baseAmount.toFixed(2),
    stakeAmount: stakeAmount.toFixed(2),
    buyFeature,
    freeCount: 8,
    freeMul: 8,
    guessIndex: 0,
  };
  const triggerFeatures = buildPendingCaishenTriggerFeatures(stored);
  const previewPayout = baseAmount
    .mul(stored.baseTotalMultiplier)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const bet = await tx.bet.create({
    data: {
      userId,
      gameId,
      amount: stakeAmount,
      multiplier: new Prisma.Decimal(0),
      payout: new Prisma.Decimal(0),
      profit: stakeAmount.negated(),
      nonce: seed.nonce,
      clientSeedUsed: seed.clientSeed,
      serverSeedId: seed.serverSeedId,
      resultData: stored as unknown as Prisma.InputJsonValue,
      status: 'PENDING',
    },
  });
  const newBalance = await debitAndRecord(tx, userId, stakeAmount, bet.id);
  return {
    betId: bet.id,
    grid: stored.triggerGrid,
    lines: stored.triggerLines,
    cascades: stored.triggerCascades,
    features: triggerFeatures,
    buyFeature,
    baseAmount: stored.baseAmount,
    stakeAmount: stored.stakeAmount,
    multiplier: 0,
    amount: stored.stakeAmount,
    payout: previewPayout.toFixed(2),
    profit: stakeAmount.negated().toFixed(2),
    newBalance: newBalance.toFixed(2),
    nonce: seed.nonce,
    serverSeedHash: seed.serverSeedHash,
    clientSeed: seed.clientSeed,
    requiresCaishenFreeDecision: true,
  };
}

function parsePendingCaishenFreeDecision(value: Prisma.JsonValue): PendingCaishenFreeDecision {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('INVALID_ACTION', '財神贏免費遊戲待選資料不完整');
  }
  const data = value as Record<string, unknown>;
  if (
    data.kind !== 'h5-caishen-free-decision' ||
    data.stage !== 'AWAITING_DECISION' ||
    !Array.isArray(data.triggerGrid) ||
    !Array.isArray(data.triggerLines) ||
    !Array.isArray(data.triggerCascades) ||
    !Array.isArray(data.scatterSymbols) ||
    typeof data.baseTotalMultiplier !== 'number' ||
    typeof data.baseAmount !== 'string' ||
    typeof data.stakeAmount !== 'string' ||
    typeof data.buyFeature !== 'boolean' ||
    typeof data.freeCount !== 'number' ||
    typeof data.freeMul !== 'number' ||
    typeof data.guessIndex !== 'number'
  ) {
    throw new ApiError('INVALID_ACTION', '財神贏免費遊戲待選資料不完整');
  }
  return data as unknown as PendingCaishenFreeDecision;
}

function buildPendingCaishenTriggerFeatures(
  stored: PendingCaishenFreeDecision,
): HotlineMegaFeatureResult {
  return {
    scatterSymbols: stored.scatterSymbols.map((symbol) => ({ ...symbol })),
    scatterCount: stored.scatterSymbols.length,
    freeSpinsAwarded: stored.freeCount,
    freeSpinsPlayed: 0,
    baseWinMultiplier: stored.baseTotalMultiplier,
    baseMultiplierSymbols: [],
    baseMultiplierTotal: 0,
    baseAppliedMultiplier: 1,
    baseTotalMultiplier: stored.baseTotalMultiplier,
    freeSpinRounds: [],
    freeSpinMultiplierBank: 0,
    freeSpinWinMultiplier: 0,
    totalMultiplier: stored.baseTotalMultiplier,
    sourceFreeWinMultiplier: stored.freeMul,
  };
}

function emptyCaishenFreeFeatures(
  stored: PendingCaishenFreeDecision,
  freeCount: number,
  freeMul: number,
  variant: number,
): HotlineMegaFeatureResult {
  const freeSpinRounds = Array.from({ length: freeCount }, (_, index) =>
    blankControlledFreeSpinRound(
      index,
      blankHotlineGrid('h5-caishen-wins', variant + 901 + index * 53),
    ),
  );
  return {
    scatterSymbols: stored.scatterSymbols.map((symbol) => ({ ...symbol })),
    scatterCount: stored.scatterSymbols.length,
    freeSpinsAwarded: freeCount,
    freeSpinsPlayed: freeSpinRounds.length,
    baseWinMultiplier: 0,
    baseMultiplierSymbols: [],
    baseMultiplierTotal: 0,
    baseAppliedMultiplier: 1,
    baseTotalMultiplier: 0,
    freeSpinRounds,
    freeSpinMultiplierBank: 0,
    freeSpinWinMultiplier: 0,
    totalMultiplier: 0,
    sourceFreeWinMultiplier: freeMul,
  };
}

function withPendingCaishenBase(
  stored: PendingCaishenFreeDecision,
  freeFeatures: HotlineMegaFeatureResult,
): HotlineMegaFeatureResult {
  const freeSpinWinMultiplier = freeFeatures.freeSpinWinMultiplier;
  return {
    ...freeFeatures,
    scatterSymbols: stored.scatterSymbols.map((symbol) => ({ ...symbol })),
    scatterCount: stored.scatterSymbols.length,
    baseWinMultiplier: stored.baseTotalMultiplier,
    baseMultiplierSymbols: [],
    baseMultiplierTotal: 0,
    baseAppliedMultiplier: 1,
    baseTotalMultiplier: stored.baseTotalMultiplier,
    totalMultiplier: roundFeatureMultiplier(
      Math.min(
        HOTLINE_MEGA_MAX_TOTAL_MULTIPLIER,
        stored.baseTotalMultiplier + freeSpinWinMultiplier,
      ),
    ),
  };
}

function selectCaishenFreeFeaturesForControl(
  natural: HotlineMegaFeatureResult,
  control: ControlOutcome,
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  freeCount: number,
  freeMul: number,
  baseAmount: Prisma.Decimal,
  stakeAmount: Prisma.Decimal,
  stored: PendingCaishenFreeDecision,
): { features: HotlineMegaFeatureResult; control: ControlOutcome } {
  if (!control.controlled || freeCount <= 0) {
    const payout = baseAmount
      .mul(natural.totalMultiplier)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    const multiplier = stakeAmount.greaterThan(0)
      ? payout.div(stakeAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
      : new Prisma.Decimal(0);
    return {
      features: natural,
      control: { ...control, won: payout.greaterThan(stakeAmount), payout, multiplier },
    };
  }
  const candidates = [natural];
  for (let attempt = 0; attempt < (control.won ? 128 : 40); attempt += 1) {
    candidates.push(
      withPendingCaishenBase(
        stored,
        hotlineSelectCaishenFreeGame(
          serverSeed,
          `${clientSeed}:controlled-candidate:${attempt}`,
          nonce,
          freeCount,
          freeMul,
        ),
      ),
    );
  }
  const desired = candidates.filter((features) => {
    const payout = baseAmount
      .mul(features.totalMultiplier)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    const multiplier = stakeAmount.greaterThan(0)
      ? payout.div(stakeAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
      : new Prisma.Decimal(0);
    if (payout.greaterThan(stakeAmount) !== control.won) return false;
    return multiplierMatchesControlBounds(multiplier, stakeAmount, control);
  });
  let features = pickRandomBest(desired, (candidate) => {
    const payout = baseAmount.mul(candidate.totalMultiplier);
    const multiplier = stakeAmount.greaterThan(0) ? payout.div(stakeAmount) : new Prisma.Decimal(0);
    return multiplier.minus(control.multiplier).abs().toNumber();
  });
  let effectiveControl = control;
  if (!features) {
    features = withPendingCaishenBase(
      stored,
      emptyCaishenFreeFeatures(stored, freeCount, freeMul, nonce),
    );
    if (!baseAmount.mul(features.totalMultiplier).greaterThan(stakeAmount)) {
      effectiveControl = forceControlOutcomeToLoss(control);
    }
  }
  const payout = baseAmount
    .mul(features.totalMultiplier)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const multiplier = stakeAmount.greaterThan(0)
    ? payout.div(stakeAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
    : new Prisma.Decimal(0);
  return {
    features,
    control: {
      ...effectiveControl,
      won: payout.greaterThan(stakeAmount),
      payout,
      multiplier,
    },
  };
}

function caishenDecisionResultData(
  stored: PendingCaishenFreeDecision,
  features: HotlineMegaFeatureResult,
  controlled: boolean,
  flipReason: string | null,
  raw: unknown = null,
): Record<string, unknown> {
  return {
    grid: stored.triggerGrid,
    lines: stored.triggerLines,
    cascades: stored.triggerCascades,
    features,
    buyFeature: stored.buyFeature,
    enhancedBet: false,
    baseAmount: stored.baseAmount,
    stakeAmount: stored.stakeAmount,
    controlled,
    flipReason,
    raw,
  };
}

async function createPendingSourceFreeModeSelection(
  tx: Prisma.TransactionClient,
  userId: string,
  gameId: string,
  baseAmount: Prisma.Decimal,
  stakeAmount: Prisma.Decimal,
  seed: ActiveSeedBundle,
  generatedFeatures: HotlineMegaFeatureResult,
): Promise<HotlineBetResult> {
  const triggerGrid = blankHotlineGrid(gameId, seed.nonce + 809);
  const triggerSymbolCount = gameId === 'h5-lucky-777' ? 3 : 5;
  const scatterSymbols = generatedFeatures.scatterSymbols
    .slice(0, triggerSymbolCount)
    .map((symbol) => ({ ...symbol }));
  const triggerFeatures = buildPendingSourceTriggerFeatures(gameId, scatterSymbols);
  const stored: PendingBountyFreeModeSelection = {
    kind: 'h5-bounty-free-selection',
    stage: 'AWAITING_SELECTION',
    triggerGrid,
    scatterSymbols,
    baseAmount: baseAmount.toFixed(2),
    stakeAmount: stakeAmount.toFixed(2),
  };
  const bet = await tx.bet.create({
    data: {
      userId,
      gameId,
      amount: stakeAmount,
      multiplier: new Prisma.Decimal(0),
      payout: new Prisma.Decimal(0),
      profit: stakeAmount.negated(),
      nonce: seed.nonce,
      clientSeedUsed: seed.clientSeed,
      serverSeedId: seed.serverSeedId,
      resultData: stored as unknown as Prisma.InputJsonValue,
      status: 'PENDING',
    },
  });
  const newBalance = await debitAndRecord(tx, userId, stakeAmount, bet.id);

  return {
    betId: bet.id,
    grid: triggerGrid,
    lines: [],
    cascades: [],
    features: triggerFeatures,
    baseAmount: baseAmount.toFixed(2),
    stakeAmount: stakeAmount.toFixed(2),
    multiplier: 0,
    amount: stakeAmount.toFixed(2),
    payout: '0.00',
    profit: stakeAmount.negated().toFixed(2),
    newBalance: newBalance.toFixed(2),
    nonce: seed.nonce,
    serverSeedHash: seed.serverSeedHash,
    clientSeed: seed.clientSeed,
    requiresFreeModeSelection: true,
  };
}

function buildPendingSourceTriggerFeatures(
  gameId: string,
  scatterSymbols: HotlineSpecialSymbol[],
): HotlineMegaFeatureResult {
  const copiedScatter = scatterSymbols.map((symbol) => ({ ...symbol }));
  return {
    scatterSymbols: copiedScatter,
    scatterCount: copiedScatter.length,
    freeSpinsAwarded: getSourceFreeModeSpinCount(gameId, 1),
    freeSpinsPlayed: 0,
    baseWinMultiplier: 0,
    baseMultiplierSymbols: [],
    baseMultiplierTotal: 0,
    baseAppliedMultiplier: 1,
    baseTotalMultiplier: 0,
    freeSpinRounds: [],
    freeSpinMultiplierBank: 0,
    freeSpinWinMultiplier: 0,
    totalMultiplier: 0,
  };
}

function getSourceFreeModeSpinCount(gameId: string, sourceFreeModeType: number): number {
  const modes = getH5OriginalGameSpec(gameId)?.freeModes ?? [];
  return (
    modes.find((mode) => mode.type === Math.trunc(sourceFreeModeType))?.spins ??
    modes[0]?.spins ??
    0
  );
}

function normalizeSourceFreeModeType(gameId: string, requested: number): number {
  const normalized = Math.trunc(requested);
  const modes = getH5OriginalGameSpec(gameId)?.freeModes ?? [];
  return modes.some((mode) => mode.type === normalized) ? normalized : (modes[0]?.type ?? 1);
}

function parsePendingBountyFreeModeSelection(
  value: Prisma.JsonValue,
): PendingBountyFreeModeSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('INVALID_ACTION', '免費遊戲待選資料不完整');
  }
  const data = value as Record<string, unknown>;
  if (
    data.kind !== 'h5-bounty-free-selection' ||
    data.stage !== 'AWAITING_SELECTION' ||
    !Array.isArray(data.triggerGrid) ||
    !Array.isArray(data.scatterSymbols) ||
    typeof data.baseAmount !== 'string' ||
    typeof data.stakeAmount !== 'string'
  ) {
    throw new ApiError('INVALID_ACTION', '免費遊戲待選資料不完整');
  }
  return data as unknown as PendingBountyFreeModeSelection;
}

function withSourceTriggerSymbols(
  features: HotlineMegaFeatureResult,
  scatterSymbols: HotlineSpecialSymbol[],
): HotlineMegaFeatureResult {
  return {
    ...features,
    scatterSymbols: scatterSymbols.map((symbol) => ({ ...symbol })),
    scatterCount: scatterSymbols.length,
  };
}

function emptyBountyFreeModeFeatures(
  gameId: string,
  sourceFreeModeType: number,
  variant: number,
  scatterSymbols: HotlineSpecialSymbol[],
): HotlineMegaFeatureResult {
  const freeSpinsAwarded = getSourceFreeModeSpinCount(gameId, sourceFreeModeType);
  const sourceFreeWinMultiplier =
    getH5OriginalGameSpec(gameId)?.freeModes?.find((mode) => mode.type === sourceFreeModeType)
      ?.cascadeMultipliers[0] ?? 1;
  const freeSpinRounds = Array.from({ length: freeSpinsAwarded }, (_, index) =>
    blankControlledFreeSpinRound(index, blankHotlineGrid(gameId, variant + 901 + index * 53)),
  );
  return {
    scatterSymbols: scatterSymbols.map((symbol) => ({ ...symbol })),
    scatterCount: scatterSymbols.length,
    freeSpinsAwarded,
    freeSpinsPlayed: freeSpinRounds.length,
    baseWinMultiplier: 0,
    baseMultiplierSymbols: [],
    baseMultiplierTotal: 0,
    baseAppliedMultiplier: 1,
    baseTotalMultiplier: 0,
    freeSpinRounds,
    freeSpinMultiplierBank: gameId === 'h5-lucky-777' ? sourceFreeWinMultiplier : 0,
    freeSpinWinMultiplier: 0,
    totalMultiplier: 0,
    sourceFreeModeType,
    ...(gameId === 'h5-lucky-777' ? { sourceFreeWinMultiplier } : {}),
  };
}

function generateSelectedSourceFreeMode(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  gameId: string,
  sourceFreeModeType: number,
): HotlineMegaFeatureResult {
  return gameId === 'h5-lucky-777'
    ? hotlineSelectLucky777FreeMode(serverSeed, clientSeed, nonce, sourceFreeModeType)
    : hotlineSelectBountyFreeMode(serverSeed, clientSeed, nonce, gameId, sourceFreeModeType);
}

function selectBountyFreeFeaturesForControl(
  natural: HotlineMegaFeatureResult,
  control: ControlOutcome,
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  gameId: string,
  sourceFreeModeType: number,
  baseAmount: Prisma.Decimal,
  stakeAmount: Prisma.Decimal,
  scatterSymbols: HotlineSpecialSymbol[],
): { features: HotlineMegaFeatureResult; control: ControlOutcome } {
  if (!control.controlled) return { features: natural, control };

  const maximumAccountingMultiplier = stakeAmount.greaterThan(0)
    ? baseAmount
        .mul(HOTLINE_MEGA_MAX_TOTAL_MULTIPLIER)
        .div(stakeAmount)
        .toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
    : new Prisma.Decimal(0);
  if (
    control.won &&
    control.minMultiplier &&
    control.minMultiplier.greaterThan(maximumAccountingMultiplier)
  ) {
    const features = emptyBountyFreeModeFeatures(gameId, sourceFreeModeType, nonce, scatterSymbols);
    return {
      features,
      control: forceControlOutcomeToLoss(control),
    };
  }

  const candidates: HotlineMegaFeatureResult[] = [natural];
  const attemptCount = control.won ? 128 : 32;
  for (let attempt = 0; attempt < attemptCount; attempt += 1) {
    candidates.push(
      withSourceTriggerSymbols(
        generateSelectedSourceFreeMode(
          serverSeed,
          `${clientSeed}:controlled-candidate:${attempt}`,
          nonce,
          gameId,
          sourceFreeModeType,
        ),
        scatterSymbols,
      ),
    );
  }

  const desired = candidates.filter((features) => {
    const payout = baseAmount
      .mul(features.totalMultiplier)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    const multiplier = stakeAmount.greaterThan(0)
      ? payout.div(stakeAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
      : new Prisma.Decimal(0);
    const won = payout.greaterThan(stakeAmount);
    if (won !== control.won) return false;
    return control.won
      ? multiplierMatchesControlBounds(multiplier, stakeAmount, control)
      : multiplierMatchesControlBounds(multiplier, stakeAmount, {
          maxMultiplier: control.maxMultiplier,
          maxPayout: control.maxPayout,
        });
  });

  let effectiveControl = control;
  let features = pickRandomBest(desired, (candidate) => {
    const payout = baseAmount.mul(candidate.totalMultiplier);
    const multiplier = stakeAmount.greaterThan(0) ? payout.div(stakeAmount) : new Prisma.Decimal(0);
    return multiplier.minus(control.multiplier).abs().toNumber();
  });
  if (!features) {
    features = emptyBountyFreeModeFeatures(gameId, sourceFreeModeType, nonce, scatterSymbols);
    effectiveControl = forceControlOutcomeToLoss(control);
  }

  const payout = baseAmount
    .mul(features.totalMultiplier)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const multiplier = stakeAmount.greaterThan(0)
    ? payout.div(stakeAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
    : new Prisma.Decimal(0);
  return {
    features,
    control: {
      ...effectiveControl,
      won: payout.greaterThan(stakeAmount),
      multiplier,
      payout,
    },
  };
}

function bountySelectionResultData(
  stored: PendingBountyFreeModeSelection,
  features: HotlineMegaFeatureResult,
  controlled: boolean,
  flipReason: string | null,
  raw: unknown = null,
): Record<string, unknown> {
  return {
    grid: stored.triggerGrid,
    lines: [],
    cascades: [],
    features,
    buyFeature: false,
    enhancedBet: false,
    baseAmount: stored.baseAmount,
    stakeAmount: stored.stakeAmount,
    controlled,
    flipReason,
    raw,
  };
}

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

function getHotlineSymbolIndexes(gameId?: string): number[] {
  return getHotlineSymbolsForGame(gameId).map((_symbol, index) => index);
}

function getHotlineSoftWinSymbols(gameId?: string): number[] {
  const symbols = getHotlineSymbolIndexes(gameId).slice(1);
  if (gameId === 'h5-diamond-strike') {
    return symbols.filter((symbol) => symbol !== 6 && symbol !== 8);
  }
  if (gameId === 'h5-yu-pu-tuan') {
    // Wild and Scatter are presentation features, not ordinary targets for a
    // controlled fixed-line win. Premium dress/shoes/lady remain valid.
    return symbols.filter((symbol) => symbol !== 8 && symbol !== 9);
  }
  if (gameId === 'h5-fruit-little-mary') {
    return symbols.filter((symbol) => symbol < 8);
  }
  if (gameId === 'h5-fire-88') {
    return symbols.filter((symbol) => symbol < 6);
  }
  if (gameId === 'h5-lucky-777') {
    return symbols.filter((symbol) => symbol < 8);
  }
  if (gameId === 'h5-caishen-fa-fa-fa') {
    return symbols.filter((symbol) => symbol < 8);
  }
  return symbols;
}

function megaBuyFeatureStakeAmount(
  baseAmount: Prisma.Decimal,
  costMultiplier = HOTLINE_MEGA_BUY_FEATURE_COST_MULTIPLIER,
  maxStake: Prisma.Decimal.Value | null = MEGA_BUY_FEATURE_MAX_STAKE,
): Prisma.Decimal {
  const exactStake = baseAmount.mul(costMultiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  return maxStake == null
    ? exactStake
    : Prisma.Decimal.min(exactStake, new Prisma.Decimal(maxStake)).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_DOWN,
      );
}

function sourceStakeAmount(
  baseAmount: Prisma.Decimal,
  stakeMultiplier: Prisma.Decimal.Value = 1,
): Prisma.Decimal {
  return baseAmount.mul(stakeMultiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
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
  gameId: string = GameId.THUNDER_SLOT,
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
  const triggerOnlyFeature =
    !buyFeature && features.freeSpinsAwarded > 0 && features.baseTotalMultiplier <= 0;
  const rebuildCappedFeatures = (displayMultiplier: number) =>
    triggerOnlyFeature
      ? buildTriggeredControlledMegaFeature(displayMultiplier, nonce, gameId)
      : buildControlledMegaFeature(displayMultiplier, buyFeature, nonce, undefined, gameId);
  let cappedFeatures = rebuildCappedFeatures(featureDisplayMultiplier);
  let featurePayout = baseAmount
    .mul(cappedFeatures.totalMultiplier)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  for (
    let attempts = 0;
    featurePayout.greaterThan(hardMaxPayout) && featureDisplayMultiplier > 0 && attempts < 100;
    attempts += 1
  ) {
    featureDisplayMultiplier = roundFeatureMultiplier(featureDisplayMultiplier - 0.0001);
    cappedFeatures = rebuildCappedFeatures(featureDisplayMultiplier);
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
  featureGameOrRowCount: boolean | number,
  features: HotlineMegaFeatureResult | undefined,
  buyFeature: boolean,
  control: Pick<ControlOutcome, 'controlled'>,
): boolean {
  const featureGame =
    typeof featureGameOrRowCount === 'number' ? featureGameOrRowCount > 3 : featureGameOrRowCount;
  return Boolean(
    featureGame && features && features.freeSpinsAwarded > 0 && (buyFeature || control.controlled),
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
  return control.controlled && control.won;
}

function shouldPreserveControlledMegaFreeGameTarget(
  control: Pick<ControlOutcome, 'controlled' | 'won' | 'flipReason'>,
): boolean {
  return control.controlled && control.won;
}

function deterministicFraction(seed: number, salt: number): number {
  const x = Math.sin((seed + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function scaleControlForSourcePresentation(
  control: ControlOutcome,
  stakeMultiplier: number,
  featureMultiplier: number,
): ControlOutcome {
  const scale = new Prisma.Decimal(stakeMultiplier).div(featureMultiplier);
  return {
    ...control,
    multiplier: control.multiplier.mul(scale),
    payout: control.payout.div(featureMultiplier),
    ...(control.minMultiplier ? { minMultiplier: control.minMultiplier.mul(scale) } : {}),
    ...(control.maxMultiplier ? { maxMultiplier: control.maxMultiplier.mul(scale) } : {}),
    ...(control.maxPayout ? { maxPayout: control.maxPayout.div(featureMultiplier) } : {}),
  };
}

function decorateFortuneGemsRound(
  round: HotlineRound,
  multiplier: number,
  enhancedBet: boolean,
): HotlineRound {
  const multiplierIndex = [1, 2, 3, 5, 10, 15].indexOf(multiplier);
  const lines = round.lines.map((line) => ({
    ...line,
    payout: roundFeatureMultiplier(line.payout * multiplier),
  }));
  const totalMultiplier = roundFeatureMultiplier(round.totalMultiplier * multiplier);
  return {
    ...round,
    lines,
    totalMultiplier,
    sourceFeature: {
      type: 'fortune-gems-multiplier',
      multiplierIndex: Math.max(0, multiplierIndex),
      multiplier,
      enhancedBet,
      winEx: totalMultiplier > 0,
    },
  };
}

function decorateAztecGemsRound(
  round: HotlineRound,
  multiplier: (typeof FORTUNE_GEMS_MULTIPLIERS)[number],
): HotlineRound {
  const multiplierIndex = FORTUNE_GEMS_MULTIPLIERS.indexOf(multiplier);
  const lines = round.lines.map((line) => ({
    ...line,
    payout: roundFeatureMultiplier(line.payout * multiplier),
  }));
  return {
    ...round,
    lines,
    totalMultiplier: roundFeatureMultiplier(round.totalMultiplier * multiplier),
    sourceFeature: {
      type: 'aztec-gems-multiplier',
      multiplierIndex: Math.max(0, multiplierIndex),
      multiplier,
    },
  };
}

function roundFeatureMultiplier(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, value).toFixed(4));
}

function star97LineProgress(lines: readonly HotlineWinLine[]): Star97Progress {
  return lines.reduce<Star97Progress>(
    (progress, line) => {
      if (line.lineId === 'full-screen' || line.count !== 3) return progress;
      if (line.symbol === 0) progress.cherryLineWins += 1;
      if (line.symbol === 3) progress.bellLineWins += 1;
      return progress;
    },
    { ...EMPTY_STAR_97_PROGRESS },
  );
}

function advanceStar97Progress(
  current: Star97Progress,
  lines: readonly HotlineWinLine[],
): { progress: Star97Progress; freeSpinsAwarded: number } {
  const gained = star97LineProgress(lines);
  const cherryLineWins = current.cherryLineWins + gained.cherryLineWins;
  const bellLineWins = current.bellLineWins + gained.bellLineWins;
  const cherryAwards = Math.floor(cherryLineWins / 7);
  const bellAwards = Math.floor(bellLineWins / 5);
  return {
    progress: {
      cherryLineWins: cherryLineWins % 7,
      bellLineWins: bellLineWins % 5,
    },
    freeSpinsAwarded: cherryAwards + bellAwards,
  };
}

function decorateStar97Round(
  round: HotlineRound,
  startingProgress: Star97Progress,
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  variant = 0,
): HotlineRound {
  const baseProgress = advanceStar97Progress(startingProgress, round.lines);
  let progress = baseProgress.progress;
  let pendingFreeSpins = baseProgress.freeSpinsAwarded;
  const freeSpinRounds: HotlineFreeSpinRound[] = [];

  // A free game may itself complete either source counter. Keep a defensive
  // cap around the deterministic continuation chain even though reaching it
  // would require an implausibly long sequence of repeated triple lines.
  for (let index = 0; index < pendingFreeSpins && index < 32; index += 1) {
    const sourceRound = hotlineSpinSourceFeatureRound(
      serverSeed,
      `${clientSeed}:star97-free:${variant}:${index}`,
      nonce,
      'h5-star-97',
      3,
      3,
    );
    const advanced = advanceStar97Progress(progress, sourceRound.lines);
    progress = advanced.progress;
    pendingFreeSpins += advanced.freeSpinsAwarded;
    freeSpinRounds.push({
      index,
      initialGrid: sourceRound.initialGrid,
      finalGrid: sourceRound.finalGrid,
      cascades: [],
      lines: sourceRound.lines,
      baseMultiplier: sourceRound.totalMultiplier,
      scatterSymbols: [],
      multiplierSymbols: [],
      multiplierTotal: 0,
      appliedMultiplier: 1,
      totalMultiplier: sourceRound.totalMultiplier,
      extraFreeSpinsAwarded: advanced.freeSpinsAwarded,
      ...(sourceRound.sourceFeature ? { sourceFeature: sourceRound.sourceFeature } : {}),
    });
  }

  const totalMultiplier = roundFeatureMultiplier(
    round.totalMultiplier +
      freeSpinRounds.reduce((sum, freeRound) => sum + freeRound.totalMultiplier, 0),
  );
  const features: HotlineMegaFeatureResult | undefined =
    freeSpinRounds.length > 0
      ? {
          scatterSymbols: [],
          scatterCount: 0,
          freeSpinsAwarded: freeSpinRounds.length,
          freeSpinsPlayed: freeSpinRounds.length,
          baseWinMultiplier: round.totalMultiplier,
          baseMultiplierSymbols: [],
          baseMultiplierTotal: 0,
          baseAppliedMultiplier: 1,
          baseTotalMultiplier: round.totalMultiplier,
          freeSpinRounds,
          freeSpinMultiplierBank: 0,
          freeSpinWinMultiplier: roundFeatureMultiplier(
            freeSpinRounds.reduce((sum, freeRound) => sum + freeRound.totalMultiplier, 0),
          ),
          totalMultiplier,
          sourceFreeModeType: 1,
          sourceFreeWinMultiplier: 1,
        }
      : undefined;

  return {
    ...round,
    ...(features ? { features } : {}),
    totalMultiplier,
    star97Progress: progress,
  };
}

function storedStar97Progress(resultData: Prisma.JsonValue): Star97Progress {
  if (!resultData || Array.isArray(resultData) || typeof resultData !== 'object') {
    return { ...EMPTY_STAR_97_PROGRESS };
  }
  const raw = (resultData as Record<string, Prisma.JsonValue>).star97Progress;
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') {
    return { ...EMPTY_STAR_97_PROGRESS };
  }
  const stored = raw as Record<string, Prisma.JsonValue>;
  return {
    cherryLineWins: Math.max(0, Math.min(6, Math.trunc(Number(stored.cherryLineWins ?? 0)) || 0)),
    bellLineWins: Math.max(0, Math.min(4, Math.trunc(Number(stored.bellLineWins ?? 0)) || 0)),
  };
}

async function loadStar97Progress(
  tx: Prisma.TransactionClient,
  userId: string,
  stakeAmount: Prisma.Decimal,
): Promise<Star97Progress> {
  const previous = await tx.bet.findFirst({
    where: { userId, gameId: 'h5-star-97', status: 'SETTLED' },
    orderBy: { createdAt: 'desc' },
    select: { amount: true, resultData: true },
  });
  if (!previous || !previous.amount.equals(stakeAmount)) return { ...EMPTY_STAR_97_PROGRESS };
  return storedStar97Progress(previous.resultData);
}

function buildHotlineRound(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  gameId: string,
  reelCount: number,
  rowCount: number,
  buyFeature = false,
  sourceFeatureMode?: HotlineSourceFeatureMode,
  sourceFreeModeType = 1,
): HotlineRound {
  if (isHotlineSourceFeatureGame(gameId)) {
    const sourceRound = hotlineSpinSourceFeatureRound(
      serverSeed,
      clientSeed,
      nonce,
      gameId,
      reelCount,
      rowCount,
      sourceFeatureMode,
    );
    return {
      grid: sourceRound.finalGrid,
      lines: sourceRound.lines,
      cascades: sourceRound.cascades,
      ...(sourceRound.sourceFeature ? { sourceFeature: sourceRound.sourceFeature } : {}),
      totalMultiplier: sourceRound.totalMultiplier,
    };
  }
  if (buyFeature || isHotlineCascadeGame(gameId) || isHotlineFeatureGame(gameId)) {
    const cascaded = buyFeature
      ? hotlineBuyFreeSpins(serverSeed, clientSeed, nonce, reelCount, rowCount, undefined, gameId)
      : hotlineSpinCascades(
          serverSeed,
          clientSeed,
          nonce,
          reelCount,
          rowCount,
          isHotlineCascadeGame(gameId) ? undefined : 1,
          isHotlineFeatureGame(gameId),
          gameId,
          sourceFreeModeType,
        );
    return {
      grid: cascaded.finalGrid,
      lines: cascaded.lines,
      cascades: cascaded.cascades,
      ...(cascaded.features ? { features: cascaded.features } : {}),
      ...(cascaded.finalGoldPositions ? { finalGoldPositions: cascaded.finalGoldPositions } : {}),
      ...(cascaded.finalSourceStacks ? { finalSourceStacks: cascaded.finalSourceStacks } : {}),
      totalMultiplier: cascaded.totalMultiplier,
    };
  }

  const grid = hotlineSpin(serverSeed, clientSeed, nonce, reelCount, rowCount, gameId);
  const evaluated = hotlineEvaluate(grid, gameId);
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

function selectControlledHotlineRound(
  gameId: string,
  stakeAmount: Prisma.Decimal,
  visualControl: ControlOutcome,
  effectiveControl: ControlOutcome,
  variant = 0,
  transformRound?: (round: HotlineRound, variant: number) => HotlineRound,
): {
  round: HotlineRound;
  effectiveControl: ControlOutcome;
  fellBackToLoss: boolean;
} {
  if (!visualControl.won) {
    const lossRound = lossHotlineRound(gameId, stakeAmount, variant, visualControl);
    return {
      round: transformRound ? transformRound(lossRound, variant) : lossRound,
      effectiveControl,
      fellBackToLoss: false,
    };
  }

  const winningRound = strictWinningHotlineRound(
    gameId,
    stakeAmount,
    visualControl,
    variant,
    transformRound,
  );
  if (winningRound) {
    return { round: winningRound, effectiveControl, fellBackToLoss: false };
  }

  // Never release an unreachable controlled win back to the natural result: a
  // natural large payout could cross the same principal/deposit/cap boundary
  // that made the requested win impossible to represent on this paytable.
  const guardedControl = forceControlOutcomeToLoss(effectiveControl);
  const lossRound = lossHotlineRound(gameId, stakeAmount, variant, guardedControl);
  return {
    round: transformRound ? transformRound(lossRound, variant) : lossRound,
    effectiveControl: guardedControl,
    fellBackToLoss: true,
  };
}

function strictWinningHotlineRound(
  gameId: string,
  amount: Prisma.Decimal,
  controlled: HotlineControlBounds,
  variant = 0,
  transformRound?: (round: HotlineRound, variant: number) => HotlineRound,
): HotlineRound | null {
  const reelCount = getHotlineReelCount(gameId);
  const rowCount = getHotlineRowCount(gameId);
  if (usesHotlineWaysEvaluation(gameId)) {
    return winningMegaHotlineRound(gameId, amount, controlled, variant);
  }

  const classicPool = classicWinCandidateRounds(gameId, variant);
  const sourcePool = isHotlineCascadeGame(gameId)
    ? classicPool.map((round, index) =>
        roundFromMegaGrid(gameId, round.grid, variant + index * 29, false),
      )
    : classicPool;
  const pool = transformRound
    ? sourcePool.map((round, index) => transformRound(round, variant + index * 29))
    : sourcePool;
  const targetMultiplier = targetControlMultiplier(controlled);
  const bounded = pool.filter(
    (candidate) =>
      candidate.totalMultiplier > 1 &&
      multiplierMatchesControlBounds(candidate.totalMultiplier, amount, controlled),
  );
  if (controlled.flipReason === 'burst_win') {
    return pickHighestMultiplier(bounded) ?? null;
  }
  return (
    pickRandomBest(bounded, (candidate) => {
      const distance = Math.abs(candidate.totalMultiplier - targetMultiplier);
      return distance * 1000 + candidate.totalMultiplier / 1_000_000;
    }) ?? null
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
  if (controlled.flipReason === 'burst_win') {
    // Mega/ways burst rounds use the picked board only as the legal visual
    // seed; shapeMegaBurstRound then builds the scatter/free-game sequence at
    // the requested bounded multiplier. A seed below the requested minimum is
    // therefore valid as long as it is below every hard ceiling.
    const underCeiling = candidates.filter(
      (candidate) =>
        candidate.totalMultiplier > 1 &&
        multiplierMatchesControlBounds(candidate.totalMultiplier, amount, {
          maxMultiplier: controlled.maxMultiplier,
          maxPayout: controlled.maxPayout,
        }),
    );
    const picked = pickHighestMultiplier(bounded) ?? pickHighestMultiplier(underCeiling);
    if (picked) {
      return isHotlineFeatureGame(gameId)
        ? shapeMegaBurstRound(gameId, picked, amount, controlled, variant)
        : picked;
    }
    return null;
  }
  return (
    pickRandomBest(bounded, (candidate) => {
      const distance = Math.abs(candidate.totalMultiplier - targetMultiplier);
      return distance * 1000 + candidate.totalMultiplier / 1_000_000;
    }) ?? null
  );
}

function classicWinCandidateRounds(gameId: string, variant = 0): HotlineRound[] {
  const reelCount = getHotlineReelCount(gameId);
  const rowCount = getHotlineRowCount(gameId);
  const softWinSymbols = getHotlineSoftWinSymbols(gameId);
  const runLengths = reelCount >= 5 ? ([3, 4, 5] as const) : ([3] as const);
  const rounds: HotlineRound[] = [];

  for (const runLength of runLengths) {
    softWinSymbols.forEach((symbol, index) => {
      rounds.push(
        roundFromClassicGrid(
          fixedLineHotlineGrid(reelCount, [symbol], variant + index, runLength, rowCount, gameId),
          gameId,
        ),
      );
    });
  }

  const comboSets: readonly (readonly number[])[] = [
    [4, 5],
    [5, 6],
    [6, 7],
    [4, 5, 6],
    [5, 6, 7],
  ].filter((symbols) => symbols.every((symbol) => softWinSymbols.includes(symbol)));
  comboSets.forEach((symbols, index) => {
    const runLength = reelCount >= 5 ? 5 : 3;
    rounds.push(
      roundFromClassicGrid(
        fixedLineHotlineGrid(
          reelCount,
          symbols,
          variant + 100 + index * 17,
          runLength,
          rowCount,
          gameId,
        ),
        gameId,
      ),
    );
  });

  softWinSymbols.forEach((symbol, index) => {
    rounds.push(
      roundFromClassicGrid(fullScreenClassicGrid(gameId, symbol, variant + 301 + index), gameId),
    );
  });

  if (gameId === 'h5-aztec-treasure') {
    return dedupeHotlineRounds(
      rounds.flatMap((round) =>
        FORTUNE_GEMS_MULTIPLIERS.map((multiplier) => decorateAztecGemsRound(round, multiplier)),
      ),
    );
  }
  return dedupeHotlineRounds(rounds);
}

function megaWinCandidateRounds(gameId: string, variant = 0): HotlineRound[] {
  const rounds: HotlineRound[] = [];
  const reelCount = getHotlineReelCount(gameId);
  const rowCount = getHotlineRowCount(gameId);
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
        roundFromWaysOrMegaGrid(
          gameId,
          megaClusterHotlineGrid(
            symbols,
            variant + clusterCount * 100 + index * 13,
            clusterCount,
            reelCount,
            rowCount,
            gameId,
          ),
          variant + clusterCount * 100 + index * 13,
        ),
      );
    });
  }

  HOTLINE_SOFT_WIN_SYMBOLS.forEach((symbol, index) => {
    rounds.push(
      roundFromWaysOrMegaGrid(
        gameId,
        fullScreenMegaGrid(symbol, reelCount, rowCount, gameId),
        variant + 701 + index,
      ),
    );
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
      maxAllowedMegaBurstMultiplier(gameId, amount, controlled),
    ),
  );
  const shapedMultiplier = roundFeatureMultiplier(targetMultiplier);
  const features = buildTriggeredControlledMegaFeature(shapedMultiplier, variant, gameId);
  return {
    grid: blankHotlineGrid(gameId, variant + 404),
    lines: [],
    cascades: [],
    features,
    totalMultiplier: features.totalMultiplier,
  };
}

function maxAllowedMegaBurstMultiplier(
  gameId: string,
  amount: Prisma.Decimal,
  controlled: HotlineControlBounds,
): number {
  const values = [new Prisma.Decimal(getHotlineMaximumTotalMultiplier(gameId))];
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

function softLossHotlineRound(gameId: string, variant = 0): HotlineRound {
  const reelCount = getHotlineReelCount(gameId);
  const rowCount = getHotlineRowCount(gameId);
  if (gameId === 'h5-star-97') {
    const grid = blankHotlineGrid(gameId, variant);
    const edgePositions = [
      { reel: 0, row: 1 },
      { reel: 1, row: 0 },
      { reel: 2, row: 1 },
      { reel: 1, row: 2 },
    ] as const;
    const position = edgePositions[Math.abs(variant) % edgePositions.length]!;
    grid[position.reel]![position.row] = 0;
    return roundFromClassicGrid(grid, gameId);
  }
  if (usesHotlineWaysEvaluation(gameId)) {
    const minimumCount = getHotlineEvaluationMode(gameId) === 'cluster' ? 4 : 3;
    const candidates = HOTLINE_SOFT_LOSS_SYMBOLS.flatMap((symbol, symbolIndex) =>
      Array.from({ length: 9 - minimumCount }, (_, offset) => minimumCount + offset).map(
        (count) => {
          const roundVariant = variant + symbolIndex * 101 + count * 17;
          return roundFromWaysOrMegaGrid(
            gameId,
            megaClusterHotlineGrid([symbol], roundVariant, count, reelCount, rowCount, gameId),
            roundVariant,
          );
        },
      ),
    ).filter((round) => round.totalMultiplier > 0 && round.totalMultiplier < 1);
    return (
      candidates[Math.abs(variant) % Math.max(1, candidates.length)] ??
      hardLossHotlineRound(gameId, variant)
    );
  }

  const symbol =
    pickRandomItem(HOTLINE_SOFT_LOSS_SYMBOLS) ??
    HOTLINE_SOFT_LOSS_SYMBOLS[Math.abs(variant) % HOTLINE_SOFT_LOSS_SYMBOLS.length]!;
  const grid = fixedLineHotlineGrid(reelCount, [symbol], variant, undefined, rowCount, gameId);
  return isHotlineCascadeGame(gameId)
    ? roundFromMegaGrid(gameId, grid, variant, false)
    : roundFromClassicGrid(grid, gameId);
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
    ...(usesHotlineWaysEvaluation(gameId)
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
  if (usesHotlineWaysEvaluation(gameId)) return [];
  const reelCount = getHotlineReelCount(gameId);
  const rowCount = getHotlineRowCount(gameId);
  return HOTLINE_SOFT_LOSS_SYMBOLS.map((symbol, index) => {
    const roundVariant = variant + index * 23;
    const grid = singleSoftLineClassicGrid(reelCount, symbol, roundVariant, rowCount, gameId);
    return isHotlineCascadeGame(gameId)
      ? roundFromMegaGrid(gameId, grid, roundVariant, false)
      : roundFromClassicGrid(grid, gameId);
  });
}

function singleSoftLineClassicGrid(
  reelCount: number,
  symbol: number,
  variant = 0,
  rowCount = HOTLINE_ROWS,
  gameId?: string,
): number[][] {
  const paylines = getHotlinePaylinesForGame(gameId, reelCount, rowCount);
  const fillers = getHotlineSymbolIndexes(gameId).filter((value) => value !== symbol);
  const reelRows = getHotlineReelRowCounts(gameId, reelCount, rowCount);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const line = paylines[Math.abs(variant + attempt) % Math.min(3, paylines.length)]!;
    const grid: number[][] = Array.from({ length: reelCount }, (_, reel) =>
      Array.from(
        { length: reelRows[reel]! },
        (_, row) => fillers[(variant + attempt * 11 + reel * 5 + row * 3) % fillers.length]!,
      ),
    );
    for (let reel = 0; reel < Math.min(3, reelCount); reel += 1) {
      const row = line.path[reel]!;
      grid[reel]![row] = symbol;
    }
    const evaluated = hotlineEvaluate(grid, gameId);
    if (evaluated.totalMultiplier > 0 && evaluated.totalMultiplier < 1) return grid;
  }

  const grid: number[][] = Array.from({ length: reelCount }, (_, reel) =>
    Array.from(
      { length: reelRows[reel]! },
      (_, row) => fillers[(reel * 3 + row) % fillers.length]!,
    ),
  );
  for (let reel = 0; reel < Math.min(3, reelCount); reel += 1) {
    grid[reel]![0] = symbol;
  }
  return grid;
}

function hardLossHotlineRound(gameId: string, variant = 0): HotlineRound {
  const grid = blankHotlineGrid(gameId, variant);
  return usesHotlineWaysEvaluation(gameId)
    ? roundFromWaysOrMegaGrid(gameId, grid, variant)
    : roundFromClassicGrid(grid, gameId);
}

function targetControlMultiplier(controlled: HotlineControlBounds): number {
  const min = controlled.minMultiplier?.toNumber();
  const max = controlled.maxMultiplier?.toNumber();
  if (min !== undefined && max !== undefined) return (min + max) / 2;
  return min ?? max ?? 2;
}

function roundFromClassicGrid(grid: number[][], gameId?: string): HotlineRound {
  const evaluated = hotlineEvaluate(grid, gameId);
  const sourceFeature =
    gameId === 'h5-fortune-ox' && getFortuneOxFullScreenMultiplier(grid) > 1
      ? {
          type: 'fortune-ox-respin' as const,
          triggered: true,
          respins: 1,
          fullScreenMultiplier: getFortuneOxFullScreenMultiplier(grid),
        }
      : gameId === 'h5-aztec-treasure'
        ? {
            type: 'aztec-gems-multiplier' as const,
            multiplierIndex: 0,
            multiplier: 1 as const,
          }
        : gameId === 'h5-star-97'
          ? {
              type: 'star-97-seven-multiplier' as const,
              sevenCount: grid.flat().filter((symbol) => symbol === 8).length,
              multiplier: getStar97SevenMultiplier(grid),
            }
          : undefined;
  return {
    grid,
    lines: evaluated.lines,
    cascades: [],
    ...(sourceFeature ? { sourceFeature } : {}),
    totalMultiplier: evaluated.totalMultiplier,
  };
}

function roundFromMegaGrid(
  gameId: string,
  initialGrid: number[][],
  variant = 0,
  includeFeatures = true,
): HotlineRound {
  const initialSourceStacks =
    gameId === 'h5-golden-empire' ? buildGoldenEmpireSourceStacks(initialGrid) : undefined;
  const evaluated = hotlineEvaluate(initialGrid, gameId, initialSourceStacks);
  const removed = collectHotlineRoundWinPositions(initialGrid, evaluated.lines);
  let finalGrid = blankHotlineGrid(gameId, variant + 97);
  const cascades: HotlineCascadeStep[] =
    evaluated.lines.length > 0 && removed.length > 0
      ? [
          {
            index: 0,
            grid: initialGrid,
            lines: evaluated.lines,
            multiplier: evaluated.totalMultiplier,
            removed,
            ...(initialSourceStacks ? { sourceStacks: initialSourceStacks } : {}),
            ...(gameId === 'h5-dragon-hatch'
              ? { collectedSymbols: removed.length, collectedThisStep: removed.length }
              : {}),
          },
        ]
      : [];

  if (gameId === 'h5-dragon-hatch' && removed.length >= 10) {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const sourceGrid = blankHotlineGrid(gameId, variant + 97 + attempt * 17);
      let fillIndex = 0;
      const action = applyDragonHatchCollectionAction(
        sourceGrid,
        removed.length,
        new Set(),
        () => 4 + ((variant + attempt + fillIndex++) % 4),
        () => deterministicFraction(variant + attempt, fillIndex + 811),
      );
      if (!action || hotlineEvaluate(action.grid, gameId).totalMultiplier > 0) continue;
      finalGrid = action.grid;
      cascades.push({
        index: cascades.length,
        grid: action.grid,
        lines: [],
        multiplier: 0,
        removed: [],
        sourceGrid,
        sourceAction: action.action,
        collectedSymbols: removed.length,
        collectedThisStep: 0,
      });
      break;
    }
  }

  return {
    grid: finalGrid,
    lines: evaluated.lines,
    cascades,
    ...(gameId === 'h5-golden-empire'
      ? { finalSourceStacks: buildGoldenEmpireSourceStacks(finalGrid) }
      : {}),
    ...(includeFeatures && isHotlineFeatureGame(gameId)
      ? {
          features: buildControlledMegaBaseFeature(
            evaluated.totalMultiplier,
            variant,
            undefined,
            gameId,
          ),
        }
      : {}),
    totalMultiplier: evaluated.totalMultiplier,
  };
}

/**
 * Controlled Golden Empire boards are authored as cells, while the original
 * client renders vertically repeated cells as one large source symbol. Build
 * the same stack contract before evaluating the Ways award so one visible
 * large symbol can never be settled as two or more independent ways.
 */
function buildGoldenEmpireSourceStacks(grid: number[][]): HotlineSourceStack[] {
  const stacks: HotlineSourceStack[] = [];
  let id = 0;
  grid.forEach((column, reel) => {
    for (let row = 0; row < column.length; ) {
      const symbol = column[row]!;
      let end = row + 1;
      while (end < column.length && column[end] === symbol) end += 1;
      stacks.push({
        id,
        symbol,
        positions: Array.from({ length: end - row }, (_, offset) => ({
          reel,
          row: row + offset,
        })),
        state: 'ordinary',
      });
      id += 1;
      row = end;
    }
  });
  return stacks;
}

function roundFromWaysOrMegaGrid(gameId: string, grid: number[][], variant = 0): HotlineRound {
  return isHotlineCascadeGame(gameId)
    ? roundFromMegaGrid(gameId, grid, variant)
    : roundFromClassicGrid(grid, gameId);
}

function blankHotlineGrid(gameId: string, variant = 0): number[][] {
  const reelCount = getHotlineReelCount(gameId);
  const rowCount = getHotlineRowCount(gameId);
  if (gameId === 'h5-star-97') {
    // Star 97 pays even one cherry on any of its horizontal, vertical or
    // diagonal lines. Use a verified no-cherry Latin board so a controlled
    // loss can never acquire an invisible partial-cherry award.
    const patterns = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 1, 2],
    ] as const;
    const offset = Math.abs(variant) % patterns.length;
    return Array.from({ length: 3 }, (_, reel) => {
      const source = patterns[(reel + offset) % patterns.length]!;
      return source.map((symbol) => symbol);
    });
  }
  if (usesHotlineWaysEvaluation(gameId)) {
    return noWinMegaGrid(variant, reelCount, rowCount, gameId);
  }

  const baseGrid = [
    [3, 5, 0],
    [2, 5, 3],
    [2, 3, 4],
    [0, 4, 0],
    [5, 0, 3],
  ].slice(0, reelCount);
  const reelRows = getHotlineReelRowCounts(gameId, reelCount, rowCount);
  return baseGrid.map((column, reel) =>
    Array.from(
      { length: reelRows[reel]! },
      (_, row) => column[row % column.length] ?? (reel + row) % 6,
    ),
  );
}

function noWinMegaGrid(variant: number, reelCount = 6, rowCount = 5, gameId?: string): number[][] {
  if (gameId === 'h5-flying-together') {
    const patterns = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 1, 2],
      [3, 4, 5],
    ] as const;
    const offset = Math.abs(variant) % patterns.length;
    return Array.from({ length: reelCount }, (_, reel) => {
      const source = patterns[(reel + offset) % patterns.length]!;
      return Array.from({ length: rowCount }, (_, row) => source[row % source.length]!);
    });
  }
  if (gameId === 'h5-caishen-wins' || gameId === 'h5-golden-empire') {
    // Three stacked source symbols per reel are enough to make a legal 5-cell
    // column, and these sets have no symbol shared by any three consecutive
    // reels. This guarantees a genuine no-win board without hiding Scatter
    // or blanks in ordinary cells.
    const patterns =
      gameId === 'h5-golden-empire'
        ? ([
            [0, 1, 2],
            [3, 4, 5],
            [0, 6, 7],
            [3, 8, 9],
          ] as const)
        : ([
            [0, 1, 2],
            [0, 3, 4],
            [1, 3, 5],
            [2, 4, 6],
          ] as const);
    const offset = Math.abs(variant) % patterns.length;
    return Array.from({ length: reelCount }, (_, reel) => {
      const source = patterns[(reel + offset) % patterns.length]!;
      return [source[0], source[0], source[1], source[1], source[2]].slice(0, rowCount);
    });
  }
  if (gameId === 'h5-dragon-hatch') {
    // Dragon Hatch uses connected clusters rather than the pay-anywhere count
    // used by the other 6x5 games. This Latin fill keeps every orthogonal
    // neighbour different, including its premium four-symbol award tiers.
    const symbols = getHotlineSymbolIndexes(gameId);
    const normalizedVariant = Math.abs(Math.trunc(variant));
    const offset = normalizedVariant % symbols.length;
    const reelStride = 1 + (Math.floor(normalizedVariant / symbols.length) % (symbols.length - 1));
    return getHotlineReelRowCounts(gameId, reelCount, rowCount).map((rows, reel) =>
      Array.from(
        { length: rows },
        (_, row) => symbols[(offset + reel * reelStride + row * 2) % symbols.length]!,
      ),
    );
  }
  const reelRows = getHotlineReelRowCounts(gameId, reelCount, rowCount);
  const grid = reelRows.map((rows) => Array.from({ length: rows }, () => 0));
  const positions = rankedMegaPositions(
    reelRows.flatMap((rows, reel) => Array.from({ length: rows }, (_, row) => ({ reel, row }))),
    variant + 1201,
  );
  const symbols = shuffledMegaSymbols(variant + 1709, gameId);

  positions.forEach((position, index) => {
    grid[position.reel]![position.row] = symbols[index % symbols.length]!;
  });
  return grid;
}

function shuffledMegaSymbols(variant: number, gameId?: string): number[] {
  return getHotlineSymbolIndexes(gameId).sort(
    (a, b) =>
      deterministicFraction(variant + a * 31, 1301) - deterministicFraction(variant + b * 31, 1301),
  );
}

function fixedLineHotlineGrid(
  reelCount: number,
  symbols: readonly number[],
  variant = 0,
  runLengthOverride?: number,
  rowCount = HOTLINE_ROWS,
  gameId?: string,
): number[][] {
  const targetSymbols = symbols.slice(0, 3);
  const normalizedVariant = Math.abs(variant);
  const symbolsForGrid = getHotlineSymbolsForGame(gameId, reelCount, rowCount);
  const runLength = Math.max(3, Math.min(runLengthOverride ?? 3, reelCount));
  const paylines = getHotlinePaylinesForGame(gameId, reelCount, rowCount);
  const payoutScale = getHotlinePaylinePayoutScale(gameId, paylines.length);
  const expectedMultiplier = targetSymbols.reduce((sum, symbol) => {
    const meta = symbolsForGrid[symbol];
    if (!meta) return sum;
    const payout = runLength >= 5 ? meta.payout5 : runLength === 4 ? meta.payout4 : meta.payout3;
    return sum + payout * payoutScale;
  }, 0);

  for (let attempt = 0; attempt < 160; attempt += 1) {
    const grid = makeClassicNoWinGrid(
      reelCount,
      targetSymbols,
      normalizedVariant + attempt,
      rowCount,
      gameId,
    );
    applyFixedLineTargets(grid, targetSymbols, normalizedVariant + attempt, runLength, gameId);
    const evaluated = hotlineEvaluate(grid, gameId);
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

  const grid = makeClassicNoWinGrid(reelCount, targetSymbols, normalizedVariant, rowCount, gameId);
  applyFixedLineTargets(grid, targetSymbols, normalizedVariant, runLength, gameId);
  return grid;
}

function makeClassicNoWinGrid(
  reelCount: number,
  blockedSymbols: readonly number[],
  variant = 0,
  rowCount = HOTLINE_ROWS,
  gameId?: string,
): number[][] {
  const blocked = new Set(blockedSymbols);
  const symbolIndexes = getHotlineSymbolIndexes(gameId);
  const presentationOnlyBlocked =
    gameId === 'h5-diamond-strike'
      ? new Set([6, 8])
      : gameId === 'h5-yu-pu-tuan'
        ? new Set([8, 9])
        : gameId === 'h5-fruit-little-mary'
          ? new Set([8, 9, 10])
          : gameId === 'h5-fire-88'
            ? new Set([6, 7])
            : gameId === 'h5-lucky-777'
              ? new Set([8])
              : gameId === 'h5-caishen-fa-fa-fa'
                ? new Set([8, 9, 10])
                : new Set<number>();
  const fillers = symbolIndexes.filter(
    (symbol) => !blocked.has(symbol) && !presentationOnlyBlocked.has(symbol),
  );
  const reelRows = getHotlineReelRowCounts(gameId, reelCount, rowCount);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const grid = Array.from({ length: reelCount }, (_, reel) =>
      Array.from(
        { length: reelRows[reel]! },
        (_, row) =>
          fillers[(variant + attempt * 5 + reel * 7 + row * 3 + reel * row * 2) % fillers.length]!,
      ),
    );
    if (hotlineEvaluate(grid, gameId).lines.length === 0) return grid;
  }

  return Array.from({ length: reelCount }, (_, reel) =>
    Array.from({ length: reelRows[reel]! }, (_, row) => {
      const symbol = (reel * rowCount + row) % symbolIndexes.length;
      return blocked.has(symbol) ? fillers[symbol % fillers.length]! : symbol;
    }),
  );
}

function applyFixedLineTargets(
  grid: number[][],
  symbols: readonly number[],
  variant = 0,
  runLengthOverride?: number,
  gameId?: string,
): void {
  const reelCount = grid.length;
  const rowCount = Math.max(...grid.map((column) => column.length), 0);
  const paylines = getHotlinePaylinesForGame(gameId, reelCount, rowCount);
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
  if (usesHotlineWaysEvaluation(gameId)) {
    return fullScreenMegaGrid(symbol, reelCount, rowCount, gameId);
  }
  return getHotlineReelRowCounts(gameId, reelCount, rowCount).map((rows) =>
    Array.from({ length: rows }, () => symbol),
  );
}

function usesHotlineWaysEvaluation(gameId: string): boolean {
  return getHotlineEvaluationMode(gameId) !== 'paylines';
}

function fullScreenMegaGrid(
  symbol: number,
  reelCount = 6,
  rowCount = 5,
  gameId?: string,
): number[][] {
  return getHotlineReelRowCounts(gameId, reelCount, rowCount).map((rows) =>
    Array.from({ length: rows }, () => symbol),
  );
}

function megaClusterHotlineGrid(
  symbols: readonly number[],
  variant = 0,
  countPerSymbol = 8,
  reelCount = 6,
  rowCount = 5,
  gameId?: string,
): number[][] {
  const targetSymbols = symbols.slice(0, 3);
  const blocked = new Set(targetSymbols);
  const fillers = getHotlineSymbolIndexes(gameId).filter(
    (symbol) => !blocked.has(symbol) && !(gameId === 'h5-flying-together' && symbol === 12),
  );
  const reelRows = getHotlineReelRowCounts(gameId, reelCount, rowCount);
  const grid = reelRows.map((rows, reel) =>
    Array.from(
      { length: rows },
      (_, row) => fillers[(variant + reel * rowCount + row) % fillers.length]!,
    ),
  );
  const allPositions = reelRows.flatMap((rows, reel) =>
    Array.from({ length: rows }, (_, row) => ({ reel, row })),
  );
  const clusterPositions =
    gameId === 'h5-dragon-hatch'
      ? reelRows.flatMap((rows, reel) => {
          const orderedRows = Array.from({ length: rows }, (_, row) => row);
          if (reel % 2 === 1) orderedRows.reverse();
          return orderedRows.map((row) => ({ reel, row }));
        })
      : allPositions;
  const used = new Set<string>();

  targetSymbols.forEach((symbol, symbolIndex) => {
    const positions =
      gameId === 'h5-dragon-hatch'
        ? clusterPositions
        : rankedMegaPositions(allPositions, variant + symbolIndex * 101);
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
  gameId: string = GameId.THUNDER_SLOT,
): HotlineMegaFeatureResult {
  const target = roundFeatureMultiplier(totalMultiplier);
  const scatterSymbols = buildControlledScatterSymbols(variant, gameId);
  const caishen = gameId === 'h5-caishen-wins';
  const caishenFaFaFa = gameId === 'h5-caishen-fa-fa-fa';
  const golden = gameId === 'h5-golden-empire';
  const gates = gameId === 'h5-gates-of-olympus';
  const yuPuTuan = gameId === 'h5-yu-pu-tuan';
  const fruitLittleMary = gameId === 'h5-fruit-little-mary';
  const fire88 = gameId === 'h5-fire-88';

  if (buyFeature) {
    const freeSpinData = caishen
      ? buildControlledCaishenFreeSpins(target, variant + 1700)
      : caishenFaFaFa
        ? buildControlledCaishenFaFaFaFreeSpins(target, variant + 1700)
        : golden
          ? buildControlledGoldenEmpireFreeSpins(target, variant + 1700)
          : yuPuTuan
            ? buildControlledYuPuTuanFreeSpins(target, variant + 1700)
            : gates
              ? buildControlledGatesFreeSpins(target, variant + 1700)
              : buildControlledMegaFreeSpins(target, variant + 1700, gameId);
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
      ...(caishen ? { sourceFreeWinMultiplier: 8 } : {}),
      ...(caishenFaFaFa ? { sourceFreeWinMultiplier: 1 } : {}),
    };
  }

  // Caishen Wins has no multiplier-ball mechanic in the base game. A
  // controlled ordinary round must therefore stay an ordinary ways/tumble
  // result; manufacturing a generic 15-spin feature here makes the scene and
  // the source help table disagree even when no Scatter was shown.
  if (
    (caishen || caishenFaFaFa || golden || gates || yuPuTuan || fruitLittleMary || fire88) &&
    baseRound
  ) {
    return {
      scatterSymbols: [],
      scatterCount: 0,
      freeSpinsAwarded: 0,
      freeSpinsPlayed: 0,
      baseWinMultiplier: target,
      baseMultiplierSymbols: [],
      baseMultiplierTotal: 0,
      baseAppliedMultiplier: 1,
      baseTotalMultiplier: target,
      freeSpinRounds: [],
      freeSpinMultiplierBank: 0,
      freeSpinWinMultiplier: 0,
      totalMultiplier: target,
    };
  }

  if (caishenFaFaFa) {
    const freeSpinData = buildControlledCaishenFaFaFaFreeSpins(target, variant + 3100);
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
      freeSpinMultiplierBank: 0,
      freeSpinWinMultiplier: freeSpinData.freeSpinWinMultiplier,
      totalMultiplier: freeSpinData.freeSpinWinMultiplier,
      sourceFreeWinMultiplier: 1,
    };
  }

  // The packaged Yu Pu Tuan client has no generic multiplier-ball mechanic.
  // If a control/cap rebuild needs a feature presentation, compose the target
  // from ten legal source free rounds instead of manufacturing a hidden
  // decimal multiplier that its reels cannot display.
  if (yuPuTuan) {
    const freeSpinData = buildControlledYuPuTuanFreeSpins(target, variant + 3100);
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
      freeSpinMultiplierBank: 0,
      freeSpinWinMultiplier: freeSpinData.freeSpinWinMultiplier,
      totalMultiplier: freeSpinData.freeSpinWinMultiplier,
    };
  }

  const baseWinMultiplier = roundFeatureMultiplier(
    Math.max(0, baseRound?.totalMultiplier ?? Math.min(target, 1.2)),
  );
  const baseShare = 0.18 + deterministicFraction(variant, 41) * 0.24;
  const preferredBaseTotal = roundFeatureMultiplier(Math.min(target, target * baseShare));
  // A controlled Gates result must not invent a hidden multiplier merely to
  // hit an accounting target. Keep the visible base tumble on its source
  // ladder and compose any feature remainder from the same +1 steps.
  const baseTotalMultiplier = gates
    ? baseWinMultiplier
    : roundFeatureMultiplier(Math.min(target, Math.max(baseWinMultiplier, preferredBaseTotal)));
  const baseAppliedMultiplier =
    baseWinMultiplier > 0
      ? roundFeatureMultiplier(Math.max(1, baseTotalMultiplier / baseWinMultiplier))
      : 1;
  const baseMultiplierTotal = baseAppliedMultiplier > 1 ? baseAppliedMultiplier : 0;
  const freeSpinWinTarget = roundFeatureMultiplier(Math.max(0, target - baseTotalMultiplier));
  const freeSpinData =
    freeSpinWinTarget > 0.0001
      ? gates
        ? buildControlledGatesFreeSpins(freeSpinWinTarget, variant + 3100)
        : buildControlledMegaFreeSpins(freeSpinWinTarget, variant + 3100, gameId)
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
      baseMultiplierTotal > 0
        ? buildControlledMultiplierSymbols(baseMultiplierTotal, variant, gameId)
        : [],
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
  gameId: string = GameId.THUNDER_SLOT,
): HotlineMegaFeatureResult {
  const target = roundFeatureMultiplier(totalMultiplier);
  if (
    gameId === 'h5-caishen-wins' ||
    gameId === 'h5-caishen-fa-fa-fa' ||
    gameId === 'h5-golden-empire' ||
    gameId === 'h5-gates-of-olympus' ||
    gameId === 'h5-yu-pu-tuan' ||
    gameId === 'h5-fruit-little-mary' ||
    gameId === 'h5-fire-88'
  ) {
    return {
      scatterSymbols: [],
      scatterCount: 0,
      freeSpinsAwarded: 0,
      freeSpinsPlayed: 0,
      baseWinMultiplier: target,
      baseMultiplierSymbols: [],
      baseMultiplierTotal: 0,
      baseAppliedMultiplier: 1,
      baseTotalMultiplier: target,
      freeSpinRounds: [],
      freeSpinMultiplierBank: 0,
      freeSpinWinMultiplier: 0,
      totalMultiplier: target,
    };
  }
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
      baseMultiplierTotal > 0
        ? buildControlledMultiplierSymbols(baseMultiplierTotal, variant, gameId)
        : [],
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
  gameId: string = GameId.THUNDER_SLOT,
): HotlineMegaFeatureResult {
  const target = roundFeatureMultiplier(totalMultiplier);
  const caishen = gameId === 'h5-caishen-wins';
  const caishenFaFaFa = gameId === 'h5-caishen-fa-fa-fa';
  const golden = gameId === 'h5-golden-empire';
  const gates = gameId === 'h5-gates-of-olympus';
  const yuPuTuan = gameId === 'h5-yu-pu-tuan';
  const fruitLittleMary = gameId === 'h5-fruit-little-mary';
  const freeSpinData = caishen
    ? buildControlledCaishenFreeSpins(target, variant + 3100)
    : caishenFaFaFa
      ? buildControlledCaishenFaFaFaFreeSpins(target, variant + 3100)
      : golden
        ? buildControlledGoldenEmpireFreeSpins(target, variant + 3100)
        : yuPuTuan
          ? buildControlledYuPuTuanFreeSpins(target, variant + 3100)
          : fruitLittleMary
            ? buildControlledFruitLittleMaryFreeSpins(target, variant + 3100)
            : gates
              ? buildControlledGatesFreeSpins(target, variant + 3100)
              : buildControlledMegaFreeSpins(target, variant + 3100, gameId);
  const scatterSymbols = buildControlledScatterSymbols(variant, gameId);
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
    ...(caishen ? { sourceFreeWinMultiplier: 8 } : {}),
    ...(caishenFaFaFa ? { sourceFreeWinMultiplier: 1 } : {}),
  };
}

/**
 * Fruit Little Mary's BONUS feature is one ordinary source free draw. A
 * control target is therefore treated as a ceiling and resolved from one
 * visible nine-line board; no hidden multiplier or generic 15-spin sequence
 * is introduced.
 */
function buildControlledFruitLittleMaryFreeSpins(
  totalMultiplier: number,
  variant = 0,
): {
  freeSpinsAwarded: number;
  freeSpinRounds: HotlineMegaFeatureResult['freeSpinRounds'];
  freeSpinMultiplierBank: number;
  freeSpinWinMultiplier: number;
} {
  const gameId = 'h5-fruit-little-mary';
  const target = roundFeatureMultiplier(Math.max(0, totalMultiplier));
  const candidate = controlledFeatureBaseRoundCandidates(gameId, variant)
    .filter(
      (round) =>
        round.totalMultiplier <= target + 0.0001 &&
        round.lines.every((line) => line.symbol < 8) &&
        round.grid.flat().every((symbol) => symbol < 8),
    )
    .sort((a, b) => b.totalMultiplier - a.totalMultiplier)[0];
  const grid = candidate?.grid ?? blankHotlineGrid(gameId, variant + 907);
  const evaluated = hotlineEvaluate(grid, gameId);
  const lines = candidate ? evaluated.lines.filter((line) => line.symbol < 8) : [];
  const freeSpinWinMultiplier = candidate
    ? roundFeatureMultiplier(lines.reduce((sum, line) => sum + line.payout, 0))
    : 0;
  const freeSpinRounds: HotlineMegaFeatureResult['freeSpinRounds'] = [
    {
      index: 0,
      initialGrid: grid.map((column) => [...column]),
      finalGrid: grid.map((column) => [...column]),
      cascades: [],
      lines,
      baseMultiplier: freeSpinWinMultiplier,
      scatterSymbols: [],
      multiplierSymbols: [],
      multiplierTotal: 0,
      appliedMultiplier: 1,
      totalMultiplier: freeSpinWinMultiplier,
      extraFreeSpinsAwarded: 0,
    },
  ];
  return {
    freeSpinsAwarded: 1,
    freeSpinRounds,
    freeSpinMultiplierBank: 0,
    freeSpinWinMultiplier,
  };
}

/**
 * Builds Yu Pu Tuan's source free mode without invented multiplier symbols:
 * exactly ten rounds, source id 6 upgraded to id 12, and only payouts that can
 * be re-evaluated from the visible 50-line board. Controlled rounds may
 * legitimately contain no Wild; when a natural Wild appears the provably-fair
 * engine preserves it separately for all remaining spins.
 */
function buildControlledYuPuTuanFreeSpins(
  totalMultiplier: number,
  variant = 0,
): {
  freeSpinsAwarded: number;
  freeSpinRounds: HotlineMegaFeatureResult['freeSpinRounds'];
  freeSpinMultiplierBank: number;
  freeSpinWinMultiplier: number;
} {
  const gameId = 'h5-yu-pu-tuan';
  const freeSpinsAwarded = 10;
  const target = roundFeatureMultiplier(Math.max(0, totalMultiplier));
  const toFreeGrid = (grid: number[][]): number[][] =>
    grid.map((column) => column.map((symbol) => (symbol === 5 ? 11 : symbol)));
  const toFreeRound = (
    grid: number[][],
    index: number,
  ): HotlineMegaFeatureResult['freeSpinRounds'][number] => {
    const freeGrid = toFreeGrid(grid);
    const evaluated = hotlineEvaluate(freeGrid, gameId);
    return {
      index,
      initialGrid: freeGrid.map((column) => [...column]),
      finalGrid: freeGrid.map((column) => [...column]),
      cascades: [],
      lines: evaluated.lines,
      baseMultiplier: evaluated.totalMultiplier,
      scatterSymbols: [],
      multiplierSymbols: [],
      multiplierTotal: 0,
      appliedMultiplier: 1,
      totalMultiplier: evaluated.totalMultiplier,
      extraFreeSpinsAwarded: 0,
    };
  };
  const blankRound = (index: number): HotlineMegaFeatureResult['freeSpinRounds'][number] => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = toFreeRound(
        makeClassicNoWinGrid(5, [], variant + 900 + index * 53 + attempt, 4, gameId),
        index,
      );
      if (candidate.totalMultiplier === 0) return candidate;
    }
    return blankControlledFreeSpinRound(index, blankHotlineGrid(gameId, variant + index * 53));
  };

  const candidates = controlledFeatureBaseRoundCandidates(gameId, variant)
    .map((round, index) => toFreeRound(round.grid, index))
    .filter((round) => round.totalMultiplier > 0)
    .sort((a, b) => b.totalMultiplier - a.totalMultiplier);
  const selected: HotlineMegaFeatureResult['freeSpinRounds'] = [];
  let remaining = target;
  for (let slot = 0; slot < freeSpinsAwarded && remaining > 0.0001; slot += 1) {
    const candidate = candidates.find((round) => round.totalMultiplier <= remaining + 0.0001);
    if (!candidate) break;
    selected.push(candidate);
    remaining = roundFeatureMultiplier(remaining - candidate.totalMultiplier);
  }

  const winningIndexes = pickControlledFreeSpinWinIndexes(
    freeSpinsAwarded,
    selected.length,
    variant,
  );
  let selectedIndex = 0;
  let freeSpinWinMultiplier = 0;
  const freeSpinRounds = Array.from({ length: freeSpinsAwarded }, (_, index) => {
    if (!winningIndexes.has(index)) return blankRound(index);
    const source = selected[selectedIndex++]!;
    const round = {
      ...source,
      index,
      initialGrid: source.initialGrid.map((column) => [...column]),
      finalGrid: source.finalGrid.map((column) => [...column]),
      lines: source.lines.map((line) => ({ ...line })),
    };
    freeSpinWinMultiplier = roundFeatureMultiplier(freeSpinWinMultiplier + round.totalMultiplier);
    return round;
  });

  return {
    freeSpinsAwarded,
    freeSpinRounds,
    freeSpinMultiplierBank: 0,
    freeSpinWinMultiplier,
  };
}

/**
 * Builds only source-legal Caishen free rounds: exactly eight initial spins,
 * no multiplier balls, and every ways/cascade award multiplied by eight in
 * both the line details and the aggregate. The target is a ceiling; using a
 * legal value below it is preferable to displaying an impossible win and
 * reducing the ledger afterwards.
 */
function buildControlledCaishenFreeSpins(
  totalMultiplier: number,
  variant = 0,
): {
  freeSpinsAwarded: number;
  freeSpinRounds: HotlineMegaFeatureResult['freeSpinRounds'];
  freeSpinMultiplierBank: number;
  freeSpinWinMultiplier: number;
} {
  const gameId = 'h5-caishen-wins';
  const freeSpinsAwarded = 8;
  const target = roundFeatureMultiplier(totalMultiplier);
  const candidates = controlledFeatureBaseRoundCandidates(gameId, variant)
    .filter((round) => round.totalMultiplier > 0)
    .sort(
      (a, b) =>
        b.totalMultiplier - a.totalMultiplier ||
        deterministicFraction(variant, Math.round(a.totalMultiplier * 10_000)) -
          deterministicFraction(variant, Math.round(b.totalMultiplier * 10_000)),
    );
  const selected: HotlineRound[] = [];
  let remaining = target;
  for (let slot = 0; slot < freeSpinsAwarded && remaining > 0.0001; slot += 1) {
    const candidate = candidates.find(
      (round) => roundFeatureMultiplier(round.totalMultiplier * 8) <= remaining + 0.0001,
    );
    if (!candidate) break;
    selected.push(candidate);
    remaining = roundFeatureMultiplier(remaining - candidate.totalMultiplier * 8);
  }

  const winningIndexes = pickControlledFreeSpinWinIndexes(
    freeSpinsAwarded,
    selected.length,
    variant,
  );
  let selectedIndex = 0;
  let freeSpinWinMultiplier = 0;
  const freeSpinRounds = Array.from({ length: freeSpinsAwarded }, (_, index) => {
    if (!winningIndexes.has(index)) {
      return blankControlledFreeSpinRound(
        index,
        blankHotlineGrid(gameId, variant + 900 + index * 53),
      );
    }
    const sourceRound = selected[selectedIndex++]!;
    const cascades = (sourceRound.cascades ?? []).map((cascade) => ({
      ...cascade,
      lines: cascade.lines.map((line) => ({
        ...line,
        payout: roundFeatureMultiplier(line.payout * 8),
      })),
      multiplier: roundFeatureMultiplier(cascade.multiplier * 8),
    }));
    const totalMultiplier = roundFeatureMultiplier(sourceRound.totalMultiplier * 8);
    const round: HotlineMegaFeatureResult['freeSpinRounds'][number] = {
      index,
      initialGrid: cascades[0]?.grid ?? sourceRound.grid,
      finalGrid: sourceRound.grid,
      cascades,
      lines: cascades.flatMap((cascade) => cascade.lines),
      baseMultiplier: totalMultiplier,
      scatterSymbols: [],
      multiplierSymbols: [],
      multiplierTotal: 0,
      appliedMultiplier: 1,
      totalMultiplier,
      extraFreeSpinsAwarded: 0,
    };
    freeSpinWinMultiplier = roundFeatureMultiplier(freeSpinWinMultiplier + round.totalMultiplier);
    return round;
  });

  return {
    freeSpinsAwarded,
    freeSpinRounds,
    freeSpinMultiplierBank: 0,
    freeSpinWinMultiplier,
  };
}

/**
 * Caishen Fa Fa Fa always awards ten initial free games from three Scatter.
 * Every free board visibly expands one to three golden Fa reels before the
 * exact nine-line evaluation. A control target is treated as a ceiling and
 * composed only from those re-evaluable boards, so the ledger never trims a
 * larger animation after it has already been shown.
 */
function buildControlledCaishenFaFaFaFreeSpins(
  totalMultiplier: number,
  variant = 0,
): {
  freeSpinsAwarded: number;
  freeSpinRounds: HotlineMegaFeatureResult['freeSpinRounds'];
  freeSpinMultiplierBank: number;
  freeSpinWinMultiplier: number;
} {
  const gameId = 'h5-caishen-fa-fa-fa';
  const freeSpinsAwarded = 10;
  const target = roundFeatureMultiplier(Math.max(0, totalMultiplier));
  const redWild = 10;
  const expandGrid = (source: number[][], seed: number, count: number): number[][] => {
    const grid = source.map((column) => [...column]);
    const reels = Array.from({ length: 5 }, (_, reel) => reel).sort(
      (a, b) =>
        deterministicFraction(seed + a * 31, 1771) - deterministicFraction(seed + b * 31, 1771),
    );
    reels.slice(0, Math.max(1, Math.min(3, count))).forEach((reel) => {
      grid[reel] = [redWild, redWild, redWild];
    });
    return grid;
  };
  const toRound = (
    grid: number[][],
    index: number,
  ): HotlineMegaFeatureResult['freeSpinRounds'][number] => {
    const evaluated = hotlineEvaluate(grid, gameId);
    return {
      index,
      initialGrid: grid.map((column) => [...column]),
      finalGrid: grid.map((column) => [...column]),
      cascades: [],
      lines: evaluated.lines,
      baseMultiplier: evaluated.totalMultiplier,
      scatterSymbols: [],
      multiplierSymbols: [],
      multiplierTotal: 0,
      appliedMultiplier: 1,
      totalMultiplier: evaluated.totalMultiplier,
      extraFreeSpinsAwarded: 0,
    };
  };
  const blankRound = (index: number): HotlineMegaFeatureResult['freeSpinRounds'][number] => {
    const offset = Math.abs(variant + index * 17) % 8;
    const shifted = (symbols: readonly number[]): number[] =>
      symbols.map((symbol) => (symbol + offset) % 8);
    const grid = [
      shifted([0, 1, 2]),
      shifted([3, 4, 5]),
      [redWild, redWild, redWild],
      shifted([6, 7, 0]),
      shifted([1, 2, 3]),
    ];
    const round = toRound(grid, index);
    if (round.totalMultiplier === 0) return round;

    for (let attempt = 0; attempt < 200; attempt += 1) {
      const base = makeClassicNoWinGrid(5, [], variant + index * 53 + attempt, 3, gameId);
      const candidate = toRound(expandGrid(base, variant + attempt, 1), index);
      if (candidate.totalMultiplier === 0) return candidate;
    }
    return blankControlledFreeSpinRound(index, blankHotlineGrid(gameId, variant + index * 53));
  };

  const sourceRounds = classicWinCandidateRounds(gameId, variant);
  const candidates = dedupeHotlineRounds(
    sourceRounds.flatMap((source, sourceIndex) =>
      [1, 2, 3].map((expandedCount) => {
        const grid = expandGrid(
          source.grid,
          variant + sourceIndex * 37 + expandedCount * 101,
          expandedCount,
        );
        const evaluated = hotlineEvaluate(grid, gameId);
        return {
          grid,
          lines: evaluated.lines,
          cascades: [],
          totalMultiplier: evaluated.totalMultiplier,
        };
      }),
    ),
  )
    .filter((round) => round.totalMultiplier > 0)
    .sort((a, b) => b.totalMultiplier - a.totalMultiplier);

  const selected: HotlineRound[] = [];
  let remaining = target;
  for (let slot = 0; slot < freeSpinsAwarded && remaining > 0.0001; slot += 1) {
    const candidate = candidates.find((round) => round.totalMultiplier <= remaining + 0.0001);
    if (!candidate) break;
    selected.push(candidate);
    remaining = roundFeatureMultiplier(remaining - candidate.totalMultiplier);
  }

  const winningIndexes = pickControlledFreeSpinWinIndexes(
    freeSpinsAwarded,
    selected.length,
    variant,
  );
  let selectedIndex = 0;
  let freeSpinWinMultiplier = 0;
  const freeSpinRounds = Array.from({ length: freeSpinsAwarded }, (_, index) => {
    if (!winningIndexes.has(index)) return blankRound(index);
    const source = selected[selectedIndex++]!;
    const round = toRound(source.grid, index);
    freeSpinWinMultiplier = roundFeatureMultiplier(freeSpinWinMultiplier + round.totalMultiplier);
    return round;
  });

  return {
    freeSpinsAwarded,
    freeSpinRounds,
    freeSpinMultiplierBank: 0,
    freeSpinWinMultiplier,
  };
}

/**
 * Golden Empire starts its free feature at x1 and increases the multiplier
 * after every successful elimination without resetting it between spins.
 * Controlled presentation therefore selects legal ways rounds first and
 * applies that visible ladder to each cascade, instead of inventing generic
 * multiplier balls or reducing an already displayed award afterwards.
 */
function buildControlledGoldenEmpireFreeSpins(
  totalMultiplier: number,
  variant = 0,
): {
  freeSpinsAwarded: number;
  freeSpinRounds: HotlineMegaFeatureResult['freeSpinRounds'];
  freeSpinMultiplierBank: number;
  freeSpinWinMultiplier: number;
} {
  const gameId = 'h5-golden-empire';
  const freeSpinsAwarded = 8;
  const target = roundFeatureMultiplier(totalMultiplier);
  const candidates = controlledFeatureBaseRoundCandidates(gameId, variant)
    .filter((round) => round.totalMultiplier > 0 && (round.cascades?.length ?? 0) > 0)
    .sort(
      (a, b) =>
        b.totalMultiplier - a.totalMultiplier ||
        deterministicFraction(variant, Math.round(a.totalMultiplier * 10_000)) -
          deterministicFraction(variant, Math.round(b.totalMultiplier * 10_000)),
    );
  const selected: HotlineRound[] = [];
  let remaining = target;
  let selectionMultiplier = 1;
  for (let slot = 0; slot < freeSpinsAwarded && remaining > 0.0001; slot += 1) {
    const candidate = candidates.find((round) => {
      let multiplier = selectionMultiplier;
      const adjusted = (round.cascades ?? []).reduce((sum, cascade) => {
        const value = sum + cascade.multiplier * multiplier;
        multiplier += cascade.multiplier > 0 ? 1 : 0;
        return value;
      }, 0);
      return roundFeatureMultiplier(adjusted) <= remaining + 0.0001;
    });
    if (!candidate) break;
    let multiplier = selectionMultiplier;
    const adjusted = (candidate.cascades ?? []).reduce((sum, cascade) => {
      const value = sum + cascade.multiplier * multiplier;
      multiplier += cascade.multiplier > 0 ? 1 : 0;
      return value;
    }, 0);
    selected.push(candidate);
    remaining = roundFeatureMultiplier(remaining - adjusted);
    selectionMultiplier = multiplier;
  }

  const winningIndexes = pickControlledFreeSpinWinIndexes(
    freeSpinsAwarded,
    selected.length,
    variant,
  );
  let selectedIndex = 0;
  let currentMultiplier = 1;
  let freeSpinWinMultiplier = 0;
  const freeSpinRounds = Array.from({ length: freeSpinsAwarded }, (_, index) => {
    if (!winningIndexes.has(index)) {
      const blank = blankControlledFreeSpinRound(
        index,
        blankHotlineGrid(gameId, variant + 900 + index * 53),
      );
      return blank;
    }
    const sourceRound = selected[selectedIndex++]!;
    const cascades = (sourceRound.cascades ?? []).map((cascade) => {
      const multiplier = currentMultiplier;
      if (cascade.multiplier > 0) currentMultiplier += 1;
      return {
        ...cascade,
        lines: cascade.lines.map((line) => ({
          ...line,
          payout: roundFeatureMultiplier(line.payout * multiplier),
        })),
        multiplier: roundFeatureMultiplier(cascade.multiplier * multiplier),
      };
    });
    const totalForRound = roundFeatureMultiplier(
      cascades.reduce((sum, cascade) => sum + cascade.multiplier, 0),
    );
    freeSpinWinMultiplier = roundFeatureMultiplier(freeSpinWinMultiplier + totalForRound);
    return {
      index,
      initialGrid: cascades[0]?.grid ?? sourceRound.grid,
      finalGrid: sourceRound.grid,
      cascades,
      lines: cascades.flatMap((cascade) => cascade.lines),
      baseMultiplier: totalForRound,
      scatterSymbols: [],
      multiplierSymbols: [],
      multiplierTotal: 0,
      // The visible cascade lines are already settled with the cumulative
      // Golden Empire ladder. Keep the generic post-win multiplier neutral so
      // adapters and accounting never multiply the same award a second time.
      appliedMultiplier: 1,
      totalMultiplier: totalForRound,
      extraFreeSpinsAwarded: 0,
      ...(sourceRound.finalSourceStacks
        ? { finalSourceStacks: sourceRound.finalSourceStacks }
        : {}),
    };
  });

  return {
    freeSpinsAwarded,
    freeSpinRounds,
    freeSpinMultiplierBank: currentMultiplier,
    freeSpinWinMultiplier,
  };
}

/**
 * This bundled Gates client has no multiplier-ball reel prefab. Its gm/tgm
 * protocol starts at x1 and adds one after every successful tumble, carrying
 * the value between its ten free spins. Compose controlled outcomes from that
 * same visible ladder so settlement never depends on an invented Zeus value.
 */
function buildControlledGatesFreeSpins(
  totalMultiplier: number,
  variant = 0,
): {
  freeSpinsAwarded: number;
  freeSpinRounds: HotlineMegaFeatureResult['freeSpinRounds'];
  freeSpinMultiplierBank: number;
  freeSpinWinMultiplier: number;
} {
  const gameId = 'h5-gates-of-olympus';
  const freeSpinsAwarded = 10;
  const target = roundFeatureMultiplier(Math.max(0, totalMultiplier));
  const candidates = controlledFeatureBaseRoundCandidates(gameId, variant)
    .filter((round) => round.totalMultiplier > 0 && (round.cascades?.length ?? 0) > 0)
    .sort(
      (a, b) =>
        b.totalMultiplier - a.totalMultiplier ||
        deterministicFraction(variant, Math.round(a.totalMultiplier * 10_000)) -
          deterministicFraction(variant, Math.round(b.totalMultiplier * 10_000)),
    );
  const selected: HotlineRound[] = [];
  let remaining = target;
  let selectionMultiplier = 1;

  for (let slot = 0; slot < freeSpinsAwarded && remaining > 0.0001; slot += 1) {
    const candidate = candidates.find((round) => {
      let multiplier = selectionMultiplier;
      const adjusted = (round.cascades ?? []).reduce((sum, cascade) => {
        const value = sum + cascade.multiplier * multiplier;
        if (cascade.multiplier > 0) multiplier += 1;
        return value;
      }, 0);
      return roundFeatureMultiplier(adjusted) <= remaining + 0.0001;
    });
    if (!candidate) break;
    let multiplier = selectionMultiplier;
    const adjusted = (candidate.cascades ?? []).reduce((sum, cascade) => {
      const value = sum + cascade.multiplier * multiplier;
      if (cascade.multiplier > 0) multiplier += 1;
      return value;
    }, 0);
    selected.push(candidate);
    remaining = roundFeatureMultiplier(Math.max(0, remaining - adjusted));
    selectionMultiplier = multiplier;
  }

  const winningIndexes = pickControlledFreeSpinWinIndexes(
    freeSpinsAwarded,
    selected.length,
    variant,
  );
  let selectedIndex = 0;
  let currentMultiplier = 1;
  let freeSpinWinMultiplier = 0;
  const freeSpinRounds = Array.from({ length: freeSpinsAwarded }, (_, index) => {
    if (!winningIndexes.has(index)) {
      return {
        ...blankControlledFreeSpinRound(
          index,
          blankHotlineGrid(gameId, variant + 900 + index * 53),
        ),
        sourceMultiplierBank: currentMultiplier,
      };
    }

    const sourceRound = selected[selectedIndex++]!;
    const cascades = (sourceRound.cascades ?? []).map((cascade) => {
      const sourceAppliedMultiplier = currentMultiplier;
      if (cascade.multiplier > 0) currentMultiplier += 1;
      return {
        ...cascade,
        lines: cascade.lines.map((line) => ({
          ...line,
          payout: roundFeatureMultiplier(line.payout * sourceAppliedMultiplier),
        })),
        multiplier: roundFeatureMultiplier(cascade.multiplier * sourceAppliedMultiplier),
        sourceAppliedMultiplier,
      };
    });
    const totalForRound = roundFeatureMultiplier(
      cascades.reduce((sum, cascade) => sum + cascade.multiplier, 0),
    );
    freeSpinWinMultiplier = roundFeatureMultiplier(freeSpinWinMultiplier + totalForRound);
    return {
      index,
      initialGrid: cascades[0]?.grid ?? sourceRound.grid,
      finalGrid: sourceRound.grid,
      cascades,
      lines: cascades.flatMap((cascade) => cascade.lines),
      baseMultiplier: totalForRound,
      scatterSymbols: [],
      multiplierSymbols: [],
      multiplierTotal: 0,
      appliedMultiplier: 1,
      sourceMultiplierBank: currentMultiplier,
      totalMultiplier: totalForRound,
      extraFreeSpinsAwarded: 0,
    };
  });

  return {
    freeSpinsAwarded,
    freeSpinRounds,
    freeSpinMultiplierBank: currentMultiplier,
    freeSpinWinMultiplier,
  };
}

function buildControlledMegaFreeSpins(
  totalMultiplier: number,
  variant = 0,
  gameId: string = GameId.THUNDER_SLOT,
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
        blankControlledFreeSpinRound(index, blankHotlineGrid(gameId, variant + 900 + index * 53)),
      ),
      freeSpinMultiplierBank: 0,
      freeSpinWinMultiplier: 0,
    };
  }

  const baseRoundCandidates = controlledFeatureBaseRoundCandidates(gameId, variant);
  const minBaseWin = Math.min(
    ...baseRoundCandidates.map((round) => round.totalMultiplier).filter((value) => value > 0),
  );
  const effectiveMinBaseWin = Number.isFinite(minBaseWin)
    ? minBaseWin
    : (HOTLINE_MEGA_SYMBOLS[0]?.payout3 ?? 0.345);
  const maxWinningRounds = Math.max(1, Math.floor(target / effectiveMinBaseWin));
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
        blankControlledFreeSpinRound(index, blankHotlineGrid(gameId, variant + 900 + index * 53)),
      );
      continue;
    }

    const isLastWinningRound = portionIndex === winningRoundCount - 1;
    const desiredTotal = isLastWinningRound
      ? roundFeatureMultiplier(Math.max(0, target - freeSpinWinMultiplier))
      : (portions[portionIndex] ?? 0);
    const symbolSeed = variant + index * 37 + portionIndex * 101;
    const sourceRound = controlledMegaBaseRoundForTarget(
      desiredTotal,
      multiplierBank,
      symbolSeed,
      gameId,
    );
    const baseMultiplier = roundFeatureMultiplier(sourceRound.totalMultiplier);
    const nextBank = roundFeatureMultiplier(Math.max(1, desiredTotal / baseMultiplier));
    const multiplierTotal = roundFeatureMultiplier(Math.max(0, nextBank - multiplierBank));
    const multiplierSymbols =
      multiplierTotal > 0
        ? buildControlledMultiplierSymbols(multiplierTotal, variant + index * 19, gameId)
        : [];
    const scatterSymbols =
      index === 0 && deterministicFraction(variant, 211) > 0.62
        ? buildControlledScatterSymbols(variant + index * 13, gameId).slice(0, 1)
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
          ? buildControlledMultiplierSymbols(
              adjustedMultiplierTotal,
              variant + lastWinIndex * 19,
              gameId,
            )
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
  gameId: string = GameId.THUNDER_SLOT,
): HotlineRound {
  const minAppliedMultiplier = Math.max(1, previousMultiplierBank + 0.0001);
  const maxBaseMultiplier = Math.max(0, desiredTotal / minAppliedMultiplier);
  const allCandidates = controlledFeatureBaseRoundCandidates(gameId, variant);
  const candidates = allCandidates
    .filter((candidate) => candidate.totalMultiplier <= maxBaseMultiplier + 0.0001)
    .sort(
      (a, b) =>
        b.totalMultiplier - a.totalMultiplier ||
        deterministicFraction(variant, Math.round(a.totalMultiplier * 10_000)) -
          deterministicFraction(variant, Math.round(b.totalMultiplier * 10_000)),
    );
  return candidates[0] ?? allCandidates[0] ?? hardLossHotlineRound(gameId, variant);
}

function controlledFeatureBaseRoundCandidates(gameId: string, variant: number): HotlineRound[] {
  const evaluationMode = getHotlineEvaluationMode(gameId);
  if (evaluationMode === 'cluster') {
    const reelCount = getHotlineReelCount(gameId);
    const rowCount = getHotlineRowCount(gameId);
    const clusterRounds: HotlineRound[] = [];
    for (let symbol = 0; symbol < HOTLINE_MEGA_SYMBOLS.length; symbol += 1) {
      for (const clusterCount of [12, 10, 8] as const) {
        const roundVariant = variant + symbol * 41 + clusterCount * 13;
        const round = roundFromMegaGrid(
          gameId,
          megaClusterHotlineGrid([symbol], roundVariant, clusterCount, reelCount, rowCount, gameId),
          roundVariant,
          false,
        );
        if (round.totalMultiplier > 0 && round.lines.length > 0) clusterRounds.push(round);
      }
    }
    return dedupeHotlineRounds(clusterRounds).sort((a, b) => a.totalMultiplier - b.totalMultiplier);
  }

  const sourceRounds =
    evaluationMode === 'ways'
      ? megaWinCandidateRounds(gameId, variant)
      : classicWinCandidateRounds(gameId, variant);
  const rounds = sourceRounds.map((round, index) =>
    isHotlineCascadeGame(gameId) && !usesHotlineWaysEvaluation(gameId)
      ? roundFromMegaGrid(gameId, round.grid, variant + index * 29, false)
      : round,
  );
  return dedupeHotlineRounds(
    rounds.filter((round) => round.totalMultiplier > 0 && round.lines.length > 0),
  ).sort((a, b) => a.totalMultiplier - b.totalMultiplier);
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
  gameId: string = GameId.THUNDER_SLOT,
): HotlineSpecialSymbol[] {
  const total = roundFeatureMultiplier(totalValue);
  if (total <= 0) return [];
  const count = total >= 12 ? 3 : total >= 4 ? 2 : 1;
  const reelCount = getHotlineReelCount(gameId);
  const rowCount = getHotlineRowCount(gameId);
  const reelRows = getHotlineReelRowCounts(gameId, reelCount, rowCount);
  const positions = rankedMegaPositions(
    reelRows.flatMap((rows, reel) => Array.from({ length: rows }, (_, row) => ({ reel, row }))),
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

function buildControlledScatterSymbols(
  variant: number,
  gameId: string = GameId.THUNDER_SLOT,
): HotlineSpecialSymbol[] {
  const reelCount = getHotlineReelCount(gameId);
  const rowCount = getHotlineRowCount(gameId);
  const reelRows = getHotlineReelRowCounts(gameId, reelCount, rowCount);
  if (gameId === 'h5-yu-pu-tuan') {
    // The source trigger is exactly one Scatter on each of reels 1, 2 and 3.
    return [0, 1, 2].map((reel) => ({
      reel,
      row: Math.floor(deterministicFraction(variant + reel * 31, 613) * reelRows[reel]!),
      type: 'scatter' as const,
    }));
  }
  if (gameId === 'h5-fruit-little-mary') {
    // BONUS is the source free-draw trigger and must occupy three adjacent
    // reels. The red 7 SCATTER remains an ordinary paying symbol.
    return [0, 1, 2].map((reel) => ({
      reel,
      row: Math.floor(deterministicFraction(variant + reel * 31, 617) * reelRows[reel]!),
      type: 'scatter' as const,
    }));
  }
  if (gameId === 'h5-caishen-fa-fa-fa') {
    // The source free-game trigger is three Scatter symbols. Four and five
    // award larger natural packages, but a controlled trigger starts at the
    // documented ten-game tier.
    return [0, 1, 2].map((reel) => ({
      reel,
      row: Math.floor(deterministicFraction(variant + reel * 31, 619) * reelRows[reel]!),
      type: 'scatter' as const,
    }));
  }
  if (gameId === 'h5-gates-of-olympus') {
    // The packaged source enters ten free spins with three Scatter symbols.
    return [0, 1, 2].map((reel) => ({
      reel,
      row: Math.floor(deterministicFraction(variant + reel * 31, 621) * reelRows[reel]!),
      type: 'scatter' as const,
    }));
  }
  const positions = rankedMegaPositions(
    reelRows.flatMap((rows, reel) => Array.from({ length: rows }, (_, row) => ({ reel, row }))),
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
  canMegaFreeGameExceedOne,
  shouldPreserveControlledMegaFreeGameTarget,
  buildControlledMegaFeature,
  buildControlledFruitLittleMaryFreeSpins,
  buildControlledCaishenFaFaFaFreeSpins,
  buildControlledScatterSymbols,
  resolveFruitLittleMaryJackpotAward,
  chooseMegaFreeGameAccountingMultiplier,
  megaBuyFeatureStakeAmount,
  sourceStakeAmount,
  scaleControlForSourcePresentation,
  decorateFortuneGemsRound,
  decorateAztecGemsRound,
  decorateStar97Round,
  advanceStar97Progress,
  fixedLineHotlineGrid,
  roundFromClassicGrid,
  roundFromMegaGrid,
  lossHotlineRound,
  softLossHotlineRound,
  winningHotlineRound,
  strictWinningHotlineRound,
  selectControlledHotlineRound,
  megaClusterHotlineGrid,
  buildHotlineRound,
  blankHotlineGrid,
  emptyBountyFreeModeFeatures,
  selectBountyFreeFeaturesForControl,
};
