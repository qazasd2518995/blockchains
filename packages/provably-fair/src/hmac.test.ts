import { describe, it, expect } from 'vitest';
import {
  sha256,
  hmacSha256,
  buildMessage,
  hmacIntStream,
  hmacFloatStream,
} from './hmac.js';

describe('sha256', () => {
  it('produces the standard empty-string digest', () => {
    expect(sha256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('is stable for fixed input', () => {
    expect(sha256('hello world')).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
  });
});

describe('hmacSha256', () => {
  it('matches RFC 4231 vector 1', () => {
    const key = '0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b';
    const keyBuffer = Buffer.from(key, 'hex').toString('binary');
    const digest = hmacSha256(keyBuffer, 'Hi There');
    expect(digest).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    );
  });

  it('is deterministic', () => {
    const a = hmacSha256('server-seed', 'client-seed:1');
    const b = hmacSha256('server-seed', 'client-seed:1');
    expect(a).toBe(b);
  });
});

describe('buildMessage', () => {
  it('formats without cursor', () => {
    expect(buildMessage('abc', 5)).toBe('abc:5');
  });

  it('formats with cursor when greater than zero', () => {
    expect(buildMessage('abc', 5, 2)).toBe('abc:5:2');
  });
});

describe('hmacIntStream', () => {
  it('yields deterministic 32-bit integers', () => {
    const gen = hmacIntStream('server', 'client', 1);
    const values = [gen.next().value, gen.next().value, gen.next().value];
    expect(values.every((v) => typeof v === 'number')).toBe(true);
    expect(values.every((v) => (v as number) >= 0 && (v as number) < 2 ** 32)).toBe(true);
  });

  it('extends past 64 hex chars with cursor', () => {
    const gen = hmacIntStream('server', 'client', 1);
    const collected: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      collected.push(gen.next().value as number);
    }
    expect(collected.length).toBe(20);
    expect(new Set(collected).size).toBeGreaterThan(1);
  });
});

describe('hmacFloatStream', () => {
  it('yields floats in [0, 1)', () => {
    const gen = hmacFloatStream('server', 'client', 1);
    for (let i = 0; i < 100; i += 1) {
      const v = gen.next().value as number;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
