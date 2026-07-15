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

  it('shapes controlled losses across soft, partial, and full-loss bands', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.8)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.95)
      .mockReturnValueOnce(0.2);

    const table = wheelTable('high', 20);
    const amount = new Prisma.Decimal(10);
    const control = { multiplier: new Prisma.Decimal(0) };
    const picks = Array.from({ length: 3 }, () =>
      __wheelServiceTestHooks.chooseWheelSegment(table, false, amount, control),
    );
    const multipliers = picks.map((segment) => table[segment]!);

    expect(multipliers[0]).toBeGreaterThanOrEqual(0.5);
    expect(multipliers[0]).toBeLessThan(1);
    expect(multipliers[1]).toBeGreaterThan(0);
    expect(multipliers[1]).toBeLessThan(0.5);
    expect(multipliers[2]).toBe(0);
  });

  it('uses loss shaping when a capped win has no legal winning segment', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.2);

    const table = wheelTable('high', 20);
    const amount = new Prisma.Decimal(1000);
    const control = {
      multiplier: new Prisma.Decimal(1.01),
      maxPayout: new Prisma.Decimal(500),
    };
    const picked = __wheelServiceTestHooks.chooseWheelSegment(table, true, amount, control);

    expect(table[picked]).toBeGreaterThanOrEqual(0.5);
    expect(table[picked]).toBeLessThan(1);
  });
});
