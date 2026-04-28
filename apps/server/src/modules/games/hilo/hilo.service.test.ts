import { describe, expect, it } from 'vitest';
import { adjustHiLoDraw } from './hilo.service.js';

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
    expect(result.card.suit).toBe(1);
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
