import { describe, expect, it } from 'vitest';
import {
  CHICKEN_ROAD_TOTAL_STEPS,
  chickenRoadMultiplier,
  chickenRoadNextMultiplier,
  chickenRoadPath,
} from './chicken-road.js';

describe('chickenRoadPath', () => {
  it('returns one safety result per lane', () => {
    const path = chickenRoadPath('server', 'client', 1, 'medium');
    expect(path.length).toBe(CHICKEN_ROAD_TOTAL_STEPS);
    expect(path.every((cell) => typeof cell === 'boolean')).toBe(true);
  });

  it('is deterministic for the same seed bundle', () => {
    expect(chickenRoadPath('server', 'client', 8, 'hard')).toEqual(
      chickenRoadPath('server', 'client', 8, 'hard'),
    );
  });

  it('changes risk profile by difficulty', () => {
    const easy = chickenRoadPath('server', 'client', 3, 'easy');
    const hardcore = chickenRoadPath('server', 'client', 3, 'hardcore');
    expect(easy.filter(Boolean).length).toBeGreaterThanOrEqual(hardcore.filter(Boolean).length);
  });
});

describe('chickenRoadMultiplier', () => {
  it('returns 1 before crossing any lane', () => {
    expect(chickenRoadMultiplier('medium', 0)).toBe(1);
  });

  it('grows as the chicken crosses more lanes', () => {
    expect(chickenRoadMultiplier('medium', 5)).toBeGreaterThan(chickenRoadMultiplier('medium', 1));
  });

  it('pays higher per lane on riskier difficulties', () => {
    expect(chickenRoadMultiplier('hardcore', 3)).toBeGreaterThan(chickenRoadMultiplier('easy', 3));
  });

  it('rejects steps past the finish line', () => {
    expect(() => chickenRoadMultiplier('easy', CHICKEN_ROAD_TOTAL_STEPS + 1)).toThrow();
  });
});

describe('chickenRoadNextMultiplier', () => {
  it('returns null at the finish line', () => {
    expect(chickenRoadNextMultiplier('easy', CHICKEN_ROAD_TOTAL_STEPS)).toBeNull();
  });
});
