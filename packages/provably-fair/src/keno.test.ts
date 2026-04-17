import { describe, it, expect } from 'vitest';
import {
  kenoDraw,
  kenoEvaluate,
  kenoMultiplier,
  KENO_POOL_SIZE,
  KENO_DRAW_COUNT,
} from './keno.js';

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
});
