import { describe, it, expect } from 'vitest';
import {
  towerLayout,
  towerMultiplier,
  towerNextMultiplier,
  TOWER_CONFIG,
  TOWER_LEVELS,
} from './tower.js';

describe('towerLayout', () => {
  it('produces TOWER_LEVELS rows', () => {
    const layout = towerLayout('s', 'c', 1, 'medium');
    expect(layout.length).toBe(TOWER_LEVELS);
  });

  it('each level has exactly cfg.safe positions', () => {
    const layout = towerLayout('s', 'c', 1, 'hard');
    for (const row of layout) {
      expect(row.length).toBe(TOWER_CONFIG.hard.safe);
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

  it('master is riskier than easy', () => {
    expect(towerMultiplier('master', 3)).toBeGreaterThan(towerMultiplier('easy', 3));
  });
});

describe('towerNextMultiplier', () => {
  it('returns null at max level', () => {
    expect(towerNextMultiplier('easy', TOWER_LEVELS)).toBeNull();
  });
});
