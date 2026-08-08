import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import type { FruitMaryBetSelection } from '@bg/provably-fair';
import { chooseControlledFruitOutcome } from './fruitMary.service.js';

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
});
