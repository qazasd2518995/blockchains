import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { seth2Routes } from './seth2.routes.js';

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

describe('Seth 2 member access', () => {
  it.each([
    'testplayer',
    'testplayer1',
    'testplayer2',
    'testplayer3',
    'testplayer4',
    'testplayer5',
    'testplayer6',
    ' TestPlayer3 ',
    'memberA',
    'custom-created-member',
  ])('allows %s through the route-level access gate', async (username) => {
    const { fastify, authenticate, addHook, findUnique } = makeRouteRegistrar();
    await seth2Routes(fastify, { platformRealm: 'qmoney' });

    expect(addHook).toHaveBeenNthCalledWith(1, 'preHandler', authenticate);
    const accessGate = addHook.mock.calls[1]![1] as (request: {
      authenticatedUsername: string;
    }) => Promise<void>;
    await expect(accessGate({ authenticatedUsername: username })).resolves.toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects a request whose authenticated identity has no username', async () => {
    const { fastify, addHook, findUnique } = makeRouteRegistrar();
    await seth2Routes(fastify, { platformRealm: 'qmoney' });

    const accessGate = addHook.mock.calls[1]![1] as (request: {
      authenticatedUsername?: string;
    }) => Promise<void>;
    await expect(accessGate({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('completes the real Fastify preHandler chain', async () => {
    const fastify = Fastify();
    fastify.decorate('prisma', {} as FastifyInstance['prisma']);
    fastify.decorate('authenticate', async (request) => {
      request.userId = 'test-user';
      request.authenticatedUsername = 'testplayer';
    });

    try {
      await fastify.register(seth2Routes);
      const response = await fastify.inject({
        method: 'POST',
        url: '/protocol',
        payload: { type: 'ping' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ type: 'pong' });
    } finally {
      await fastify.close();
    }
  });
});
