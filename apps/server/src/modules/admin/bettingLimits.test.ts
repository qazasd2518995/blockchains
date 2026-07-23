import { describe, expect, it } from 'vitest';
import { GameId } from '@bg/shared';
import {
  assertAgentBettingLimitOptionsWithinParent,
  assertBettingLimitsWithinParent,
  normalizeStoredAgentBettingLimitOptions,
  normalizeStoredBettingLimits,
  resolveRequestedAgentBettingLimitOptions,
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

  it('accepts the 100-10000 range at the same hierarchy rank as 1000-10000', () => {
    const normalized = normalizeStoredBettingLimits(
      {
        [GameId.DICE]: 'range_100_10000',
      },
      'range_10_3000',
    );

    expect(normalized[GameId.DICE]).toBe('range_100_10000');
    expect(() =>
      assertBettingLimitsWithinParent(
        { [GameId.DICE]: 'range_100_10000' },
        'range_10_3000',
        { [GameId.DICE]: 'range_1000_10000' },
        'range_1000_10000',
      ),
    ).not.toThrow();
  });

  it('expands legacy agent maximums into all previously allowed lower ranges', () => {
    const normalized = normalizeStoredAgentBettingLimitOptions(
      { [GameId.DICE]: 'range_100_10000' },
      'range_10_3000',
    );

    expect(normalized[GameId.DICE]).toContain('range_1_500');
    expect(normalized[GameId.DICE]).toContain('range_100_10000');
    expect(normalized[GameId.DICE]).toContain('range_1000_10000');
    expect(normalized[GameId.DICE]).not.toContain('range_5000_50000');
  });

  it('keeps new agent option arrays as exact permissions', () => {
    const normalized = resolveRequestedAgentBettingLimitOptions(
      { [GameId.DICE]: ['range_100_10000', 'range_1000_10000'] },
      'range_10_3000',
      { [GameId.DICE]: 'range_5000_50000' },
      'range_5000_50000',
    );

    expect(normalized[GameId.DICE]).toEqual(['range_100_10000', 'range_1000_10000']);
  });

  it('requires child agent permissions to be a subset of the parent selections', () => {
    expect(() =>
      assertAgentBettingLimitOptionsWithinParent(
        { [GameId.DICE]: ['range_100_10000'] },
        'range_100_10000',
        { [GameId.DICE]: ['range_100_10000', 'range_1000_10000'] },
        'range_100_10000',
      ),
    ).not.toThrow();

    expect(() =>
      assertAgentBettingLimitOptionsWithinParent(
        { [GameId.DICE]: ['range_10_3000'] },
        'range_10_3000',
        { [GameId.DICE]: ['range_100_10000', 'range_1000_10000'] },
        'range_100_10000',
      ),
    ).toThrow('骰子');
  });

  it('allows a member to select exactly one of the agent authorized ranges', () => {
    const parent = { [GameId.DICE]: ['range_100_10000', 'range_1000_10000'] };

    expect(() =>
      assertBettingLimitsWithinParent(
        { [GameId.DICE]: 'range_100_10000' },
        'range_100_10000',
        parent,
        'range_100_10000',
      ),
    ).not.toThrow();

    expect(() =>
      assertBettingLimitsWithinParent(
        { [GameId.DICE]: 'range_10_3000' },
        'range_10_3000',
        parent,
        'range_100_10000',
      ),
    ).toThrow('骰子');
  });
});
