import { describe, it, expect } from 'vitest';
import { rouletteSpin, rouletteEvaluate, ROULETTE_SLOTS } from './roulette.js';

describe('rouletteSpin', () => {
  it('slot in range', () => {
    for (let n = 1; n <= 50; n += 1) {
      const { slot } = rouletteSpin('s', 'c', n);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(ROULETTE_SLOTS);
    }
  });
});

describe('rouletteEvaluate', () => {
  it('straight bet hits', () => {
    const r = rouletteEvaluate(7, [{ type: 'straight', value: 7, amount: 10 }]);
    expect(r.wins.length).toBe(1);
    expect(r.totalPayout).toBeGreaterThan(0);
  });

  it('red bet loses on black', () => {
    const r = rouletteEvaluate(2, [{ type: 'red', amount: 10 }]); // 2 is black
    expect(r.wins.length).toBe(0);
  });

  it('low bet wins on 3', () => {
    const r = rouletteEvaluate(3, [{ type: 'low', amount: 10 }]);
    expect(r.totalPayout).toBeGreaterThan(0);
  });

  it('La Partage on 0 returns half', () => {
    const r = rouletteEvaluate(0, [{ type: 'red', amount: 10 }]);
    expect(r.totalPayout).toBe(5);
  });
});
