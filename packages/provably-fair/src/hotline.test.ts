import { describe, it, expect } from 'vitest';
import {
  hotlineSpin,
  hotlineEvaluate,
  HOTLINE_REELS,
  HOTLINE_MINI_REELS,
  HOTLINE_ROWS,
  HOTLINE_MEGA_REELS,
  HOTLINE_MEGA_ROWS,
  HOTLINE_SYMBOLS,
  HOTLINE_MINI_SYMBOLS,
  HOTLINE_MEGA_SYMBOLS,
  getHotlineReelCount,
  getHotlineRowCount,
  hotlineBuyFreeSpins,
  hotlineSpinCascades,
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
    for (const col of grid) {
      expect(col.length).toBe(HOTLINE_ROWS);
      for (const sym of col) {
        expect(sym).toBeGreaterThanOrEqual(0);
        expect(sym).toBeLessThan(HOTLINE_MINI_SYMBOLS.length);
      }
    }
    expect(HOTLINE_MINI_SYMBOLS.length).toBe(HOTLINE_SYMBOLS.length);
    expect(getHotlineReelCount('temple-slot')).toBe(HOTLINE_MINI_REELS);
  });

  it('uses a dedicated 3x3 fixed-line paytable near 97% RTP', () => {
    const totalWeight = HOTLINE_MINI_SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0);
    const singleLineRtp = HOTLINE_MINI_SYMBOLS.reduce(
      (sum, symbol) => sum + (symbol.weight / totalWeight) ** 3 * symbol.payout3,
      0,
    );

    expect(Number((singleLineRtp * 5).toFixed(4))).toBe(0.9701);
    expect(HOTLINE_MINI_SYMBOLS.map((symbol) => symbol.payout3)).toEqual([
      2.1, 3.15, 5.3, 10.6, 22, 125,
    ]);
  });

  it('supports 6x5 mega slot variants', () => {
    const grid = hotlineSpin('s', 'c', 1, HOTLINE_MEGA_REELS, HOTLINE_MEGA_ROWS);
    expect(grid.length).toBe(HOTLINE_MEGA_REELS);
    for (const col of grid) {
      expect(col.length).toBe(HOTLINE_MEGA_ROWS);
      for (const sym of col) {
        expect(sym).toBeGreaterThanOrEqual(0);
        expect(sym).toBeLessThan(HOTLINE_MEGA_SYMBOLS.length);
      }
    }
    expect(HOTLINE_MEGA_SYMBOLS.length).toBe(9);
    expect(getHotlineReelCount('thunder-slot')).toBe(HOTLINE_MEGA_REELS);
    expect(getHotlineRowCount('thunder-slot')).toBe(HOTLINE_MEGA_ROWS);
  });

  it('uses the 9-symbol Power of Thor style mega paytable', () => {
    expect(
      HOTLINE_MEGA_SYMBOLS.map((symbol) => [symbol.payout3, symbol.payout4, symbol.payout5]),
    ).toEqual([
      [10, 25, 50],
      [2.5, 10, 25],
      [2, 5, 15],
      [1.5, 2, 12],
      [1, 1.5, 10],
      [0.8, 1.2, 8],
      [0.5, 1, 5],
      [0.4, 0.9, 4],
      [0.25, 0.75, 2],
    ]);
  });

  it('supports deterministic 6x5 cascade drops after cluster wins', () => {
    const nonce = Array.from({ length: 200 }, (_, i) => i).find(
      (i) =>
        hotlineSpinCascades('server', 'client', i, HOTLINE_MEGA_REELS, HOTLINE_MEGA_ROWS).cascades
          .length > 0,
    );
    expect(nonce).toBeDefined();
    const result = hotlineSpinCascades(
      'server',
      'client',
      nonce!,
      HOTLINE_MEGA_REELS,
      HOTLINE_MEGA_ROWS,
    );
    const firstGrid = hotlineSpin(
      'server',
      'client',
      nonce!,
      HOTLINE_MEGA_REELS,
      HOTLINE_MEGA_ROWS,
    );

    expect(result.initialGrid).toEqual(firstGrid);
    expect(result.cascades.length).toBeGreaterThan(0);
    expect(result.cascades[0]!.removed.length).toBeGreaterThan(0);
    expect(result.cascades[0]!.lines[0]!.positions?.length).toBeGreaterThanOrEqual(8);
    expect(result.finalGrid.length).toBe(HOTLINE_MEGA_REELS);
    for (const col of result.finalGrid) {
      expect(col.length).toBe(HOTLINE_MEGA_ROWS);
    }
    const stepTotal = result.cascades.reduce((sum, step) => sum + step.multiplier, 0);
    expect(result.features).toBeDefined();
    expect(result.features!.baseWinMultiplier).toBeGreaterThanOrEqual(Number(stepTotal.toFixed(4)));
    expect(result.totalMultiplier).toBe(result.features!.totalMultiplier);
  });

  it('adds deterministic mega multiplier symbols to winning cascades', () => {
    const result = Array.from({ length: 1200 }, (_, nonce) =>
      hotlineSpinCascades('server', 'client', nonce, HOTLINE_MEGA_REELS, HOTLINE_MEGA_ROWS),
    ).find((item) => (item.features?.baseMultiplierSymbols.length ?? 0) > 0);

    expect(result).toBeDefined();
    expect(result!.features!.baseMultiplierTotal).toBeGreaterThanOrEqual(2);
    expect(result!.features!.baseAppliedMultiplier).toBe(result!.features!.baseMultiplierTotal);
    expect(result!.totalMultiplier).toBeGreaterThanOrEqual(result!.features!.baseWinMultiplier);
  });

  it('triggers and accounts for mega free spins from scatter symbols', () => {
    const result = Array.from({ length: 1500 }, (_, nonce) =>
      hotlineSpinCascades(
        'bonus-server',
        'bonus-client',
        nonce,
        HOTLINE_MEGA_REELS,
        HOTLINE_MEGA_ROWS,
      ),
    ).find((item) => (item.features?.freeSpinsAwarded ?? 0) > 0);

    expect(result).toBeDefined();
    expect(result!.features!.scatterCount).toBeGreaterThanOrEqual(4);
    expect(result!.features!.freeSpinsAwarded).toBeGreaterThanOrEqual(15);
    expect(result!.features!.freeSpinsAwarded).toBeLessThanOrEqual(100);
    expect(result!.features!.freeSpinsPlayed).toBeGreaterThan(0);
    expect(result!.features!.freeSpinsPlayed).toBeLessThanOrEqual(
      result!.features!.freeSpinsAwarded,
    );
    expect(result!.features!.freeSpinRounds.length).toBe(result!.features!.freeSpinsPlayed);
  });

  it('buys deterministic mega free spins with a 15-spin trigger', () => {
    const result = hotlineBuyFreeSpins(
      'buy-server',
      'buy-client',
      7,
      HOTLINE_MEGA_REELS,
      HOTLINE_MEGA_ROWS,
    );
    const repeat = hotlineBuyFreeSpins(
      'buy-server',
      'buy-client',
      7,
      HOTLINE_MEGA_REELS,
      HOTLINE_MEGA_ROWS,
    );

    expect(result).toEqual(repeat);
    expect(result.cascades).toEqual([]);
    expect(result.lines).toEqual([]);
    expect(result.features).toBeDefined();
    expect(result.features!.scatterCount).toBe(4);
    expect(result.features!.scatterSymbols.length).toBe(4);
    expect(result.features!.freeSpinsAwarded).toBeGreaterThanOrEqual(15);
    expect(result.features!.freeSpinsAwarded).toBeLessThanOrEqual(100);
    expect(result.features!.freeSpinsPlayed).toBe(result.features!.freeSpinRounds.length);
    expect(result.totalMultiplier).toBe(result.features!.totalMultiplier);
  });
});

describe('hotlineEvaluate', () => {
  it('detects a 3-of-a-kind line', () => {
    const grid = [
      [0, 1, 2],
      [0, 3, 4],
      [0, 5, 0],
      [5, 2, 1],
      [3, 4, 2],
    ];
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
    expect(totalMultiplier).toBe(HOTLINE_MINI_SYMBOLS[5]!.payout3);
  });

  it('does not pay 6x5 mega clusters below eight matching symbols', () => {
    const grid = [
      [0, 1, 2, 3, 4],
      [5, 0, 1, 2, 3],
      [4, 5, 0, 1, 2],
      [3, 4, 5, 0, 1],
      [2, 3, 4, 5, 0],
      [1, 2, 3, 4, 5],
    ];
    const { lines, totalMultiplier } = hotlineEvaluate(grid);

    expect(lines.find((line) => line.symbol === 0)).toBeUndefined();
    expect(totalMultiplier).toBe(0);
  });

  it('evaluates 6x5 mega clusters by total matching positions', () => {
    const grid = [
      [5, 5, 0, 1, 2],
      [5, 1, 5, 2, 3],
      [5, 2, 3, 5, 4],
      [5, 3, 4, 0, 1],
      [5, 4, 0, 1, 2],
      [5, 0, 1, 2, 3],
    ];
    const { lines, totalMultiplier } = hotlineEvaluate(grid);
    const premium = lines.find((line) => line.symbol === 5 && line.direction === 'ltr');

    expect(premium).toBeDefined();
    expect(premium!.lineId).toBe('cluster-5');
    expect(premium!.count).toBe(9);
    expect(premium!.positions?.length).toBe(9);
    expect(premium!.payout).toBe(HOTLINE_MEGA_SYMBOLS[5]!.payout3);
    expect(totalMultiplier).toBeGreaterThanOrEqual(HOTLINE_MEGA_SYMBOLS[5]!.payout3);
  });
});
