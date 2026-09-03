import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  checkLockedUserFunds,
  getLockedGameUser,
  lockUserAndCheckFunds,
  type LockedGameUser,
} from './BaseGameService.js';

function lockedUser(overrides: Partial<LockedGameUser> = {}): LockedGameUser {
  return {
    id: 'user-1',
    username: 'player',
    agentId: null,
    balance: new Prisma.Decimal(1_000),
    displayName: 'Player',
    disabledAt: null,
    frozenAt: null,
    bettingLimits: {},
    bettingLimitLevel: 'range_10_5000',
    ...overrides,
  };
}

describe('checkLockedUserFunds', () => {
  it('validates a Seth base bet on an already locked user without treating the zero debit as the bet', () => {
    expect(() =>
      checkLockedUserFunds(lockedUser(), new Prisma.Decimal(0), 'seth2', {
        limitAmounts: [new Prisma.Decimal(18)],
      }),
    ).not.toThrow();
  });

  it('keeps betting-limit validation when the second database lock is skipped', () => {
    expect(() =>
      checkLockedUserFunds(lockedUser(), new Prisma.Decimal(0), 'seth2', {
        limitAmounts: [new Prisma.Decimal(1)],
      }),
    ).toThrowError(expect.objectContaining({ code: 'BET_OUT_OF_RANGE' }));
  });

  it('keeps frozen-member checks on the in-memory validation path', () => {
    expect(() =>
      checkLockedUserFunds(
        lockedUser({ frozenAt: new Date('2026-09-03T00:00:00Z') }),
        new Prisma.Decimal(0),
        'seth2',
        { limitAmounts: [new Prisma.Decimal(18)] },
      ),
    ).toThrowError(expect.objectContaining({ code: 'MEMBER_FROZEN' }));
  });

  it('reuses the member snapshot inside the same settlement transaction', async () => {
    const user = lockedUser();
    const tx = { $queryRaw: vi.fn(async () => [user]) };

    await lockUserAndCheckFunds(
      tx as unknown as Prisma.TransactionClient,
      user.id,
      new Prisma.Decimal(18),
      'seth2',
    );

    expect(getLockedGameUser(tx as unknown as Prisma.TransactionClient, user.id)).toBe(user);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
