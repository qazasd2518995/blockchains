import { Prisma } from '@prisma/client';

export type RebateCategory = 'electronic' | 'baccarat';
export type RebateModeValue = 'PERCENTAGE' | 'ALL' | 'NONE';

export interface DualRebateProfile {
  rebateMode: RebateModeValue;
  rebatePercentage: Prisma.Decimal;
  maxRebatePercentage: Prisma.Decimal;
  baccaratRebateMode: RebateModeValue;
  baccaratRebatePercentage: Prisma.Decimal;
  maxBaccaratRebatePercentage: Prisma.Decimal;
}

export interface BetAmountMix {
  betAmount: Prisma.Decimal;
  electronicBetAmount: Prisma.Decimal;
  baccaratBetAmount: Prisma.Decimal;
}

export const ELECTRONIC_REBATE_CAP = new Prisma.Decimal('0.025');
export const BACCARAT_REBATE_CAP = new Prisma.Decimal('0.010');
const ZERO = new Prisma.Decimal(0);

export function getPlatformRebateCap(category: RebateCategory): Prisma.Decimal {
  return category === 'baccarat' ? BACCARAT_REBATE_CAP : ELECTRONIC_REBATE_CAP;
}

export function clampRebateToPlatform(
  value: Prisma.Decimal,
  category: RebateCategory,
): Prisma.Decimal {
  const cap = getPlatformRebateCap(category);
  if (value.lessThan(0)) return ZERO;
  return value.greaterThan(cap) ? cap : value;
}

export function getConfiguredRebate(
  agent: DualRebateProfile,
  category: RebateCategory,
): {
  rebateMode: RebateModeValue;
  rebatePercentage: Prisma.Decimal;
  maxRebatePercentage: Prisma.Decimal;
} {
  if (category === 'baccarat') {
    return {
      rebateMode: agent.baccaratRebateMode,
      rebatePercentage: agent.baccaratRebatePercentage,
      maxRebatePercentage: agent.maxBaccaratRebatePercentage,
    };
  }
  return {
    rebateMode: agent.rebateMode,
    rebatePercentage: agent.rebatePercentage,
    maxRebatePercentage: agent.maxRebatePercentage,
  };
}

export function effectiveDownlineRebate(
  agent: DualRebateProfile,
  category: RebateCategory,
): Prisma.Decimal {
  const configured = getConfiguredRebate(agent, category);
  if (configured.rebateMode === 'ALL') return ZERO;
  if (configured.rebateMode === 'NONE') {
    return clampRebateToPlatform(configured.maxRebatePercentage, category);
  }
  return clampRebateToPlatform(configured.rebatePercentage, category);
}

export function normalizeRebateForMode(
  mode: RebateModeValue,
  requestedPct: string | undefined,
  maxAllowed: Prisma.Decimal,
): Prisma.Decimal {
  if (mode === 'ALL') return ZERO;
  if (mode === 'NONE') return maxAllowed;
  return new Prisma.Decimal(requestedPct ?? '0');
}

export function assertRebateWithinBounds(
  rebatePct: Prisma.Decimal,
  maxAllowed: Prisma.Decimal,
  category: RebateCategory,
): void {
  const cap = getPlatformRebateCap(category);
  const label = category === 'baccarat' ? 'baccarat rebatePercentage' : 'rebatePercentage';
  if (rebatePct.lessThan(0)) {
    throw new Error(`${label} cannot be negative`);
  }
  if (rebatePct.greaterThan(maxAllowed)) {
    throw new Error(`${label} exceeds parent`);
  }
  if (rebatePct.greaterThan(cap)) {
    throw new Error(`${label} exceeds platform cap ${cap.mul(100).toFixed(2)}%`);
  }
}

export function getGameRebateCategory(gameId?: string | null): RebateCategory {
  return gameId === 'baccarat' ? 'baccarat' : 'electronic';
}

export function calculateRebateAmountByCategory(
  mix: BetAmountMix,
  electronicRate: Prisma.Decimal,
  baccaratRate: Prisma.Decimal,
): Prisma.Decimal {
  return mix.electronicBetAmount.mul(electronicRate).add(mix.baccaratBetAmount.mul(baccaratRate));
}

export function fallbackRateForGame(
  gameId: string | undefined,
  electronicRate: Prisma.Decimal,
  baccaratRate: Prisma.Decimal,
): Prisma.Decimal {
  if (!gameId) return ZERO;
  return getGameRebateCategory(gameId) === 'baccarat' ? baccaratRate : electronicRate;
}

export function weightedRate(
  totalBetAmount: Prisma.Decimal,
  rebateAmount: Prisma.Decimal,
  fallback: Prisma.Decimal = ZERO,
): Prisma.Decimal {
  if (totalBetAmount.lessThanOrEqualTo(0)) return fallback;
  return rebateAmount.div(totalBetAmount);
}
