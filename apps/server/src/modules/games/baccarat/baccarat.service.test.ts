import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { GameId, type BaccaratTableBetSide } from '@bg/shared';
import { __baccaratServiceTestHooks } from './baccarat.service.js';

const {
  baccaratBetResult,
  baccaratCardValue,
  baccaratMultiplier,
  baccaratPoints,
  buildBaccaratRound,
  evaluateBaccaratDeal,
  shapeBaccaratRoundForControl,
  shouldBankerDraw,
  toBaccaratCard,
} = __baccaratServiceTestHooks;

function card(rank: number, suit = 0) {
  return toBaccaratCard(rank, suit);
}

describe('baccarat table rules', () => {
  it('scores cards by baccarat point rules', () => {
    expect(baccaratCardValue(1)).toBe(1);
    expect(baccaratCardValue(9)).toBe(9);
    expect(baccaratCardValue(10)).toBe(0);
    expect(baccaratCardValue(13)).toBe(0);
    expect(baccaratPoints([card(9), card(8), card(13)])).toBe(7);
  });

  it('stops both sides on a natural 8 or 9', () => {
    const deal = evaluateBaccaratDeal([
      card(1),
      card(2),
      card(7),
      card(3),
      card(5),
      card(6),
    ]);

    expect(deal.natural).toBe(true);
    expect(deal.player.points).toBe(8);
    expect(deal.banker.points).toBe(5);
    expect(deal.player.cards).toHaveLength(2);
    expect(deal.banker.cards).toHaveLength(2);
  });

  it('draws a player third card on 0-5 and applies the banker third-card table', () => {
    const deal = evaluateBaccaratDeal([
      card(1),
      card(2),
      card(3),
      card(3),
      card(7),
      card(4),
    ]);

    expect(deal.natural).toBe(false);
    expect(deal.player.cards).toHaveLength(3);
    expect(deal.player.points).toBe(1);
    expect(deal.banker.cards).toHaveLength(3);
    expect(deal.banker.points).toBe(9);
  });

  it('uses the standard banker draw matrix after player draws', () => {
    expect(shouldBankerDraw(3, 8)).toBe(false);
    expect(shouldBankerDraw(3, 7)).toBe(true);
    expect(shouldBankerDraw(4, 1)).toBe(false);
    expect(shouldBankerDraw(4, 7)).toBe(true);
    expect(shouldBankerDraw(5, 3)).toBe(false);
    expect(shouldBankerDraw(5, 4)).toBe(true);
    expect(shouldBankerDraw(6, 5)).toBe(false);
    expect(shouldBankerDraw(6, 7)).toBe(true);
    expect(shouldBankerDraw(7, 6)).toBe(false);
  });

  it('pays player, banker, tie and push results with total payout multipliers', () => {
    expect(baccaratBetResult('player', 'PLAYER')).toBe('WIN');
    expect(baccaratBetResult('banker', 'BANKER')).toBe('WIN');
    expect(baccaratBetResult('tie', 'TIE')).toBe('WIN');
    expect(baccaratBetResult('player', 'TIE')).toBe('PUSH');
    expect(baccaratMultiplier('player', 'WIN').toFixed(2)).toBe('2.00');
    expect(baccaratMultiplier('banker', 'WIN').toFixed(2)).toBe('1.95');
    expect(baccaratMultiplier('tie', 'WIN').toFixed(2)).toBe('9.00');
    expect(baccaratMultiplier('player', 'PUSH').toFixed(2)).toBe('1.00');
  });

  it('can shape every bet side to controlled wins and controlled losses without push leakage', () => {
    const amount = new Prisma.Decimal(100);
    const seed = { serverSeed: 'server', clientSeed: 'client', nonce: 42 };
    const sides: BaccaratTableBetSide[] = ['player', 'banker', 'tie'];

    for (const side of sides) {
      const natural = buildBaccaratRound(GameId.BACCARAT_DRAGON, amount, side, seed);
      const win = shapeBaccaratRoundForControl(
        GameId.BACCARAT_DRAGON,
        amount,
        side,
        seed,
        natural,
        {
          won: true,
          multiplier: new Prisma.Decimal(2),
          payout: new Prisma.Decimal(200),
          controlled: true,
        },
      );
      expect(win.control.controlled).toBe(true);
      expect(win.round.result).toBe('WIN');
      expect(win.round.profit.greaterThan(0)).toBe(true);

      const loss = shapeBaccaratRoundForControl(
        GameId.BACCARAT_DRAGON,
        amount,
        side,
        seed,
        natural,
        {
          won: false,
          multiplier: new Prisma.Decimal(0),
          payout: new Prisma.Decimal(0),
          controlled: true,
        },
      );
      expect(loss.control.controlled).toBe(true);
      expect(loss.round.result).toBe('LOSE');
      expect(loss.round.payout.equals(0)).toBe(true);
    }
  });
});
