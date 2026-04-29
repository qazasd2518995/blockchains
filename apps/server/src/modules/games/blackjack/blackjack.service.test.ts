import { describe, expect, it } from 'vitest';
import type { BlackjackCard } from '@bg/provably-fair';
import { settleBlackjackHands } from './blackjack.service.js';

const c = (rank: number, suit = 0): BlackjackCard => ({ rank, suit });

describe('settleBlackjackHands', () => {
  it('pays a regular win 1:1 including stake', () => {
    const [hand] = settleBlackjackHands(
      [
        {
          id: 'h1',
          cards: [c(10), c(9)],
          bet: '10.00',
          status: 'STANDING',
          doubled: false,
          splitAces: false,
        },
      ],
      [c(10), c(8)],
    );

    expect(hand?.outcome).toBe('WIN');
    expect(hand?.payout).toBe('20.00');
    expect(hand?.multiplier).toBe('2.0000');
  });

  it('returns stake on push', () => {
    const [hand] = settleBlackjackHands(
      [
        {
          id: 'h1',
          cards: [c(10), c(8)],
          bet: '25.00',
          status: 'STANDING',
          doubled: false,
          splitAces: false,
        },
      ],
      [c(9), c(9)],
    );

    expect(hand?.outcome).toBe('PUSH');
    expect(hand?.payout).toBe('25.00');
    expect(hand?.multiplier).toBe('1.0000');
  });

  it('loses busted hands before comparing with dealer', () => {
    const [hand] = settleBlackjackHands(
      [
        {
          id: 'h1',
          cards: [c(10), c(8), c(9)],
          bet: '15.00',
          status: 'BUSTED',
          doubled: false,
          splitAces: false,
        },
      ],
      [c(10), c(6), c(9)],
    );

    expect(hand?.outcome).toBe('LOSE');
    expect(hand?.payout).toBe('0.00');
  });
});
