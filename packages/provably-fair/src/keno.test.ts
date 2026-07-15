import { describe, it, expect } from 'vitest';
import { kenoDraw, kenoEvaluate, kenoMultiplier, KENO_POOL_SIZE, KENO_DRAW_COUNT } from './keno.js';

describe('kenoDraw', () => {
  it('produces exactly KENO_DRAW_COUNT unique numbers', () => {
    const drawn = kenoDraw('seed', 'client', 1);
    expect(drawn.length).toBe(KENO_DRAW_COUNT);
    expect(new Set(drawn).size).toBe(KENO_DRAW_COUNT);
  });

  it('all numbers within 1..pool size', () => {
    const drawn = kenoDraw('seed', 'client', 1);
    for (const n of drawn) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(KENO_POOL_SIZE);
    }
  });

  it('is deterministic and sorted', () => {
    const a = kenoDraw('seed', 'client', 5);
    const b = kenoDraw('seed', 'client', 5);
    expect(a).toEqual(b);
    const sorted = [...a].sort((x, y) => x - y);
    expect(a).toEqual(sorted);
  });
});

describe('kenoEvaluate', () => {
  it('counts hits correctly', () => {
    const r = kenoEvaluate([1, 2, 3, 4, 5], [3, 7, 5]);
    expect(r.hits).toEqual(expect.arrayContaining([3, 5]));
    expect(r.misses).toContain(7);
  });
});

describe('kenoMultiplier', () => {
  it('returns 0 for invalid picks', () => {
    expect(kenoMultiplier('low', 0, 0)).toBe(0);
  });
  it('returns positive payout for matching table', () => {
    expect(kenoMultiplier('medium', 3, 3)).toBeGreaterThan(0);
  });

  it('provides a partial-loss outcome for every risk and pick count', () => {
    for (const risk of ['low', 'medium', 'high'] as const) {
      for (let picks = 1; picks <= 10; picks += 1) {
        const multipliers = Array.from({ length: picks + 1 }, (_, hits) =>
          kenoMultiplier(risk, picks, hits),
        );
        expect(
          multipliers.some((multiplier) => multiplier > 0 && multiplier < 1),
          `${risk}/${picks} should have a partial loss`,
        ).toBe(true);
      }
    }
  });

  it('keeps every shaped row inside the existing RTP range', () => {
    for (const risk of ['low', 'medium', 'high'] as const) {
      for (let picks = 1; picks <= 10; picks += 1) {
        const expectedReturn = Array.from({ length: picks + 1 }, (_, hits) => {
          const probability =
            (combination(picks, hits) * combination(40 - picks, 10 - hits)) / combination(40, 10);
          return probability * kenoMultiplier(risk, picks, hits);
        }).reduce((sum, value) => sum + value, 0);

        expect(expectedReturn, `${risk}/${picks} RTP`).toBeGreaterThanOrEqual(0.979);
        expect(expectedReturn, `${risk}/${picks} RTP`).toBeLessThanOrEqual(0.991);
      }
    }
  });
});

function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const count = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= count; index += 1) {
    result = (result * (n - count + index)) / index;
  }
  return result;
}
