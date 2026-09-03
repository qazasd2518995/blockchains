import { describe, expect, it } from 'vitest';

import { getSlowRequestThresholdMs, sanitizeForLog } from './requestLogging.js';

describe('request performance logging', () => {
  it('uses the lower game threshold for every game endpoint', () => {
    expect(getSlowRequestThresholdMs('/api/games/seth2/source', 1000, 300)).toBe(300);
    expect(getSlowRequestThresholdMs('/api/games/h5-slots/spin?gameCode=278', 1000, 300)).toBe(
      300,
    );
  });

  it('keeps the platform threshold for non-game APIs', () => {
    expect(getSlowRequestThresholdMs('/api/wallet/balance', 1000, 300)).toBe(1000);
  });

  it('never weakens a stricter platform-wide threshold', () => {
    expect(getSlowRequestThresholdMs('/api/games/thor2/spin', 200, 300)).toBe(200);
  });

  it('continues to redact credentials from slow-request payloads', () => {
    expect(sanitizeForLog({ amount: 10, accessToken: 'secret-token' })).toEqual({
      amount: 10,
      accessToken: '[Redacted]',
    });
  });
});
