import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { kenoEvaluate, kenoMultiplier } from '@bg/provably-fair';
import { __kenoServiceTestHooks } from './keno.service.js';

function longestRun(numbers: number[]): number {
  const sorted = [...numbers].sort((a, b) => a - b);
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] === sorted[i - 1]! + 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}

describe('keno controlled draw shaping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not fill controlled single-hit draws with 1..9 before the hit', () => {
    const drawn = __kenoServiceTestHooks.drawWithHitCount(
      [13],
      1,
      [2, 6, 9, 12, 18, 21, 24, 28, 33, 39],
    );

    expect(drawn).toHaveLength(10);
    expect(new Set(drawn).size).toBe(10);
    expect(kenoEvaluate(drawn, [13]).hits).toEqual([13]);
    expect(drawn).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 13]);
    expect(drawn.some((number) => number > 13)).toBe(true);
    expect(longestRun(drawn)).toBeLessThanOrEqual(3);
  });

  it('keeps requested hit count without forcing edge-only hits', () => {
    const selected = [3, 8, 13, 21, 34];
    const drawn = __kenoServiceTestHooks.drawWithHitCount(
      selected,
      2,
      [4, 7, 10, 14, 19, 22, 25, 29, 35, 38],
    );
    const hits = kenoEvaluate(drawn, selected).hits;
    const hitIndexes = drawn
      .map((number, index) => (hits.includes(number) ? index : -1))
      .filter((index) => index >= 0);

    expect(drawn).toHaveLength(10);
    expect(new Set(drawn).size).toBe(10);
    expect(hits).toHaveLength(2);
    expect(longestRun(drawn)).toBeLessThanOrEqual(3);
    expect(hitIndexes.some((index) => index > 0 && index < drawn.length - 1)).toBe(true);
  });

  it('shapes controlled losses across soft, partial, and full-loss bands', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.8)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.95)
      .mockReturnValueOnce(0.2);

    const picks = Array.from({ length: 3 }, () =>
      __kenoServiceTestHooks.chooseKenoHitCount('high', 8, false, new Prisma.Decimal(10), {
        multiplier: new Prisma.Decimal(0),
      }),
    );
    const multipliers = picks.map((hits) => kenoMultiplier('high', 8, hits));

    expect(multipliers[0]).toBeGreaterThanOrEqual(0.5);
    expect(multipliers[0]).toBeLessThan(1);
    expect(multipliers[1]).toBeGreaterThan(0);
    expect(multipliers[1]).toBeLessThan(0.5);
    expect(multipliers[2]).toBe(0);
  });

  it('uses loss shaping when a capped win has no legal hit count', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.2);

    const hits = __kenoServiceTestHooks.chooseKenoHitCount(
      'medium',
      8,
      true,
      new Prisma.Decimal(1000),
      {
        multiplier: new Prisma.Decimal(1.01),
        maxPayout: new Prisma.Decimal(500),
      },
    );
    const multiplier = kenoMultiplier('medium', 8, hits);

    expect(multiplier).toBeGreaterThanOrEqual(0.5);
    expect(multiplier).toBeLessThan(1);
  });
});
