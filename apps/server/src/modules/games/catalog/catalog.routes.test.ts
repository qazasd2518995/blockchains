import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { gameCatalogRoutes } from './catalog.routes.js';

function registrar(username: string, role = 'PLAYER') {
  let handler: ((request: { userId: string }) => Promise<unknown>) | undefined;
  const get = vi.fn((_path, _options, routeHandler) => {
    handler = routeHandler;
  });
  const findUnique = vi.fn(async () => ({ username, role, disabledAt: null }));
  const fastify = {
    authenticate: vi.fn(),
    get,
    prisma: { user: { findUnique } },
  } as unknown as FastifyInstance;
  return { fastify, findUnique, readHandler: () => handler };
}

describe('new casino game catalog', () => {
  it.each([
    'testplayer',
    'testplayer1',
    'testplayer2',
    'testplayer3',
    'testplayer4',
    'testplayer5',
    'testplayer6',
  ])('returns Thor, Seth, Fruit Mary, H5 and MegaSlot games to %s', async (username) => {
    const registration = registrar(username);
    await gameCatalogRoutes(registration.fastify);
    const result = (await registration.readHandler()?.({ userId: 'test-user' })) as {
      games: Array<{ id: string }>;
    };
    const ids = new Set(result.games.map((game) => game.id));

    expect(ids.has('power-of-thor-2')).toBe(true);
    expect(ids.has('storm-of-seth-2')).toBe(true);
    expect(ids.has('fruit-mary')).toBe(true);
    expect(ids.has('h5-mahjong-ways-2')).toBe(true);
    expect(ids.has('nebula-slot')).toBe(true);
  });

  it('does not expose any new-casino games to regular members', async () => {
    const registration = registrar('regular-member');
    await gameCatalogRoutes(registration.fastify);
    const result = (await registration.readHandler()?.({ userId: 'member-user' })) as {
      games: Array<{ id: string; restricted: boolean }>;
    };

    expect(result.games).toEqual([]);
  });
});
