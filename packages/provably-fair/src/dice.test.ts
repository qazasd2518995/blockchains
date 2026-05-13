import { describe, it, expect } from 'vitest';
import {
  diceRoll,
  diceWinChance,
  diceMultiplier,
  diceDidWin,
  diceDetermine,
  DICE_HOUSE_EDGE,
  DICE_MAX_TARGET,
  DICE_MIN_TARGET,
} from './dice.js';

describe('diceRoll', () => {
  it('returns a number in [0, 99.99]', () => {
    for (let nonce = 1; nonce <= 100; nonce += 1) {
      const { roll } = diceRoll('server-seed-fixed', 'client', nonce);
      expect(roll).toBeGreaterThanOrEqual(0);
      expect(roll).toBeLessThan(100);
      expect(Number.isFinite(roll)).toBe(true);
    }
  });

  it('is deterministic for fixed seed/nonce', () => {
    const a = diceRoll('seed', 'client', 1).roll;
    const b = diceRoll('seed', 'client', 1).roll;
    expect(a).toBe(b);
  });

  it('rounds to two decimals', () => {
    for (let nonce = 1; nonce <= 50; nonce += 1) {
      const { roll } = diceRoll('seed', 'client', nonce);
      const str = roll.toFixed(2);
      expect(Number.parseFloat(str)).toBeCloseTo(roll, 10);
    }
  });

  it('distributes roughly uniformly across 1,000 samples', () => {
    const buckets = new Array(10).fill(0) as number[];
    for (let nonce = 1; nonce <= 1000; nonce += 1) {
      const { roll } = diceRoll('fair-test-seed', 'client', nonce);
      const idx = Math.min(9, Math.floor(roll / 10));
      buckets[idx] = (buckets[idx] ?? 0) + 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(50);
      expect(count).toBeLessThan(180);
    }
  });
});

describe('diceWinChance', () => {
  it('returns target for under direction', () => {
    expect(diceWinChance(50, 'under')).toBe(50);
    expect(diceWinChance(25.5, 'under')).toBe(25.5);
  });

  it('returns 100 - target for over direction', () => {
    expect(diceWinChance(50, 'over')).toBe(50);
    expect(diceWinChance(25.5, 'over')).toBe(74.5);
  });
});

describe('diceMultiplier', () => {
  it('applies 3.5% house edge', () => {
    expect(diceMultiplier(50)).toBeCloseTo(1.93, 4);
    expect(diceMultiplier(10)).toBeCloseTo(9.65, 4);
    expect(diceMultiplier(96)).toBeCloseTo(1.0052, 4);
  });

  it('returns 0 for zero chance', () => {
    expect(diceMultiplier(0)).toBe(0);
  });

  it('produces RTP of 96.5% at any target', () => {
    for (const winChance of [10, 25, 50, 75, 90]) {
      const rtp = (winChance / 100) * diceMultiplier(winChance);
      expect(rtp).toBeCloseTo(1 - DICE_HOUSE_EDGE, 3);
    }
  });
});

describe('diceDidWin', () => {
  it('uses displayed two-decimal boundaries consistently', () => {
    expect(diceDidWin(49.99, 50, 'under')).toBe(true);
    expect(diceDidWin(50, 50, 'under')).toBe(false);
    expect(diceDidWin(50, 50, 'over')).toBe(true);
    expect(diceDidWin(49.99, 50, 'over')).toBe(false);
    expect(diceDidWin(99.99, 99.99, 'over')).toBe(true);
  });
});

describe('diceDetermine', () => {
  it('wins when roll under target for under direction', () => {
    const r = diceDetermine('seed', 'client', 1, DICE_MAX_TARGET, 'under');
    expect(r.won).toBe(true);
    expect(r.multiplier).toBeGreaterThan(0);
  });

  it('loses when roll over target for under direction', () => {
    const r = diceDetermine('seed', 'client', 1, DICE_MIN_TARGET, 'under');
    expect(r.won).toBe(false);
    expect(r.multiplier).toBe(0);
  });

  it('wins when roll over target for over direction', () => {
    const r = diceDetermine('seed', 'client', 1, DICE_MIN_TARGET, 'over');
    expect(r.won).toBe(true);
  });

  it('rejects out-of-range targets', () => {
    expect(() => diceDetermine('s', 'c', 1, DICE_MIN_TARGET - 0.01, 'under')).toThrow();
    expect(() => diceDetermine('s', 'c', 1, DICE_MAX_TARGET + 0.01, 'under')).toThrow();
  });

  it('approaches 96.5% RTP over large samples', () => {
    let totalPayout = 0;
    const totalBet = 10000;
    for (let nonce = 1; nonce <= totalBet; nonce += 1) {
      const r = diceDetermine('rtp-test', 'client', nonce, 50, 'under');
      if (r.won) totalPayout += r.multiplier;
    }
    const rtp = totalPayout / totalBet;
    expect(rtp).toBeGreaterThan(0.92);
    expect(rtp).toBeLessThan(1.06);
  });
});
