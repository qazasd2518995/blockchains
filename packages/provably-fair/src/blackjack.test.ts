import { describe, expect, it } from 'vitest';
import {
  blackjackDealerShouldHit,
  blackjackDeck,
  blackjackScore,
  type BlackjackCard,
} from './blackjack.js';

const c = (rank: number, suit = 0): BlackjackCard => ({ rank, suit });

describe('blackjackDeck', () => {
  it('creates a deterministic 52-card shuffled deck', () => {
    const a = blackjackDeck('server', 'client', 7);
    const b = blackjackDeck('server', 'client', 7);
    const keys = new Set(a.map((card) => `${card.rank}-${card.suit}`));

    expect(a).toEqual(b);
    expect(a).toHaveLength(52);
    expect(keys.size).toBe(52);
  });
});

describe('blackjackScore', () => {
  it('counts aces as soft 11 when possible', () => {
    expect(blackjackScore([c(1), c(7)])).toMatchObject({
      total: 18,
      soft: true,
      isBust: false,
      isBlackjack: false,
    });
  });

  it('downgrades aces from 11 to 1 to avoid busting', () => {
    expect(blackjackScore([c(1), c(9), c(8)])).toMatchObject({
      total: 18,
      soft: false,
      isBust: false,
    });
  });

  it('detects natural blackjack only on two-card 21', () => {
    expect(blackjackScore([c(1), c(13)]).isBlackjack).toBe(true);
    expect(blackjackScore([c(1), c(5), c(5)]).isBlackjack).toBe(false);
  });
});

describe('blackjackDealerShouldHit', () => {
  it('stands on all 17 including soft 17', () => {
    expect(blackjackDealerShouldHit([c(10), c(6)])).toBe(true);
    expect(blackjackDealerShouldHit([c(10), c(7)])).toBe(false);
    expect(blackjackDealerShouldHit([c(1), c(6)])).toBe(false);
  });
});
