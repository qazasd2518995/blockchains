import { describe, it, expect } from 'vitest';
import {
  hotlineSpin,
  hotlineEvaluate,
  HOTLINE_REELS,
  HOTLINE_MINI_REELS,
  HOTLINE_ROWS,
  HOTLINE_MEGA_REELS,
  HOTLINE_MEGA_ROWS,
  HOTLINE_MEGA_BUY_FEATURE_MAX_TOTAL_MULTIPLIER,
  HOTLINE_SYMBOLS,
  HOTLINE_MINI_SYMBOLS,
  HOTLINE_MEGA_SYMBOLS,
  getHotlineReelCount,
  getHotlineRowCount,
  hotlineBuyFreeSpins,
  hotlineSpinCascades,
} from './hotline.js';

function megaScatterPayout(count: number): number {
  if (count >= 6) return 100;
  if (count === 5) return 5;
  if (count === 4) return 3;
  return 0;
}

function positionKey(position: { reel: number; row: number }): string {
  return `${position.reel}:${position.row}`;
}

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

  it('uses separate 8-symbol paytables for fixed-line variants', () => {
    expect(HOTLINE_MINI_SYMBOLS.map((symbol) => symbol.payout3)).toEqual([
      3, 3.3, 3.6, 4, 4.2, 4.5, 4.8, 5,
    ]);
    expect(
      HOTLINE_SYMBOLS.map((symbol) => [symbol.payout3, symbol.payout4, symbol.payout5]),
    ).toEqual([
      [1.3, 3.3, 10],
      [1.6, 5, 13],
      [2, 6.5, 20],
      [2.5, 8, 26],
      [3.3, 13, 50],
      [5, 20, 85],
      [8, 35, 135],
      [13, 65, 250],
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
    expect(HOTLINE_MEGA_SYMBOLS.length).toBe(8);
    expect(getHotlineReelCount('thunder-slot')).toBe(HOTLINE_MEGA_REELS);
    expect(getHotlineRowCount('thunder-slot')).toBe(HOTLINE_MEGA_ROWS);
  });

  it('uses the 8-symbol soft-hit mega paytable', () => {
    expect(
      HOTLINE_MEGA_SYMBOLS.map((symbol) => [symbol.payout3, symbol.payout4, symbol.payout5]),
    ).toEqual([
      [0.112, 0.224, 0.448],
      [0.168, 0.336, 0.56],
      [0.224, 0.448, 0.728],
      [0.28, 0.56, 0.896],
      [0.392, 0.784, 1.344],
      [0.504, 1.008, 1.568],
      [0.616, 1.232, 1.792],
      [0.728, 1.456, 2.016],
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

    const symbolWinMultiplier = Number(
      result!.cascades.reduce((sum, step) => sum + step.multiplier, 0).toFixed(4),
    );
    const scatterMultiplier = megaScatterPayout(result!.features!.scatterCount);
    expect(symbolWinMultiplier).toBeGreaterThan(0);
    expect(result!.features!.baseTotalMultiplier).toBe(
      Number(
        (scatterMultiplier + symbolWinMultiplier * result!.features!.baseAppliedMultiplier).toFixed(
          4,
        ),
      ),
    );

    const scatterPositions = new Set(result!.features!.scatterSymbols.map(positionKey));
    for (const multiplier of result!.features!.baseMultiplierSymbols) {
      expect(scatterPositions.has(positionKey(multiplier))).toBe(false);
    }
  });

  it('does not create mega multiplier symbols without normal symbol clears', () => {
    const results = Array.from({ length: 900 }, (_, nonce) =>
      hotlineSpinCascades(
        'scatter-server',
        'scatter-client',
        nonce,
        HOTLINE_MEGA_REELS,
        HOTLINE_MEGA_ROWS,
      ),
    );

    for (const result of results) {
      const features = result.features;
      if (!features) continue;
      if (features.baseMultiplierSymbols.length > 0) {
        expect(result.cascades.length).toBeGreaterThan(0);
        expect(result.cascades.reduce((sum, step) => sum + step.multiplier, 0)).toBeGreaterThan(0);
      }
      const scatterPositions = new Set(features.scatterSymbols.map(positionKey));
      for (const multiplier of features.baseMultiplierSymbols) {
        expect(scatterPositions.has(positionKey(multiplier))).toBe(false);
      }

      for (const round of features.freeSpinRounds) {
        if (round.multiplierSymbols.length > 0) {
          expect(round.cascades.length).toBeGreaterThan(0);
          expect(round.cascades.reduce((sum, step) => sum + step.multiplier, 0)).toBeGreaterThan(0);
        }
        const roundScatterPositions = new Set(round.scatterSymbols.map(positionKey));
        for (const multiplier of round.multiplierSymbols) {
          expect(roundScatterPositions.has(positionKey(multiplier))).toBe(false);
        }
      }
    }
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
    expect(result.totalMultiplier).toBeLessThanOrEqual(
      HOTLINE_MEGA_BUY_FEATURE_MAX_TOTAL_MULTIPLIER,
    );
  });

  it('produces varied mega buy-feature payouts across 30 rounds', () => {
    const baseAmount = 20;
    const stakeAmount = baseAmount * 100;
    const payouts = Array.from({ length: 30 }, (_, nonce) => {
      const result = hotlineBuyFreeSpins(
        'variation-server',
        'variation-client',
        nonce,
        HOTLINE_MEGA_REELS,
        HOTLINE_MEGA_ROWS,
      );
      return Number((baseAmount * result.totalMultiplier).toFixed(2));
    });

    expect(new Set(payouts).size).toBe(30);
    expect(Math.max(...payouts)).toBeLessThanOrEqual(stakeAmount * 2);
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
