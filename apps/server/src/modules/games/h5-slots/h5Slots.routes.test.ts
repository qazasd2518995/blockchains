import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import {
  H5_FISH_FREEZE_DURATION_MS,
  getH5BuyFreeCostMultiplier,
  getH5EnhancedBetMultiplier,
  getH5FishFreezeSkillCost,
  h5SlotsRoutes,
} from './h5Slots.routes.js';

function makeRouteRegistrar() {
  const authenticate = vi.fn();
  const addHook = vi.fn();
  const findUnique = vi.fn();
  const fastify = {
    prisma: { user: { findUnique } },
    authenticate,
    addHook,
    get: vi.fn(),
    post: vi.fn(),
  } as unknown as FastifyInstance;
  return { fastify, authenticate, addHook, findUnique };
}

describe('H5 slot test-account access', () => {
  it('reuses the identity already loaded by authentication', async () => {
    const { fastify, authenticate, addHook, findUnique } = makeRouteRegistrar();
    await h5SlotsRoutes(fastify);

    expect(addHook).toHaveBeenNthCalledWith(1, 'preHandler', authenticate);
    const accessGate = addHook.mock.calls[1]![1] as (request: {
      authenticatedUsername: string;
      authenticatedFrozen: boolean;
    }) => Promise<void>;
    await expect(
      accessGate({ authenticatedUsername: 'testplayer4', authenticatedFrozen: false }),
    ).resolves.toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('keeps non-test and frozen accounts blocked without another user lookup', async () => {
    const { fastify, addHook, findUnique } = makeRouteRegistrar();
    await h5SlotsRoutes(fastify);
    const accessGate = addHook.mock.calls[1]![1] as (request: {
      authenticatedUsername: string;
      authenticatedFrozen: boolean;
    }) => Promise<void>;

    await expect(
      accessGate({ authenticatedUsername: 'regular-member', authenticatedFrozen: false }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      accessGate({ authenticatedUsername: 'testplayer', authenticatedFrozen: true }),
    ).rejects.toMatchObject({ code: 'MEMBER_FROZEN' });
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('H5 slot buy-free pricing', () => {
  it('matches the prices shown by Caishen Wins and Gates of Olympus', () => {
    expect(getH5BuyFreeCostMultiplier('278')).toBe(50);
    expect(getH5BuyFreeCostMultiplier('321')).toBe(75);
  });

  it('does not treat Fortune Gems enhanced betting as a free-spin purchase', () => {
    expect(getH5BuyFreeCostMultiplier('302')).toBeUndefined();
    expect(getH5EnhancedBetMultiplier('302')).toBe(1.5);
    expect(getH5EnhancedBetMultiplier('278')).toBeUndefined();
  });
});

describe('H5 fish skill pricing', () => {
  it('charges the original 10x room bet for freeze in every imported fish game', () => {
    expect(getH5FishFreezeSkillCost('2')).toBe(100);
    expect(getH5FishFreezeSkillCost('12')).toBe(100);
    expect(getH5FishFreezeSkillCost('13')).toBe(100);
    expect(getH5FishFreezeSkillCost('14')).toBe(100);
    expect(H5_FISH_FREEZE_DURATION_MS).toBe(5_000);
  });

  it('does not expose fish skills in slot scenes', () => {
    expect(getH5FishFreezeSkillCost('113')).toBeUndefined();
    expect(getH5FishFreezeSkillCost('278')).toBeUndefined();
  });
});
