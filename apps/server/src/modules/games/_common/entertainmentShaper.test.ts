import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAutoBalanceEntertainmentEnvelope,
  chooseEntertainmentMultiplier,
  shapeControlOutcomeForEntertainment,
  shouldAllowEntertainmentSafeProgress,
} from './entertainmentShaper.js';

describe('Entertainment Shaper', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds loss envelopes that keep auto-balance small hits below stake', () => {
    const amount = new Prisma.Decimal(100);
    const envelope = buildAutoBalanceEntertainmentEnvelope(
      {
        controlled: true,
        won: false,
        flipReason: 'auto_balance_bite',
      },
      amount,
      'slot',
    );

    expect(envelope).not.toBeNull();
    expect(envelope!.desired).toBe('LOSS');
    expect(envelope!.phase).toBe('BITE_TO_20');
    expect(envelope!.maxPayout.lessThan(amount)).toBe(true);
    expect(envelope!.hardMultiplierMax.lessThan(1)).toBe(true);
  });

  it('caps auto-balance revive wins to a small multiplier envelope', () => {
    const amount = new Prisma.Decimal(1000);
    const envelope = buildAutoBalanceEntertainmentEnvelope(
      {
        controlled: true,
        won: true,
        flipReason: 'auto_balance_revive',
        maxPayout: new Prisma.Decimal(30000),
      },
      amount,
      'tower',
    );

    expect(envelope).not.toBeNull();
    expect(envelope!.desired).toBe('WIN');
    expect(envelope!.phase).toBe('REVIVE_TO_40');
    expect(envelope!.hardMultiplierMax.toFixed(2)).toBe('2.00');
    expect(envelope!.maxPayout.toFixed(2)).toBe('2000.00');
  });

  it('shapes active auto-balance losses into low cashout payouts when enabled', () => {
    vi.stubEnv('ENTERTAINMENT_SHAPER_ENABLED', 'true');
    vi.stubEnv('ENTERTAINMENT_SHAPER_GAMES', 'mines,tower,slot');
    vi.stubEnv('ENTERTAINMENT_SHAPER_SOURCES', 'auto_balance');

    const shaped = shapeControlOutcomeForEntertainment(
      {
        controlled: true,
        won: false,
        flipReason: 'auto_balance_drain',
        controlId: 'auto-1',
        multiplier: new Prisma.Decimal(0),
        payout: new Prisma.Decimal(0),
      },
      new Prisma.Decimal(500),
      'mines',
      9,
    );

    expect(shaped).not.toBeNull();
    expect(shaped!.outcome.controlled).toBe(true);
    expect(shaped!.outcome.won).toBe(false);
    expect(shaped!.outcome.payout.greaterThan(0)).toBe(true);
    expect(shaped!.outcome.payout.lessThan(500)).toBe(true);
    expect(shaped!.meta.presentationProfile).toBe('controlled_drain');
  });

  it('allows only early low-multiplier safe progress for auto-balance losses', () => {
    vi.stubEnv('ENTERTAINMENT_SHAPER_ENABLED', 'true');

    const outcome = {
      controlled: true,
      won: false,
      flipReason: 'auto_balance_bite',
    };

    expect(
      shouldAllowEntertainmentSafeProgress({
        outcome,
        amount: new Prisma.Decimal(100),
        nextMultiplier: new Prisma.Decimal('0.8'),
        gameKind: 'tower',
        progressIndex: 1,
      }),
    ).toBe(true);
    expect(
      shouldAllowEntertainmentSafeProgress({
        outcome,
        amount: new Prisma.Decimal(100),
        nextMultiplier: new Prisma.Decimal('1.4'),
        gameKind: 'tower',
        progressIndex: 1,
      }),
    ).toBe(false);
    expect(
      shouldAllowEntertainmentSafeProgress({
        outcome,
        amount: new Prisma.Decimal(100),
        nextMultiplier: new Prisma.Decimal('1.01'),
        gameKind: 'mines',
        progressIndex: 3,
      }),
    ).toBe(false);
  });

  it('chooses deterministic multipliers inside the envelope range', () => {
    const amount = new Prisma.Decimal(100);
    const envelope = buildAutoBalanceEntertainmentEnvelope(
      {
        controlled: true,
        won: false,
        flipReason: 'auto_balance_bite',
      },
      amount,
      'slot',
    )!;

    const first = chooseEntertainmentMultiplier(envelope, 12);
    const second = chooseEntertainmentMultiplier(envelope, 12);
    expect(first.toFixed(4)).toBe(second.toFixed(4));
    expect(first.greaterThanOrEqualTo(envelope.preferredMultiplierMin)).toBe(true);
    expect(first.lessThanOrEqualTo(envelope.preferredMultiplierMax)).toBe(true);
    expect(amount.mul(first).lessThan(amount)).toBe(true);
  });
});
