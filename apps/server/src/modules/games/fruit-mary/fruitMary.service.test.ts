import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import type { FruitMaryBetSelection } from '@bg/provably-fair';
import {
  chooseControlledFruitOutcome,
  fruitMaryGambleAllocationStatus,
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
