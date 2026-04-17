import { describe, it, expect } from 'vitest';
import {
  hiloDraw,
  hiloProbHigherOrEqual,
  hiloProbLowerOrEqual,
  hiloMultiplier,
} from './hilo.js';

describe('hiloDraw', () => {
  it('returns rank in 1..13', () => {
    for (let i = 0; i < 50; i += 1) {
      const draw = hiloDraw('seed', 'client', 1, i);
      expect(draw.rank).toBeGreaterThanOrEqual(1);
      expect(draw.rank).toBeLessThanOrEqual(13);
      expect(draw.suit).toBeGreaterThanOrEqual(0);
      expect(draw.suit).toBeLessThanOrEqual(3);
    }
  });

  it('is deterministic', () => {
    const a = hiloDraw('s', 'c', 1, 0);
    const b = hiloDraw('s', 'c', 1, 0);
    expect(a).toEqual(b);
  });
});

describe('hiloProbs', () => {
  it('sums to > 1 when rank is middle (overlap on same rank)', () => {
    // 中間 rank 時「大於等於」+「小於等於」會有重疊，因為同值也算
    const high = hiloProbHigherOrEqual(7);
    const low = hiloProbLowerOrEqual(7);
    expect(high + low).toBeGreaterThan(1);
  });

  it('K (13) has 1/13 higher-or-equal', () => {
    expect(hiloProbHigherOrEqual(13)).toBeCloseTo(1 / 13, 5);
  });

  it('A (1) has 1/13 lower-or-equal', () => {
    expect(hiloProbLowerOrEqual(1)).toBeCloseTo(1 / 13, 5);
  });
});

describe('hiloMultiplier', () => {
  it('applies 2% house edge', () => {
    expect(hiloMultiplier(0.5)).toBeCloseTo(1.96, 3);
  });

  it('returns 0 for impossible chance', () => {
    expect(hiloMultiplier(0)).toBe(0);
  });
});
