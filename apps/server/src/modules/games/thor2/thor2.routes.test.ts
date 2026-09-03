import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { thor2Routes } from './thor2.routes.js';

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

describe('Thor 2 member access', () => {
  it('reuses the username already loaded by authentication', async () => {
    const { fastify, authenticate, addHook, findUnique } = makeRouteRegistrar();
    await thor2Routes(fastify, { platformRealm: 'qmoney' });

    expect(addHook).toHaveBeenNthCalledWith(1, 'preHandler', authenticate);
    const accessGate = addHook.mock.calls[1]![1] as (request: {
      authenticatedUsername: string;
    }) => Promise<void>;
    await expect(
      accessGate({ authenticatedUsername: 'custom-created-member' }),
    ).resolves.toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('blocks a missing member identity without another user lookup', async () => {
    const { fastify, addHook, findUnique } = makeRouteRegistrar();
    await thor2Routes(fastify, { platformRealm: 'qmoney' });
    const accessGate = addHook.mock.calls[1]![1] as (request: {
      authenticatedUsername: string;
    }) => Promise<void>;

    await expect(accessGate({ authenticatedUsername: '' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(findUnique).not.toHaveBeenCalled();
  });
});
