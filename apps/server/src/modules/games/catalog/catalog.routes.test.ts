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
  it('returns Seth, Fruit Mary, H5 and MegaSlot games to test players', async () => {
    const registration = registrar('testplayer6');
    await gameCatalogRoutes(registration.fastify);
    const result = (await registration.readHandler()?.({ userId: 'test-user' })) as {
      games: Array<{ id: string }>;
    };
    const ids = new Set(result.games.map((game) => game.id));

    expect(ids.has('storm-of-seth-2')).toBe(true);
    expect(ids.has('fruit-mary')).toBe(true);
    expect(ids.has('h5-mahjong-ways-2')).toBe(true);
    expect(ids.has('nebula-slot')).toBe(true);
  });

  it('does not leak test-only imported games to regular members', async () => {
    const registration = registrar('regular-member');
    await gameCatalogRoutes(registration.fastify);
    const result = (await registration.readHandler()?.({ userId: 'member-user' })) as {
      games: Array<{ id: string; restricted: boolean }>;
    };

    expect(result.games.length).toBeGreaterThan(0);
    expect(result.games.every((game) => game.restricted === false)).toBe(true);
    expect(result.games.some((game) => game.id === 'storm-of-seth-2')).toBe(false);
    expect(result.games.some((game) => game.id.startsWith('h5-'))).toBe(false);
  });
});
