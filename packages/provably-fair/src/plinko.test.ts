import { describe, it, expect } from 'vitest';
import { plinkoPath, plinkoMultiplier, plinkoTable } from './plinko.js';

describe('plinkoPath', () => {
  it('returns path length equal to rows', () => {
    const { path, bucket } = plinkoPath('s', 'c', 1, 12);
    expect(path.length).toBe(12);
    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThanOrEqual(12);
  });

  it('bucket = right count', () => {
    const { path, bucket } = plinkoPath('s', 'c', 1, 16);
    const rights = path.filter((p) => p === 'right').length;
    expect(bucket).toBe(rights);
  });

  it('rejects out of range rows', () => {
    expect(() => plinkoPath('s', 'c', 1, 5)).toThrow();
    expect(() => plinkoPath('s', 'c', 1, 20)).toThrow();
  });
});

describe('plinkoMultiplier', () => {
  it('returns valid multiplier for all buckets', () => {
    for (let b = 0; b <= 12; b += 1) {
      expect(plinkoMultiplier('medium', 12, b)).toBeGreaterThanOrEqual(0);
    }
  });

  it('edge buckets > middle buckets for high risk', () => {
    const table = plinkoTable('high', 12);
    expect(table[0]!).toBeGreaterThan(table[6]!);
    expect(table[12]!).toBeGreaterThan(table[6]!);
  });
});
