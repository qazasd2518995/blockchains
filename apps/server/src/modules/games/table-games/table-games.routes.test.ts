import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { BACCARAT_TABLE_GAME_IDS, LOCAL_TABLE_GAME_IDS } from '@bg/shared';
import { baccaratRoutes } from '../baccarat/baccarat.routes.js';
import { baccaratBetSchema } from '../baccarat/baccarat.schema.js';
import { tableGamesRoutes } from './table-games.routes.js';
import { localTableBetSchema } from './table-games.schema.js';

function makeRouteRegistrar(): {
  fastify: FastifyInstance;
  authenticate: ReturnType<typeof vi.fn>;
  addHook: ReturnType<typeof vi.fn>;
} {
  const authenticate = vi.fn();
  const addHook = vi.fn();
  const fastify = {
    prisma: {},
    authenticate,
    addHook,
    get: vi.fn(),
    post: vi.fn(),
  } as unknown as FastifyInstance;
  return { fastify, authenticate, addHook };
}

describe('public table game route access', () => {
  it.each([
    ['local table', tableGamesRoutes],
    ['baccarat table', baccaratRoutes],
  ])('keeps authentication as the only %s API access gate', async (_label, registerRoutes) => {
    const { fastify, authenticate, addHook } = makeRouteRegistrar();

    await registerRoutes(fastify);

    expect(addHook).toHaveBeenCalledTimes(1);
    expect(addHook).toHaveBeenCalledWith('preHandler', authenticate);
  });

  it('accepts valid bet payloads for every released table game', () => {
    for (const gameId of LOCAL_TABLE_GAME_IDS) {
      expect(localTableBetSchema.safeParse({ gameId, amount: 100 }).success).toBe(true);
    }
    for (const gameId of BACCARAT_TABLE_GAME_IDS) {
      expect(baccaratBetSchema.safeParse({ gameId, amount: 100, side: 'player' }).success).toBe(
        true,
      );
    }
  });
});
