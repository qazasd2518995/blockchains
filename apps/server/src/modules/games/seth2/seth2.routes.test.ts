import type { FastifyInstance } from 'fastify';
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
    const { fastify, authenticate, addHook, findUnique } = makeRouteRegistrar();
    await seth2Routes(fastify);

    expect(addHook).toHaveBeenNthCalledWith(1, 'preHandler', authenticate);
    const accessGate = addHook.mock.calls[1]![1] as (request: {
      authenticatedUsername: string;
    }) => void;
    expect(() => accessGate({ authenticatedUsername: username })).not.toThrow();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it.each(['memberA', 'admin', 'testplayer7', 'testplayer25'])(
    'blocks %s before any Seth endpoint',
    async (username) => {
      const { fastify, addHook, findUnique } = makeRouteRegistrar();
      await seth2Routes(fastify);

      const accessGate = addHook.mock.calls[1]![1] as (request: {
        authenticatedUsername: string;
      }) => void;
      expect(() => accessGate({ authenticatedUsername: username })).toThrowError(
        expect.objectContaining({ code: 'FORBIDDEN' }),
      );
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it('rejects a request whose authenticated identity has no username', async () => {
    const { fastify, addHook, findUnique } = makeRouteRegistrar();
    await seth2Routes(fastify);

    const accessGate = addHook.mock.calls[1]![1] as (request: {
      authenticatedUsername?: string;
    }) => void;
    expect(() => accessGate({})).toThrowError(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(findUnique).not.toHaveBeenCalled();
  });
});
