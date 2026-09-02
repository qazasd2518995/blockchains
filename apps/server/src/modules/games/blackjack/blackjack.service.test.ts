import { describe, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { blackjackScore, type BlackjackCard } from '@bg/provably-fair';
import {
  BlackjackService,
  applyBlackjackControl,
  settleBlackjackHands,
  type StoredBlackjackHand,
} from './blackjack.service.js';

const c = (rank: number, suit = 0): BlackjackCard => ({ rank, suit });
const hand = (
  cards: BlackjackCard[],
  overrides: Partial<StoredBlackjackHand> = {},
): StoredBlackjackHand => ({
  id: 'h1',
  cards,
  bet: '10.00',
  status: 'RESOLVED',
  doubled: false,
  splitAces: false,
  ...overrides,
});

describe('BlackjackService table isolation', () => {
  it('loads only the active round belonging to the requested table', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'classic-round',
      tableId: 'classic',
      status: 'ACTIVE',
      betAmount: new Prisma.Decimal('10.00'),
      totalBetAmount: new Prisma.Decimal('10.00'),
      dealerHand: [c(8, 0), c(10, 1)],
      playerHands: [
        {
          id: 'hand-1',
          cards: [c(10, 2), c(7, 3)],
          bet: '10.00',
          status: 'PLAYING',
          doubled: false,
          splitAces: false,
        },
      ],
      activeHandIndex: 0,
      deck: [],
      deckIndex: 4,
      currentMultiplier: new Prisma.Decimal('1'),
      nonce: 7,
      serverSeedId: 'seed-1',
      clientSeedUsed: 'client-seed',
    });
    const prisma = {
      blackjackRound: { findFirst },
      serverSeed: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ seedHash: 'server-seed-hash' }),
      },
    } as unknown as PrismaClient;

    const state = await new BlackjackService(prisma).getActive('player-1', 'classic');

    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: 'player-1', tableId: 'classic', status: 'ACTIVE' },
    });
    expect(state?.roundId).toBe('classic-round');
    expect(state?.tableId).toBe('classic');
  });

  it('checks for an existing round within the selected table before dealing', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'royal-round' });
    const tx = { blackjackRound: { findFirst } };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) =>
        operation(tx),
      ),
    } as unknown as PrismaClient;

    await expect(
      new BlackjackService(prisma).start('player-1', { amount: 10, tableId: 'royal' }),
    ).rejects.toMatchObject({ code: 'INVALID_ACTION' });
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: 'player-1', tableId: 'royal', status: 'ACTIVE' },
    });
  });
});

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

describe('applyBlackjackControl', () => {
  it('preserves player cards when forcing a win', () => {
    const originalCards = [c(10, 0), c(5, 1)];
    const [rawHand] = settleBlackjackHands(
      [hand(originalCards, { status: 'STANDING' })],
      [c(10, 2), c(8, 3)],
    );

    const settled = applyBlackjackControl(
      [rawHand!],
      [c(10, 2), c(8, 3)],
      new Prisma.Decimal('10.00'),
      {
        won: true,
        multiplier: new Prisma.Decimal('2'),
        payout: new Prisma.Decimal('20.00'),
        controlled: true,
        flipReason: 'manual_test',
        controlId: 'control-1',
      },
    );

    expect(settled.controlled).toBe(true);
    expect(settled.hands[0]?.cards).toEqual(originalCards);
    expect(settled.hands[0]?.outcome).toBe('WIN');
    expect(settled.dealerHand[0]).toEqual(c(10, 2));
    expect(blackjackScore(settled.dealerHand).isBust).toBe(true);
  });

  it('preserves the visible dealer upcard when forcing a loss', () => {
    const originalCards = [c(10, 0), c(5, 1)];
    const [rawHand] = settleBlackjackHands(
      [hand(originalCards, { status: 'STANDING' })],
      [c(8, 2), c(10, 3)],
    );

    const settled = applyBlackjackControl(
      [rawHand!],
      [c(8, 2), c(10, 3)],
      new Prisma.Decimal('10.00'),
      {
        won: false,
        multiplier: new Prisma.Decimal('0'),
        payout: new Prisma.Decimal('0.00'),
        controlled: true,
        flipReason: 'manual_test',
        controlId: 'control-1',
      },
    );

    expect(settled.controlled).toBe(true);
    expect(settled.hands[0]?.cards).toEqual(originalCards);
    expect(settled.hands[0]?.outcome).toBe('LOSE');
    expect(settled.dealerHand[0]).toEqual(c(8, 2));
    const playerScore = blackjackScore(originalCards);
    const dealerScore = blackjackScore(settled.dealerHand);
    expect(dealerScore.isBust).toBe(false);
    expect(dealerScore.total).toBeGreaterThan(playerScore.total);
  });

  it('does not force an impossible loss for a natural blackjack', () => {
    const originalCards = [c(1, 0), c(13, 1)];
    const settled = applyBlackjackControl(
      [
        hand(originalCards, {
          outcome: 'BLACKJACK',
          payout: '25.00',
          multiplier: '2.5000',
        }),
      ],
      [c(10, 2), c(8, 3)],
      new Prisma.Decimal('10.00'),
      {
        won: false,
        multiplier: new Prisma.Decimal('0'),
        payout: new Prisma.Decimal('0.00'),
        controlled: true,
        flipReason: 'manual_test',
        controlId: 'control-1',
      },
    );

    expect(settled.controlled).toBe(false);
    expect(settled.hands[0]?.cards).toEqual(originalCards);
    expect(settled.hands[0]?.outcome).toBe('BLACKJACK');
    expect(settled.hands[0]?.payout).toBe('25.00');
    expect(settled.hands[0]?.multiplier).toBe('2.5000');
  });

  it('keeps a controlled natural blackjack at 3:2 payout', () => {
    const originalCards = [c(1, 0), c(13, 1)];
    const originalDealerCards = [c(6, 2), c(8, 3)];
    const settled = applyBlackjackControl(
      [
        hand(originalCards, {
          outcome: 'BLACKJACK',
          payout: '25.00',
          multiplier: '2.5000',
        }),
      ],
      originalDealerCards,
      new Prisma.Decimal('10.00'),
      {
        won: true,
        multiplier: new Prisma.Decimal('2.5'),
        payout: new Prisma.Decimal('25.00'),
        controlled: true,
        flipReason: 'manual_test',
        controlId: 'control-1',
      },
    );

    expect(settled.controlled).toBe(true);
    expect(settled.hands[0]?.cards).toEqual(originalCards);
    expect(settled.hands[0]?.outcome).toBe('BLACKJACK');
    expect(settled.hands[0]?.payout).toBe('25.00');
    expect(settled.hands[0]?.multiplier).toBe('2.5000');
    expect(settled.dealerHand).toEqual(originalDealerCards);
    expect(settled.dealerHand).toHaveLength(2);
  });
});
