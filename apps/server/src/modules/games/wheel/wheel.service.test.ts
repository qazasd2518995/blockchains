import { Prisma } from '@prisma/client';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { wheelTable } from '@bg/provably-fair';
import { __wheelServiceTestHooks } from './wheel.service.js';

describe('wheel controlled segment shaping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('varies controlled wins inside legal bounds', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.01)
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.45);

    const table = wheelTable('low', 10);
    const amount = new Prisma.Decimal(10);
    const control = {
      multiplier: new Prisma.Decimal(1.5),
      minMultiplier: new Prisma.Decimal(1.01),
      maxMultiplier: new Prisma.Decimal(2),
    };
    const picks = Array.from({ length: 3 }, () =>
      __wheelServiceTestHooks.chooseWheelSegment(table, true, amount, control),
    );

    expect(new Set(picks).size).toBeGreaterThan(1);
    expect(picks.every((segment) => table[segment]! > 1 && table[segment]! <= 2)).toBe(true);
  });
});
