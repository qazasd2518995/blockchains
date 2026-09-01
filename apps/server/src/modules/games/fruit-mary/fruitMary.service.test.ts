import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import type { FruitMaryBetSelection } from '@bg/provably-fair';
import {
  chooseControlledFruitOutcome,
  fruitMaryGambleAllocationStatus,
  resolveFruitMaryBettingLimit,
} from './fruitMary.service.js';
import { fruitMaryGambleSchema } from './fruitMary.schema.js';

const bets: FruitMaryBetSelection[] = [
  { fruitId: 4, units: 2 },
  { fruitId: 16, units: 2 },
  { fruitId: 20, units: 2 },
  { fruitId: 8, units: 2 },
  { fruitId: 2, units: 2 },
  { fruitId: 19, units: 2 },
  { fruitId: 13, units: 2 },
  { fruitId: 5, units: 2 },
];

describe('Fruit Mary control outcome selection', () => {
  it('returns a zero-payout light for a requested loss', () => {
    const result = chooseControlledFruitOutcome(bets, new Prisma.Decimal(16), {
      won: false,
      multiplier: new Prisma.Decimal(0),
      minMultiplier: undefined,
      maxMultiplier: new Prisma.Decimal(1),
      maxPayout: undefined,
    });
    expect(result.totalPayoutUnits).toBe(0);
    expect([10, 22]).toContain(result.positions[0]);
  });

  it('returns a bounded winning light for a requested win', () => {
    const result = chooseControlledFruitOutcome(bets, new Prisma.Decimal(16), {
      won: true,
      multiplier: new Prisma.Decimal(1.25),
      minMultiplier: new Prisma.Decimal(1.01),
      maxMultiplier: new Prisma.Decimal(2),
      maxPayout: new Prisma.Decimal(32),
    });
    expect(result.totalPayoutUnits).toBeGreaterThan(16);
    expect(result.totalPayoutUnits).toBeLessThanOrEqual(32);
  });

  it('applies the room denomination when checking monetary payout bounds', () => {
    const result = chooseControlledFruitOutcome(
      bets,
      new Prisma.Decimal(160),
      {
        won: true,
        multiplier: new Prisma.Decimal(1.25),
        minMultiplier: new Prisma.Decimal(1.01),
        maxMultiplier: new Prisma.Decimal(2),
        maxPayout: new Prisma.Decimal(320),
      },
      10,
    );
    expect(result.totalPayoutUnits).toBeGreaterThan(16);
    expect(result.totalPayoutUnits).toBeLessThanOrEqual(32);
  });

  it('rotates equivalent controlled results instead of always using one fruit position', () => {
    const results = Array.from({ length: 30 }, (_, entropy) =>
      chooseControlledFruitOutcome(
        bets,
        new Prisma.Decimal(16),
        {
          won: true,
          multiplier: new Prisma.Decimal(1.25),
          minMultiplier: new Prisma.Decimal(1.01),
          maxMultiplier: new Prisma.Decimal(2),
          maxPayout: new Prisma.Decimal(32),
        },
        1,
        entropy,
      ),
    );
    const presentations = new Set(
      results.map((result) => `${result.legacyType}:${result.positions.join(',')}`),
    );

    expect(presentations.size).toBeGreaterThan(3);
    expect(results.some((result) => result.legacyType !== 0)).toBe(true);
    for (const result of results) {
      expect(result.totalPayoutUnits).toBeGreaterThan(16);
      expect(result.totalPayoutUnits).toBeLessThanOrEqual(32);
    }
  });

  it('uses two or three post-LUCKY lights for controlled bonus presentations', () => {
    const result = chooseControlledFruitOutcome(
      [{ fruitId: 13, units: 10 }],
      new Prisma.Decimal(10),
      {
        won: false,
        multiplier: new Prisma.Decimal(0),
        minMultiplier: new Prisma.Decimal(0),
        maxMultiplier: new Prisma.Decimal(1),
        maxPayout: new Prisma.Decimal(10),
      },
      1,
      0,
    );

    expect(result.legacyType).not.toBe(0);
    expect([10, 22]).toContain(result.positions[0]);
    expect(result.positions.length).toBeGreaterThanOrEqual(3);
    expect(result.positions.length).toBeLessThanOrEqual(4);
    expect(result.totalPayoutUnits).toBe(0);
    expect(result.positions.slice(1).some((position) => ![10, 22].includes(position))).toBe(true);
  });
});

describe('Fruit Mary gamble allocation', () => {
  it('allows moving part of the pending win back to balance', () => {
    expect(fruitMaryGambleAllocationStatus(100, 40, 500)).toBe('ok');
  });

  it('allows adding wallet balance to the pending gamble amount', () => {
    expect(fruitMaryGambleAllocationStatus(100, 200, 500)).toBe('ok');
  });

  it('still rejects expired rounds and amounts above the actual balance', () => {
    expect(fruitMaryGambleAllocationStatus(0, 40, 500)).toBe('expired');
    expect(fruitMaryGambleAllocationStatus(100, 501, 500)).toBe('insufficient');
  });

  it('accepts a positive text-entered round amount', () => {
    expect(fruitMaryGambleSchema.parse({ balance: '123', size: 1 }).balance).toBe(123);
  });

  it('rejects empty, zero and negative round amounts', () => {
    expect(() => fruitMaryGambleSchema.parse({ balance: '', size: 1 })).toThrow();
    expect(() => fruitMaryGambleSchema.parse({ balance: 0, size: 1 })).toThrow();
    expect(() => fruitMaryGambleSchema.parse({ balance: -1, size: 1 })).toThrow();
  });
});

describe('Fruit Mary betting limit contract', () => {
  it('returns the game-specific member limit used by settlement validation', () => {
    expect(
      resolveFruitMaryBettingLimit(
        { 'fruit-mary': 'range_10_5000' },
        'range_1000_10000',
        100_000,
      ),
    ).toEqual({ min: 10, max: 5000 });
  });

  it('still honors the deployment-wide maximum', () => {
    expect(resolveFruitMaryBettingLimit({}, 'range_5000_50000', 20_000)).toEqual({
      min: 5000,
      max: 20_000,
    });
  });
});
