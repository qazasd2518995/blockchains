import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { seth2Routes } from './seth2.routes.js';

function makeRouteRegistrar(username: string | null) {
  const authenticate = vi.fn();
  const addHook = vi.fn();
  const findUnique = vi.fn(async () => (username === null ? null : { username }));
  const fastify = {
    prisma: { user: { findUnique } },
    authenticate,
    addHook,
    get: vi.fn(),
    post: vi.fn(),
  } as unknown as FastifyInstance;
  return { fastify, authenticate, addHook, findUnique };
}

describe('Seth 2 test-account access', () => {
  it.each([
    'testplayer',
    'testplayer1',
    'testplayer2',
    'testplayer3',
    'testplayer4',
    'testplayer5',
    'testplayer6',
    ' TestPlayer3 ',
  ])('allows %s through the route-level access gate', async (username) => {
    const { fastify, authenticate, addHook } = makeRouteRegistrar(username);
    await seth2Routes(fastify);

    expect(addHook).toHaveBeenNthCalledWith(1, 'preHandler', authenticate);
    const accessGate = addHook.mock.calls[1]![1] as (request: { userId: string }) => Promise<void>;
    await expect(accessGate({ userId: 'user-1' })).resolves.toBeUndefined();
  });

  it.each(['memberA', 'admin', 'testplayer7', 'testplayer25'])(
    'blocks %s before any Seth endpoint',
    async (username) => {
      const { fastify, addHook, findUnique } = makeRouteRegistrar(username);
      await seth2Routes(fastify);

      const accessGate = addHook.mock.calls[1]![1] as (request: {
        userId: string;
      }) => Promise<void>;
      await expect(accessGate({ userId: 'regular-user' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 'regular-user' },
        select: { username: true },
      });
    },
  );

  it('rejects a stale authenticated user that no longer exists', async () => {
    const { fastify, addHook } = makeRouteRegistrar(null);
    await seth2Routes(fastify);

    const accessGate = addHook.mock.calls[1]![1] as (request: { userId: string }) => Promise<void>;
    await expect(accessGate({ userId: 'missing-user' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
