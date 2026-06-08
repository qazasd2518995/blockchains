import { describe, expect, it } from 'vitest';
import type { HiLoCard } from '@bg/shared';
import { __hiLoServiceTestHooks, adjustHiLoDraw } from './hilo.service.js';

describe('HiLo control helpers', () => {
  it('allows forced loss from the first guess when the requested loss is possible', () => {
    expect(__hiLoServiceTestHooks.canForceHiLoLossAtCardIndex(0)).toBe(true);
    expect(__hiLoServiceTestHooks.canForceHiLoLossAtCardIndex(1)).toBe(true);
  });
});

describe('selectMiddleHiLoSkipDraw', () => {
  const drawAt = (cards: Record<number, HiLoCard>) => (index: number) =>
    cards[index] ?? { rank: 13, suit: 0 };

  it('uses the first strict middle card for skip replacement', () => {
    const selected = __hiLoServiceTestHooks.selectMiddleHiLoSkipDraw(
      drawAt({
        1: { rank: 13, suit: 0 },
        2: { rank: 2, suit: 1 },
        3: { rank: 8, suit: 2 },
        4: { rank: 7, suit: 3 },
      }),
      1,
    );

    expect(selected).toEqual({ card: { rank: 8, suit: 2 }, cardIndex: 3 });
  });

  it('falls back to acceptable middle cards when no strict middle appears soon', () => {
    const selected = __hiLoServiceTestHooks.selectMiddleHiLoSkipDraw(
      drawAt({
        1: { rank: 13, suit: 0 },
        2: { rank: 1, suit: 1 },
        3: { rank: 2, suit: 2 },
        4: { rank: 3, suit: 3 },
        5: { rank: 10, suit: 0 },
        6: { rank: 11, suit: 1 },
        7: { rank: 12, suit: 2 },
        8: { rank: 13, suit: 3 },
        9: { rank: 5, suit: 1 },
      }),
      1,
    );

    expect(selected).toEqual({ card: { rank: 5, suit: 1 }, cardIndex: 9 });
  });

  it('keeps the raw next card when no middle replacement is available', () => {
    const selected = __hiLoServiceTestHooks.selectMiddleHiLoSkipDraw(
      drawAt({
        1: { rank: 13, suit: 0 },
        2: { rank: 1, suit: 1 },
        3: { rank: 2, suit: 2 },
        4: { rank: 3, suit: 3 },
      }),
      1,
    );

    expect(selected).toEqual({ card: { rank: 13, suit: 0 }, cardIndex: 1 });
  });
});

describe('adjustHiLoDraw', () => {
  it('keeps the raw drawn card when it already matches the expected result', () => {
    const result = adjustHiLoDraw(
      { rank: 1, suit: 0 },
      'higher',
      true,
      { rank: 9, suit: 2 },
    );

    expect(result).toEqual({
      card: { rank: 9, suit: 2 },
      correct: true,
    });
  });

  it('keeps naturally correct lower guesses instead of snapping to the first valid rank', () => {
    const result = adjustHiLoDraw(
      { rank: 10, suit: 1 },
      'lower',
      true,
      { rank: 4, suit: 3 },
    );

    expect(result).toEqual({
      card: { rank: 4, suit: 3 },
      correct: true,
    });
  });

  it('only changes the card when a controlled outcome must flip the result', () => {
    const result = adjustHiLoDraw(
      { rank: 8, suit: 0 },
      'higher',
      false,
      { rank: 13, suit: 1 },
    );

    expect(result.card.rank).toBeLessThan(8);
    expect(result.card.suit).toBeGreaterThanOrEqual(0);
    expect(result.card.suit).toBeLessThan(4);
    expect(result.correct).toBe(false);
  });

  it('falls back to the raw draw when the requested outcome is impossible', () => {
    const result = adjustHiLoDraw(
      { rank: 1, suit: 0 },
      'higher',
      false,
      { rank: 7, suit: 2 },
    );

    expect(result).toEqual({
      card: { rank: 7, suit: 2 },
      correct: true,
    });
  });
});
