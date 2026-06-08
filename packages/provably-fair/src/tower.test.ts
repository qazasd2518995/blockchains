import { describe, it, expect } from 'vitest';
import {
  towerLayout,
  towerLevelCount,
  towerMultiplier,
  towerNextMultiplier,
  towerSafeCountForLevel,
  TOWER_CONFIG,
  TOWER_LEVELS,
} from './tower.js';

describe('towerLayout', () => {
  it('produces TOWER_LEVELS rows', () => {
    const layout = towerLayout('s', 'c', 1, 'medium');
    expect(layout.length).toBe(TOWER_LEVELS);
  });

  it('keeps expert and master visually playable through all levels', () => {
    expect(towerLevelCount('expert')).toBe(TOWER_LEVELS);
    expect(towerLayout('s', 'c', 1, 'expert').length).toBe(TOWER_LEVELS);
    expect(towerNextMultiplier('expert', TOWER_LEVELS)).toBeNull();

    expect(towerLevelCount('master')).toBe(TOWER_LEVELS);
    expect(towerLayout('s', 'c', 1, 'master').length).toBe(TOWER_LEVELS);
    expect(towerNextMultiplier('master', TOWER_LEVELS)).toBeNull();
  });

  it('each level has the configured safe count for that level', () => {
    const layout = towerLayout('s', 'c', 1, 'hard');
    for (let level = 0; level < layout.length; level += 1) {
      const row = layout[level] as number[];
      expect(row.length).toBe(towerSafeCountForLevel('hard', level));
      expect(new Set(row).size).toBe(row.length);
      for (const p of row) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(TOWER_CONFIG.hard.cols);
      }
    }
  });

  it('is deterministic', () => {
    expect(towerLayout('s', 'c', 1, 'easy')).toEqual(towerLayout('s', 'c', 1, 'easy'));
  });

  it('uses configured per-level safe counts for controlled risk modes', () => {
    expect([0, 1, 2, 3, 4, 5].map((level) => towerSafeCountForLevel('medium', level))).toEqual([
      2, 2, 2, 2, 1, 1,
    ]);
    expect([0, 1, 2, 3, 4, 5].map((level) => towerSafeCountForLevel('hard', level))).toEqual([
      3, 3, 3, 2, 1, 1,
    ]);
    expect([0, 1, 2, 3, 4, 5].map((level) => towerSafeCountForLevel('expert', level))).toEqual([
      3, 3, 2, 2, 2, 1,
    ]);
    expect([0, 1, 2, 3].map((level) => towerSafeCountForLevel('master', level))).toEqual([
      3, 2, 2, 1,
    ]);
  });

  it('uses lower safe ratios as the difficulty increases', () => {
    const ratio = (difficulty: keyof typeof TOWER_CONFIG) =>
      TOWER_CONFIG[difficulty].safe / TOWER_CONFIG[difficulty].cols;

    expect(ratio('medium')).toBeLessThan(ratio('easy'));
    expect(ratio('hard')).toBeLessThan(ratio('medium'));
    expect(ratio('expert')).toBeLessThan(ratio('hard'));
    expect(ratio('master')).toBeLessThan(ratio('expert'));
  });
});

describe('towerMultiplier', () => {
  it('returns 1 at level 0', () => {
    expect(towerMultiplier('easy', 0)).toBe(1);
  });

  it('grows with level', () => {
    const m1 = towerMultiplier('medium', 1);
    const m5 = towerMultiplier('medium', 5);
    expect(m5).toBeGreaterThan(m1);
  });

  it('delays profitable cashouts on medium and hard', () => {
    expect(towerMultiplier('medium', 3)).toBeLessThan(1);
    expect(towerMultiplier('medium', 4)).toBeGreaterThan(1);
    expect(towerMultiplier('hard', 2)).toBeLessThan(1);
    expect(towerMultiplier('hard', 3)).toBeGreaterThan(1);
  });

  it('uses the configured conservative payout table for medium and hard', () => {
    expect([1, 2, 3, 4, 5, 6].map((level) => towerMultiplier('medium', level))).toEqual([
      0.2, 0.4, 0.8, 1.4, 2.5, 5.1,
    ]);
    expect([1, 2, 3, 4, 5, 6].map((level) => towerMultiplier('hard', level))).toEqual([
      0.3, 0.5, 1.1, 1.7, 3.5, 5.8,
    ]);
  });

  it('keeps expert and master available with capped payout tables', () => {
    expect([1, 2, 3, 4, 5].map((level) => towerMultiplier('expert', level))).toEqual([
      0.5, 0.9, 1.8, 3.1, 5.8,
    ]);
    expect([1, 2, 3, 4].map((level) => towerMultiplier('master', level))).toEqual([
      0.6, 1.6, 2.7, 4.6,
    ]);
  });
});

describe('towerNextMultiplier', () => {
  it('returns null at max level', () => {
    expect(towerNextMultiplier('easy', TOWER_LEVELS)).toBeNull();
  });
});
