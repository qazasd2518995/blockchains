export type RebateMode = 'PERCENTAGE' | 'ALL' | 'NONE';
export type RebateCategory = 'electronic' | 'baccarat';

export interface AgentRebateConfigLike {
  rebateMode: RebateMode;
  rebatePercentage: string;
  maxRebatePercentage: string;
  baccaratRebateMode: RebateMode;
  baccaratRebatePercentage: string;
  maxBaccaratRebatePercentage: string;
}

export const PLATFORM_REBATE_CAP_PCT: Record<RebateCategory, number> = {
  electronic: 2.5,
  baccarat: 1.0,
};

export function fractionToPctStr(value: string): string {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return '0.00';
  return (n * 100).toFixed(2);
}

export function pctStrToFraction(value: string): string {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return '0';
  return (n / 100).toFixed(4);
}

export function getEffectiveParentRebatePct(
  parent: AgentRebateConfigLike,
  category: RebateCategory,
): number {
  const mode = category === 'baccarat' ? parent.baccaratRebateMode : parent.rebateMode;
  const pct =
    category === 'baccarat'
      ? parent.baccaratRebatePercentage
      : parent.rebatePercentage;
  const maxPct =
    category === 'baccarat'
      ? parent.maxBaccaratRebatePercentage
      : parent.maxRebatePercentage;
  const resolvedPct =
    mode === 'ALL'
      ? 0
      : mode === 'NONE'
        ? Number.parseFloat(maxPct || '0') * 100
        : Number.parseFloat(pct || '0') * 100;
  return Math.max(0, Math.min(resolvedPct, PLATFORM_REBATE_CAP_PCT[category]));
}

export function rebateFractionForMode(
  mode: RebateMode,
  pctDisplay: string,
  parentMaxPct: number,
): string {
  if (mode === 'ALL') return '0.0000';
  if (mode === 'NONE') return (parentMaxPct / 100).toFixed(4);
  return pctStrToFraction(pctDisplay);
}
