import { describe, it, expect } from 'vitest';
import { wheelSpin, wheelMultiplier, wheelTable, type WheelRisk, type WheelSegmentCount } from './wheel.js';

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

  it('keeps every risk and segment table below 100% RTP', () => {
    const risks: WheelRisk[] = ['low', 'medium', 'high'];
    const segments: WheelSegmentCount[] = [10, 20, 30, 40, 50];
    for (const risk of risks) {
      for (const segmentCount of segments) {
        const table = wheelTable(risk, segmentCount);
        const rtp = table.reduce((sum, multiplier) => sum + multiplier, 0) / table.length;
        expect(rtp).toBeGreaterThan(0.989);
        expect(rtp).toBeLessThanOrEqual(0.99);
      }
    }
  });
});
