import { describe, it, expect } from 'vitest';
import {
  hotlineSpin,
  hotlineEvaluate,
  HOTLINE_REELS,
  HOTLINE_ROWS,
  HOTLINE_SYMBOLS,
} from './hotline.js';

describe('hotlineSpin', () => {
  it('returns grid of HOTLINE_REELS cols × HOTLINE_ROWS rows', () => {
    const grid = hotlineSpin('s', 'c', 1);
    expect(grid.length).toBe(HOTLINE_REELS);
    for (const col of grid) {
      expect(col.length).toBe(HOTLINE_ROWS);
      for (const sym of col) {
        expect(sym).toBeGreaterThanOrEqual(0);
        expect(sym).toBeLessThan(HOTLINE_SYMBOLS.length);
      }
    }
  });

  it('is deterministic', () => {
    expect(hotlineSpin('s', 'c', 1)).toEqual(hotlineSpin('s', 'c', 1));
  });
});

describe('hotlineEvaluate', () => {
  it('detects a 3-of-a-kind line', () => {
    const grid = [[0, 1, 2], [0, 3, 4], [0, 5, 0], [5, 2, 1], [3, 4, 2]];
    const { lines } = hotlineEvaluate(grid);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0]!.symbol).toBe(0);
    expect(lines[0]!.count).toBe(3);
  });
});
