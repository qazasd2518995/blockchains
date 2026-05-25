import { describe, expect, it } from 'vitest';
import { kenoEvaluate } from '@bg/provably-fair';
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
});
