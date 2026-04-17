import { describe, it, expect } from 'vitest';
import { crashPoint } from './crash.js';

describe('crashPoint', () => {
  it('is at least 1.00', () => {
    for (let i = 0; i < 200; i += 1) {
      const p = crashPoint('server-seed', `round-${i}`);
      expect(p).toBeGreaterThanOrEqual(1.0);
    }
  });

  it('is deterministic', () => {
    const a = crashPoint('seed', 'salt');
    const b = crashPoint('seed', 'salt');
    expect(a).toBe(b);
  });

  it('produces varied values across salts', () => {
    const points = new Set<number>();
    for (let i = 0; i < 100; i += 1) {
      points.add(crashPoint('seed', `${i}`));
    }
    expect(points.size).toBeGreaterThan(30);
  });

  it('has instant busts (~3% of outcomes)', () => {
    let instant = 0;
    const total = 5000;
    for (let i = 0; i < total; i += 1) {
      if (crashPoint('seed', `${i}`) === 1.0) instant += 1;
    }
    const ratio = instant / total;
    expect(ratio).toBeGreaterThan(0.015);
    expect(ratio).toBeLessThan(0.06);
  });
});
