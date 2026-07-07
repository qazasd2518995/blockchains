import { describe, expect, it } from 'vitest';
import { GameId } from '@bg/shared';
import {
  assertBettingLimitsWithinParent,
  normalizeStoredBettingLimits,
  resolveRequestedBettingLimits,
} from './bettingLimits.js';

describe('admin betting limits', () => {
  it('excludes beta local table games from normalized stored limits', () => {
    const normalized = normalizeStoredBettingLimits(
      {
        [GameId.TWENTY_ONE_HALF_DOLL]: 'range_5000_50000',
        [GameId.DICE]: 'range_1_500',
      },
      'range_10_3000',
    );

    expect(normalized[GameId.TWENTY_ONE_HALF_DOLL]).toBeUndefined();
    expect(normalized[GameId.DICE]).toBe('range_1_500');
  });

  it('ignores beta local table game violations but still blocks public game violations', () => {
    expect(() =>
      assertBettingLimitsWithinParent(
        {
          [GameId.TWENTY_ONE_HALF_DOLL]: 'range_5000_50000',
          [GameId.DICE]: 'range_1_500',
        },
        'range_1_500',
        {
          [GameId.TWENTY_ONE_HALF_DOLL]: 'range_1_500',
          [GameId.DICE]: 'range_1_500',
        },
        'range_1_500',
      ),
    ).not.toThrow();

    expect(() =>
      assertBettingLimitsWithinParent(
        {
          [GameId.TWENTY_ONE_HALF_DOLL]: 'range_1_500',
          [GameId.DICE]: 'range_5000_50000',
        },
        'range_1_500',
        {
          [GameId.TWENTY_ONE_HALF_DOLL]: 'range_1_500',
          [GameId.DICE]: 'range_1_500',
        },
        'range_1_500',
      ),
    ).toThrow('骰子');
  });

  it('drops beta local table games from requested custom limits', () => {
    const requested = resolveRequestedBettingLimits(
      {
        [GameId.TWENTY_ONE_HALF_DOLL]: 'range_5000_50000',
        [GameId.DICE]: 'range_100_2000',
      },
      'range_10_3000',
      {
        [GameId.TWENTY_ONE_HALF_DOLL]: 'range_1_500',
        [GameId.DICE]: 'range_1_500',
      },
      'range_1_500',
    );

    expect(requested[GameId.TWENTY_ONE_HALF_DOLL]).toBeUndefined();
    expect(requested[GameId.DICE]).toBe('range_100_2000');
  });
});
