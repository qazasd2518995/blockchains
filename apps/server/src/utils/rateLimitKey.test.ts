import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { authenticatedRateLimitKey } from './rateLimitKey.js';

describe('authenticatedRateLimitKey', () => {
  it('separates authenticated players behind the same IP', () => {
    const verify = vi.fn((token: string) => ({ sub: token, role: 'PLAYER' }));

    expect(
      authenticatedRateLimitKey(
        { ip: '203.0.113.10', headers: { authorization: 'Bearer player-a' } } as never,
        verify,
      ),
    ).toBe('player:player-a');
    expect(
      authenticatedRateLimitKey(
        { ip: '203.0.113.10', headers: { authorization: 'Bearer player-b' } } as never,
        verify,
      ),
    ).toBe('player:player-b');
  });

  it('keeps admins in a separate authenticated bucket', () => {
    expect(
      authenticatedRateLimitKey(
        { ip: '203.0.113.10', headers: { authorization: 'Bearer admin-token' } } as never,
        () => ({ sub: 'agent-1', aud: 'admin' }),
      ),
    ).toBe('admin:agent-1');
  });

  it('falls back to the IP for missing, invalid, or expired tokens', () => {
    const request = {
      ip: '203.0.113.10',
      headers: { authorization: 'Bearer invalid' },
    } as never;
    expect(
      authenticatedRateLimitKey(request, () => {
        throw new Error('invalid signature');
      }),
    ).toBe('ip:203.0.113.10');
    expect(
      authenticatedRateLimitKey({ ip: '203.0.113.10', headers: {} } as never, vi.fn()),
    ).toBe('ip:203.0.113.10');
  });

  it('keeps valid JWT users independent in the real Fastify request lifecycle', async () => {
    const server = Fastify();
    await server.register(jwt, { secret: 'test-secret-that-is-at-least-32-bytes' });
    await server.register(rateLimit, {
      max: 1,
      timeWindow: '1 minute',
      keyGenerator: (request) =>
        authenticatedRateLimitKey(request, (token) => server.jwt.verify(token)),
    });
    server.get('/private', { preHandler: [(request) => request.jwtVerify()] }, async () => ({
      ok: true,
    }));

    const playerA = server.jwt.sign({ sub: 'player-a', role: 'PLAYER' });
    const playerB = server.jwt.sign({ sub: 'player-b', role: 'PLAYER' });
    const request = (token: string) =>
      server.inject({ method: 'GET', url: '/private', headers: { authorization: `Bearer ${token}` } });

    await expect(request(playerA).then((response) => response.statusCode)).resolves.toBe(200);
    await expect(request(playerB).then((response) => response.statusCode)).resolves.toBe(200);
    await expect(request(playerA).then((response) => response.statusCode)).resolves.toBe(429);
    await server.close();
  });
});
