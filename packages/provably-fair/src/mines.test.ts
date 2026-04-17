import { describe, it, expect } from 'vitest';
import {
  minesPositions,
  minesMultiplier,
  minesNextMultiplier,
  MINES_GRID_SIZE,
  MINES_MIN_COUNT,
  MINES_MAX_COUNT,
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

  it('matches expected value for 5 mines, 3 gems (≈ 1.83x)', () => {
    // C(25,3) / C(20,3) = 2300 / 1140 ≈ 2.0175
    // With 3% house edge: 2.0175 * 0.97 ≈ 1.9569
    expect(minesMultiplier(5, 3)).toBeCloseTo(1.9569, 2);
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
