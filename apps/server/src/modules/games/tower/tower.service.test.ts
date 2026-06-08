import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { __towerServiceTestHooks } from './tower.service.js';

describe('Tower control helpers', () => {
  it('allows forced loss from the first picked level', () => {
    expect(__towerServiceTestHooks.canForceTowerLossAtLevel(0)).toBe(true);
    expect(__towerServiceTestHooks.canForceTowerLossAtLevel(1)).toBe(true);
  });

  it('only treats controlled wins as out of bounds when they exceed a ceiling', () => {
    const amount = new Prisma.Decimal(100);

    expect(
      __towerServiceTestHooks.multiplierExceedsTowerControlCeiling(
        new Prisma.Decimal('0.5'),
        amount,
        {},
      ),
    ).toBe(false);
    expect(
      __towerServiceTestHooks.multiplierExceedsTowerControlCeiling(
        new Prisma.Decimal('1.4'),
        amount,
        { maxPayout: new Prisma.Decimal(150) },
      ),
    ).toBe(false);
    expect(
      __towerServiceTestHooks.multiplierExceedsTowerControlCeiling(
        new Prisma.Decimal('2'),
        amount,
        { maxPayout: new Prisma.Decimal(150) },
      ),
    ).toBe(true);
    expect(
      __towerServiceTestHooks.multiplierExceedsTowerControlCeiling(
        new Prisma.Decimal('3'),
        amount,
        { maxMultiplier: new Prisma.Decimal(2) },
      ),
    ).toBe(true);
  });
});
