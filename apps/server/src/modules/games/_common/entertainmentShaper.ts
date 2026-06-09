import { Prisma } from '@prisma/client';
import type { ControlOutcome } from './controls.js';

export type EntertainmentGameKind = 'slot' | 'mines' | 'tower';
export type EntertainmentSource = 'auto_balance';
export type EntertainmentPhase = 'BITE_TO_20' | 'REVIVE_TO_40' | 'DRAIN_TO_ZERO';
export type EntertainmentPresentationProfile =
  | 'small_hit'
  | 'safe_progress'
  | 'low_cashout'
  | 'controlled_drain';

export interface EntertainmentEnvelope {
  enabled: boolean;
  source: EntertainmentSource;
  phase: EntertainmentPhase;
  gameKind: EntertainmentGameKind;
  desired: 'WIN' | 'LOSS';
  amount: Prisma.Decimal;
  maxPayout: Prisma.Decimal;
  preferredMultiplierMin: Prisma.Decimal;
  preferredMultiplierMax: Prisma.Decimal;
  hardMultiplierMax: Prisma.Decimal;
  allowTinyProfit: boolean;
  presentationProfile: EntertainmentPresentationProfile;
}

export interface EntertainmentShapeMeta {
  presentationProfile: EntertainmentPresentationProfile;
  envelopePhase: EntertainmentPhase;
  originalMultiplier: string;
  shapedMultiplier: string;
  envelopeMaxPayout: string;
  cappedByEnvelope: boolean;
  riskFlags: string[];
}

type EntertainmentControlInput = Pick<
  ControlOutcome,
  'controlled' | 'won' | 'flipReason' | 'maxPayout' | 'maxMultiplier'
>;

const DEFAULT_ENABLED_GAMES = new Set<EntertainmentGameKind>(['slot', 'mines', 'tower']);
const DEFAULT_ENABLED_SOURCES = new Set<EntertainmentSource>(['auto_balance']);

export function getActiveEntertainmentEnvelope(
  outcome: EntertainmentControlInput,
  amount: Prisma.Decimal,
  gameKind: EntertainmentGameKind,
): EntertainmentEnvelope | null {
  if (!isEntertainmentShaperRuntimeEnabled(gameKind, 'auto_balance')) return null;
  return buildAutoBalanceEntertainmentEnvelope(outcome, amount, gameKind);
}

export function buildAutoBalanceEntertainmentEnvelope(
  outcome: EntertainmentControlInput,
  amount: Prisma.Decimal,
  gameKind: EntertainmentGameKind,
): EntertainmentEnvelope | null {
  if (!outcome.controlled || !isAutoBalanceControlReason(outcome.flipReason)) return null;
  if (amount.lessThanOrEqualTo(0)) return null;

  const phase = autoBalancePhaseFromReason(outcome.flipReason);
  const desired = outcome.won ? 'WIN' : 'LOSS';
  const profile = autoBalanceProfile(phase, desired, gameKind);
  const hardMultiplierMax = outcome.maxMultiplier
    ? Prisma.Decimal.min(profile.hardMultiplierMax, outcome.maxMultiplier)
    : profile.hardMultiplierMax;
  const maxPayoutByMultiplier = amount
    .mul(hardMultiplierMax)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const maxPayout = outcome.maxPayout
    ? Prisma.Decimal.min(outcome.maxPayout, maxPayoutByMultiplier)
    : maxPayoutByMultiplier;

  if (maxPayout.lessThanOrEqualTo(0)) return null;

  return {
    enabled: true,
    source: 'auto_balance',
    phase,
    gameKind,
    desired,
    amount,
    maxPayout,
    preferredMultiplierMin: profile.preferredMultiplierMin,
    preferredMultiplierMax: Prisma.Decimal.min(
      profile.preferredMultiplierMax,
      hardMultiplierMax,
      maxPayout.div(amount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN),
    ),
    hardMultiplierMax,
    allowTinyProfit: profile.allowTinyProfit,
    presentationProfile: profile.presentationProfile,
  };
}

export function shapeControlOutcomeForEntertainment(
  outcome: ControlOutcome,
  amount: Prisma.Decimal,
  gameKind: EntertainmentGameKind,
  variant = 0,
): { outcome: ControlOutcome; envelope: EntertainmentEnvelope; meta: EntertainmentShapeMeta } | null {
  const envelope = getActiveEntertainmentEnvelope(outcome, amount, gameKind);
  if (!envelope) return null;

  const targetMultiplier = chooseEntertainmentMultiplier(envelope, variant);
  const payout = amount.mul(targetMultiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const shaped: ControlOutcome = {
    ...outcome,
    won: envelope.desired === 'WIN' && payout.greaterThan(amount),
    multiplier: targetMultiplier,
    payout,
    maxMultiplier: outcome.maxMultiplier
      ? Prisma.Decimal.min(outcome.maxMultiplier, envelope.hardMultiplierMax)
      : envelope.hardMultiplierMax,
    maxPayout: outcome.maxPayout
      ? Prisma.Decimal.min(outcome.maxPayout, envelope.maxPayout)
      : envelope.maxPayout,
  };

  return {
    outcome: shaped,
    envelope,
    meta: buildEntertainmentShapeMeta(envelope, outcome.multiplier, shaped.multiplier, payout),
  };
}

export function chooseEntertainmentMultiplier(
  envelope: EntertainmentEnvelope,
  variant = 0,
): Prisma.Decimal {
  const cap = Prisma.Decimal.min(
    envelope.hardMultiplierMax,
    envelope.maxPayout.div(envelope.amount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN),
  );
  const min = Prisma.Decimal.min(envelope.preferredMultiplierMin, cap);
  const max = Prisma.Decimal.min(envelope.preferredMultiplierMax, cap);
  if (max.lessThanOrEqualTo(min)) return normalizeEntertainmentMultiplier(max, envelope.desired);

  const fraction = deterministicFraction(variant, phaseSalt(envelope.phase, envelope.gameKind));
  const span = max.sub(min);
  return normalizeEntertainmentMultiplier(min.add(span.mul(fraction)), envelope.desired);
}

export function shouldAllowEntertainmentSafeProgress(input: {
  outcome: Pick<ControlOutcome, 'controlled' | 'won' | 'flipReason'>;
  amount: Prisma.Decimal;
  nextMultiplier: Prisma.Decimal;
  gameKind: 'mines' | 'tower';
  progressIndex: number;
}): boolean {
  const envelope = getActiveEntertainmentEnvelope(input.outcome, input.amount, input.gameKind);
  if (!envelope || envelope.desired !== 'LOSS') return false;

  const maxProgressIndex =
    input.gameKind === 'tower'
      ? envelope.phase === 'DRAIN_TO_ZERO'
        ? 2
        : 3
      : envelope.phase === 'DRAIN_TO_ZERO'
        ? 1
        : 2;
  if (input.progressIndex >= maxProgressIndex) return false;

  const hardProgressMax =
    input.gameKind === 'tower'
      ? new Prisma.Decimal('1.00')
      : new Prisma.Decimal('1.00');
  return input.nextMultiplier.lessThanOrEqualTo(hardProgressMax);
}

export function buildEntertainmentShapeMeta(
  envelope: EntertainmentEnvelope,
  originalMultiplier: Prisma.Decimal,
  shapedMultiplier: Prisma.Decimal,
  shapedPayout: Prisma.Decimal,
  riskFlags: string[] = [],
): EntertainmentShapeMeta {
  return {
    presentationProfile: envelope.presentationProfile,
    envelopePhase: envelope.phase,
    originalMultiplier: originalMultiplier.toFixed(4),
    shapedMultiplier: shapedMultiplier.toFixed(4),
    envelopeMaxPayout: envelope.maxPayout.toFixed(2),
    cappedByEnvelope: shapedPayout.greaterThanOrEqualTo(envelope.maxPayout),
    riskFlags,
  };
}

export function isAutoBalanceControlReason(reason?: string): boolean {
  return (
    reason === 'auto_balance_bite' ||
    reason === 'auto_balance_revive' ||
    reason === 'auto_balance_drain'
  );
}

function autoBalancePhaseFromReason(reason?: string): EntertainmentPhase {
  if (reason === 'auto_balance_revive') return 'REVIVE_TO_40';
  if (reason === 'auto_balance_drain') return 'DRAIN_TO_ZERO';
  return 'BITE_TO_20';
}

function autoBalanceProfile(
  phase: EntertainmentPhase,
  desired: 'WIN' | 'LOSS',
  gameKind: EntertainmentGameKind,
): Pick<
  EntertainmentEnvelope,
  | 'preferredMultiplierMin'
  | 'preferredMultiplierMax'
  | 'hardMultiplierMax'
  | 'allowTinyProfit'
  | 'presentationProfile'
> {
  if (desired === 'WIN') {
    return {
      preferredMultiplierMin: new Prisma.Decimal('1.01'),
      preferredMultiplierMax: phase === 'REVIVE_TO_40' ? new Prisma.Decimal('1.80') : new Prisma.Decimal('1.25'),
      hardMultiplierMax: phase === 'REVIVE_TO_40' ? new Prisma.Decimal('2.00') : new Prisma.Decimal('1.35'),
      allowTinyProfit: true,
      presentationProfile: gameKind === 'slot' ? 'small_hit' : 'safe_progress',
    };
  }

  if (phase === 'DRAIN_TO_ZERO') {
    return {
      preferredMultiplierMin: new Prisma.Decimal('0.20'),
      preferredMultiplierMax: gameKind === 'slot' ? new Prisma.Decimal('0.85') : new Prisma.Decimal('0.80'),
      hardMultiplierMax: new Prisma.Decimal('0.98'),
      allowTinyProfit: false,
      presentationProfile: 'controlled_drain',
    };
  }

  return {
    preferredMultiplierMin: new Prisma.Decimal(gameKind === 'slot' ? '0.20' : '0.35'),
    preferredMultiplierMax: gameKind === 'slot' ? new Prisma.Decimal('0.95') : new Prisma.Decimal('0.90'),
    hardMultiplierMax: new Prisma.Decimal('0.98'),
    allowTinyProfit: false,
    presentationProfile: gameKind === 'slot' ? 'small_hit' : 'low_cashout',
  };
}

function normalizeEntertainmentMultiplier(
  value: Prisma.Decimal,
  desired: 'WIN' | 'LOSS',
): Prisma.Decimal {
  const rounded = value.toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN);
  if (desired === 'LOSS') return Prisma.Decimal.min(rounded, new Prisma.Decimal('0.98'));
  return rounded.greaterThan(1) ? rounded : new Prisma.Decimal('1.01');
}

function isEntertainmentShaperRuntimeEnabled(
  gameKind: EntertainmentGameKind,
  source: EntertainmentSource,
): boolean {
  if (!envFlagEnabled('ENTERTAINMENT_SHAPER_ENABLED')) return false;
  const games = envSet('ENTERTAINMENT_SHAPER_GAMES', DEFAULT_ENABLED_GAMES);
  const sources = envSet('ENTERTAINMENT_SHAPER_SOURCES', DEFAULT_ENABLED_SOURCES);
  return games.has(gameKind) && sources.has(source);
}

function envFlagEnabled(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes' || value === 'on';
}

function envSet<T extends string>(name: string, fallback: Set<T>): Set<T> {
  const raw = process.env[name];
  if (!raw) return fallback;
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean) as T[];
  return values.length > 0 ? new Set(values) : fallback;
}

function phaseSalt(phase: EntertainmentPhase, gameKind: EntertainmentGameKind): number {
  const phaseValue =
    phase === 'BITE_TO_20' ? 101 : phase === 'REVIVE_TO_40' ? 211 : 307;
  const gameValue = gameKind === 'slot' ? 17 : gameKind === 'mines' ? 29 : 41;
  return phaseValue + gameValue;
}

function deterministicFraction(seed: number, salt: number): number {
  const x = Math.sin((Math.trunc(seed) + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
