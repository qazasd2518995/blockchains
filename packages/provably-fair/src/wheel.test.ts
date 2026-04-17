import { describe, it, expect } from 'vitest';
import { wheelSpin, wheelMultiplier, wheelTable } from './wheel.js';

describe('wheelSpin', () => {
  it('segmentIndex within range', () => {
    for (let n = 1; n <= 100; n += 1) {
      const { segmentIndex } = wheelSpin('s', 'c', n, 20);
      expect(segmentIndex).toBeGreaterThanOrEqual(0);
      expect(segmentIndex).toBeLessThan(20);
    }
  });

  it('is deterministic', () => {
    expect(wheelSpin('s', 'c', 1, 10)).toEqual(wheelSpin('s', 'c', 1, 10));
  });
});

describe('wheelMultiplier', () => {
  it('returns a number >= 0 for any valid index', () => {
    const table = wheelTable('medium', 20);
    for (let i = 0; i < 20; i += 1) {
      expect(wheelMultiplier('medium', 20, i)).toBeGreaterThanOrEqual(0);
      expect(wheelMultiplier('medium', 20, i)).toBe(table[i]);
    }
  });
});
