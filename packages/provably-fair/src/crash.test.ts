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

  it('compresses high crash tails versus the classic crash distribution', () => {
    const total = 20000;
    let ge2 = 0;
    let ge5 = 0;
    let ge10 = 0;
    let ge20 = 0;
    for (let i = 0; i < total; i += 1) {
      const point = crashPoint('seed', `tail-${i}`);
      if (point >= 2) ge2 += 1;
      if (point >= 5) ge5 += 1;
      if (point >= 10) ge10 += 1;
      if (point >= 20) ge20 += 1;
    }

    expect(ge2 / total).toBeLessThan(0.4);
    expect(ge5 / total).toBeLessThan(0.12);
    expect(ge10 / total).toBeLessThan(0.05);
    expect(ge20 / total).toBeLessThan(0.025);
  });
});
