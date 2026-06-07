import { describe, it, expect } from 'vitest';
import {
  minesPositions,
  minesMultiplier,
  minesNextMultiplier,
  MINES_GRID_SIZE,
  MINES_MIN_COUNT,
  MINES_MAX_COUNT,
  MINES_HOUSE_EDGE,
  MINES_MIN_SAFE_MULTIPLIER,
} from './mines.js';

describe('minesPositions', () => {
  it('returns the requested mine count', () => {
    for (let count = 1; count <= 24; count += 1) {
      const pos = minesPositions('seed', 'client', 1, count);
      expect(pos.length).toBe(count);
    }
  });

  it('produces values within grid bounds', () => {
    const pos = minesPositions('seed', 'client', 1, 10);
    for (const p of pos) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(MINES_GRID_SIZE);
    }
  });

  it('produces unique positions', () => {
    const pos = minesPositions('seed', 'client', 1, 20);
    expect(new Set(pos).size).toBe(20);
  });

  it('is deterministic', () => {
    const a = minesPositions('seed', 'client', 1, 5);
    const b = minesPositions('seed', 'client', 1, 5);
    expect(a).toEqual(b);
  });

  it('rejects out-of-range mine counts', () => {
    expect(() => minesPositions('s', 'c', 1, 0)).toThrow();
    expect(() => minesPositions('s', 'c', 1, 25)).toThrow();
    expect(() => minesPositions('s', 'c', 1, MINES_MIN_COUNT - 1)).toThrow();
    expect(() => minesPositions('s', 'c', 1, MINES_MAX_COUNT + 1)).toThrow();
  });

  it('changes with different nonces', () => {
    const a = minesPositions('seed', 'client', 1, 5);
    const b = minesPositions('seed', 'client', 2, 5);
    expect(a).not.toEqual(b);
  });

  it('returns positions sorted ascending', () => {
    const pos = minesPositions('seed', 'client', 42, 10);
    const sorted = [...pos].sort((a, b) => a - b);
    expect(pos).toEqual(sorted);
  });
});

describe('minesMultiplier', () => {
  it('returns 1 when no gems revealed', () => {
    expect(minesMultiplier(5, 0)).toBe(1);
  });

  it('scales up with more gems revealed', () => {
    const m1 = minesMultiplier(5, 1);
    const m3 = minesMultiplier(5, 3);
    const m5 = minesMultiplier(5, 5);
    expect(m3).toBeGreaterThan(m1);
    expect(m5).toBeGreaterThan(m3);
  });

  it('scales up with more mines at same gem count', () => {
    const m3 = minesMultiplier(3, 3);
    const m10 = minesMultiplier(10, 3);
    expect(m10).toBeGreaterThan(m3);
  });

  it('matches expected value for 5 mines, 3 gems at the target RTP', () => {
    // C(25,3) / C(20,3) = 2300 / 1140 ≈ 2.0175
    // With 10% house edge: 2.0175 * 0.90 ≈ 1.8158
    expect(minesMultiplier(5, 3)).toBeCloseTo(1.8157, 2);
  });

  it('keeps a safe reveal cashout above the original stake', () => {
    expect(minesMultiplier(1, 1)).toBe(MINES_MIN_SAFE_MULTIPLIER);
  });

  it('keeps standard mine-count cashouts near the target RTP', () => {
    const mineCount = 5;
    const gems = 3;
    const successProbability =
      ((MINES_GRID_SIZE - mineCount) / MINES_GRID_SIZE) *
      ((MINES_GRID_SIZE - mineCount - 1) / (MINES_GRID_SIZE - 1)) *
      ((MINES_GRID_SIZE - mineCount - 2) / (MINES_GRID_SIZE - 2));
    const rtp = successProbability * minesMultiplier(mineCount, gems);
    expect(rtp).toBeLessThanOrEqual(1 - MINES_HOUSE_EDGE);
    expect(rtp).toBeGreaterThan(1 - MINES_HOUSE_EDGE - 0.0002);
  });

  it('dampens high mine-count payouts so 20 mines starts near 2.1x', () => {
    expect(minesMultiplier(20, 1)).toBeCloseTo(2.1, 1);
    expect(minesMultiplier(20, 2)).toBeLessThan(6);
    expect(minesMultiplier(20, 3)).toBeLessThan(9);
  });

  it('rejects impossible (gems > safe cells)', () => {
    expect(() => minesMultiplier(24, 2)).toThrow();
  });
});

describe('minesNextMultiplier', () => {
  it('returns multiplier for next safe cell', () => {
    const current = minesMultiplier(5, 2);
    const next = minesNextMultiplier(5, 2);
    expect(next).not.toBeNull();
    expect(next as number).toBeGreaterThan(current);
  });

  it('returns null when no more safe cells remain', () => {
    const safeCells = MINES_GRID_SIZE - 5;
    expect(minesNextMultiplier(5, safeCells)).toBeNull();
  });
});
