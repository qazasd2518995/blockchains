import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { GameId } from '@bg/shared';
import { hotlineEvaluate } from '@bg/provably-fair';
import { __hotlineServiceTestHooks } from './hotline.service.js';

describe('hotline controlled round shaping', () => {
  it('varies fixed-line soft-hit placement across nonces', () => {
    const signatures = new Set(
      Array.from({ length: 12 }, (_, nonce) => {
        const round = __hotlineServiceTestHooks.softLossHotlineRound(GameId.CANDY_SLOT, nonce);
        const line = round.lines[0];
        expect(line).toBeDefined();
        return `${line!.lineId}:${line!.startReel}:${line!.direction}:${line!.row}`;
      }),
    );

    expect(signatures.size).toBeGreaterThan(2);
  });

  it('returns cascade steps for mega soft-hit rounds', () => {
    const rounds = Array.from({ length: 6 }, (_, nonce) =>
      __hotlineServiceTestHooks.softLossHotlineRound(GameId.DRAGON_MEGA_SLOT, nonce),
    );

    for (const round of rounds) {
      const cascades = round.cascades ?? [];
      expect(cascades.length).toBeGreaterThan(0);
      expect(cascades[0]!.removed.length).toBeGreaterThanOrEqual(8);
      expect(cascades[0]!.grid).not.toEqual(round.grid);
      expect(hotlineEvaluate(round.grid).lines).toEqual([]);
    }

    const removalSignatures = new Set(
      rounds.map((round) => {
        const cascades = round.cascades ?? [];
        return cascades[0]!.removed.map((position) => `${position.reel}:${position.row}`).join('|');
      }),
    );
    expect(removalSignatures.size).toBeGreaterThan(1);
  });

  it('does not fall back to uncapped jackpot symbols when burst bounds are unreachable', () => {
    const amount = new Prisma.Decimal(10);
    const maxPayout = new Prisma.Decimal(3010);
    const round = __hotlineServiceTestHooks.winningHotlineRound(
      GameId.SAKURA_SLOT,
      amount,
      {
        minMultiplier: new Prisma.Decimal(21),
        maxMultiplier: new Prisma.Decimal(301),
        maxPayout,
      },
      42,
    );

    expect(amount.mul(round.totalMultiplier).lessThanOrEqualTo(maxPayout)).toBe(true);
  });

  it('uses the highest legal 5x3 slot payout for burst wins instead of repeated small wins', () => {
    const amount = new Prisma.Decimal(100);
    const maxPayout = new Prisma.Decimal(50000);
    const round = __hotlineServiceTestHooks.winningHotlineRound(
      GameId.FRUIT_SLOT,
      amount,
      {
        flipReason: 'burst_win',
        minMultiplier: new Prisma.Decimal(250),
        maxMultiplier: new Prisma.Decimal(500),
        maxPayout,
      },
      88,
    );

    expect(round.totalMultiplier).toBeGreaterThanOrEqual(250);
    expect(round.totalMultiplier).toBeLessThanOrEqual(500);
    expect(amount.mul(round.totalMultiplier).lessThanOrEqualTo(maxPayout)).toBe(true);
    expect(hotlineEvaluate(round.grid).totalMultiplier).toBeCloseTo(round.totalMultiplier, 4);
  });

  it('keeps 3x3 burst wins inside the mini-slot paytable', () => {
    const amount = new Prisma.Decimal(100);
    const maxPayout = new Prisma.Decimal(3000);
    const round = __hotlineServiceTestHooks.winningHotlineRound(
      GameId.SAKURA_SLOT,
      amount,
      {
        flipReason: 'burst_win',
        minMultiplier: new Prisma.Decimal(20),
        maxMultiplier: new Prisma.Decimal(30),
        maxPayout,
      },
      99,
    );

    expect(round.totalMultiplier).toBeGreaterThanOrEqual(20);
    expect(round.totalMultiplier).toBeLessThanOrEqual(30);
    expect(amount.mul(round.totalMultiplier).lessThanOrEqualTo(maxPayout)).toBe(true);
    expect(hotlineEvaluate(round.grid).totalMultiplier).toBeCloseTo(round.totalMultiplier, 4);
  });

  it('shapes normal mega-slot burst wins toward the configured cap while respecting max payout', () => {
    const amount = new Prisma.Decimal(100);
    const maxPayout = new Prisma.Decimal(50000);
    const round = __hotlineServiceTestHooks.winningHotlineRound(
      GameId.DRAGON_MEGA_SLOT,
      amount,
      {
        flipReason: 'burst_win',
        minMultiplier: new Prisma.Decimal(250),
        maxMultiplier: new Prisma.Decimal(500),
        maxPayout,
      },
      111,
    );

    expect(round.totalMultiplier).toBeGreaterThanOrEqual(250);
    expect(round.totalMultiplier).toBeLessThanOrEqual(500);
    expect(amount.mul(round.totalMultiplier).lessThanOrEqualTo(maxPayout)).toBe(true);
    expect(round.features?.totalMultiplier).toBe(round.totalMultiplier);
  });

  it('shapes mega buy-feature accounting into two low results and one capped high result', () => {
    const picks = [0, 1, 2].map((nonce) =>
      __hotlineServiceTestHooks.chooseMegaFreeGameAccountingMultiplier(nonce),
    );

    expect(picks[0]).toBeGreaterThanOrEqual(0.35);
    expect(picks[0]).toBeLessThan(1);
    expect(picks[1]).toBeGreaterThanOrEqual(0.35);
    expect(picks[1]).toBeLessThan(1);
    expect(picks[2]).toBeGreaterThanOrEqual(1.1);
    expect(picks[2]).toBeLessThanOrEqual(2.5);
  });

  it('keeps mega buy-feature payout and displayed free-game total capped at 2.5x stake', () => {
    const baseAmount = new Prisma.Decimal(10);
    const stakeAmount = baseAmount.mul(100);
    const features = {
      scatterSymbols: [],
      scatterCount: 4,
      freeSpinsAwarded: 15,
      freeSpinsPlayed: 1,
      baseWinMultiplier: 0,
      baseMultiplierSymbols: [],
      baseMultiplierTotal: 0,
      baseAppliedMultiplier: 1,
      baseTotalMultiplier: 0,
      freeSpinRounds: [],
      freeSpinMultiplierBank: 0,
      freeSpinWinMultiplier: 400,
      totalMultiplier: 400,
    };

    const capped = __hotlineServiceTestHooks.capMegaFreeGameSettlement(
      features,
      true,
      baseAmount,
      stakeAmount,
      2,
    );

    expect(capped.payout.lessThanOrEqualTo(stakeAmount.mul(2.5))).toBe(true);
    expect(capped.multiplier.lessThanOrEqualTo(2.5)).toBe(true);
    expect(capped.features.totalMultiplier).toBeLessThanOrEqual(250);
    expect(capped.features.freeSpinWinMultiplier).toBe(capped.features.totalMultiplier);
  });
});
