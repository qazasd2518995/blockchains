import { describe, it, expect } from 'vitest';
import {
  hotlineSpin,
  hotlineEvaluate,
  HOTLINE_REELS,
  HOTLINE_MINI_REELS,
  HOTLINE_ROWS,
  HOTLINE_SYMBOLS,
  getHotlineReelCount,
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

  it('supports 3x3 slot variants', () => {
    const grid = hotlineSpin('s', 'c', 1, HOTLINE_MINI_REELS);
    expect(grid.length).toBe(HOTLINE_MINI_REELS);
    expect(getHotlineReelCount('temple-slot')).toBe(HOTLINE_MINI_REELS);
  });
});

describe('hotlineEvaluate', () => {
  it('detects a 3-of-a-kind line', () => {
    const grid = [[0, 1, 2], [0, 3, 4], [0, 5, 0], [5, 2, 1], [3, 4, 2]];
    const { lines } = hotlineEvaluate(grid);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0]!.symbol).toBe(0);
    expect(lines[0]!.count).toBe(3);
    expect(lines[0]!.lineId).toBe('top');
    expect(lines[0]!.startReel).toBe(0);
    expect(lines[0]!.direction).toBe('ltr');
    expect(lines[0]!.path).toEqual([0, 0, 0, 0, 0]);
  });

  it('detects a V-shaped diagonal payline', () => {
    const grid = [
      [5, 1, 2],
      [1, 5, 3],
      [2, 2, 5],
      [3, 5, 4],
      [5, 2, 4],
    ];
    const { lines, totalMultiplier } = hotlineEvaluate(grid);
    const line = lines.find((l) => l.lineId === 'v-down');

    expect(line).toBeDefined();
    expect(line!.symbol).toBe(5);
    expect(line!.count).toBe(5);
    expect(line!.startReel).toBe(0);
    expect(line!.direction).toBe('ltr');
    expect(line!.path).toEqual([0, 1, 2, 1, 0]);
    expect(totalMultiplier).toBe(HOTLINE_SYMBOLS[5]!.payout5);
  });

  it('does not count matching symbols unless they follow a payline from either edge', () => {
    const grid = [
      [3, 5, 0],
      [2, 5, 3],
      [2, 3, 4],
      [0, 4, 0],
      [5, 0, 3],
    ];
    const { lines, totalMultiplier } = hotlineEvaluate(grid);

    expect(lines).toEqual([]);
    expect(totalMultiplier).toBe(0);
  });

  it('detects a 3-symbol run from the right edge', () => {
    const grid = [
      [3, 1, 0],
      [2, 0, 1],
      [1, 2, 0],
      [1, 1, 1],
      [1, 0, 3],
    ];
    const { lines, totalMultiplier } = hotlineEvaluate(grid);
    const line = lines.find((l) => l.lineId === 'top' && l.startReel === 2);

    expect(line).toBeDefined();
    expect(line!.symbol).toBe(1);
    expect(line!.count).toBe(3);
    expect(line!.row).toBe(0);
    expect(line!.direction).toBe('rtl');
    expect(totalMultiplier).toBeGreaterThanOrEqual(HOTLINE_SYMBOLS[1]!.payout3);
  });

  it('does not pay a middle-only run on a fixed payline', () => {
    const grid = [
      [3, 0, 4],
      [1, 2, 5],
      [1, 3, 0],
      [1, 4, 2],
      [2, 5, 3],
    ];
    const { lines, totalMultiplier } = hotlineEvaluate(grid);

    expect(lines).toEqual([]);
    expect(totalMultiplier).toBe(0);
  });

  it('evaluates 3x3 diagonal paylines', () => {
    const grid = [
      [1, 0, 5],
      [0, 5, 2],
      [5, 4, 3],
    ];
    const { lines, totalMultiplier } = hotlineEvaluate(grid);
    const line = lines.find((l) => l.lineId === 'diag-up');

    expect(line).toBeDefined();
    expect(line!.path).toEqual([2, 1, 0]);
    expect(line!.symbol).toBe(5);
    expect(line!.count).toBe(3);
    expect(line!.startReel).toBe(0);
    expect(line!.direction).toBe('ltr');
    expect(totalMultiplier).toBe(HOTLINE_SYMBOLS[5]!.payout3);
  });
});
